import { clampCrop, type Rect } from "@/lib/crop";
import { noteText } from "@/lib/feedback";
import { numberAnnotations, pinCenter, pinRadius, redactions } from "@/lib/numbering";
import type { Annotation, RedactAnnotation } from "@/types/annotation";

export const MAX_EXPORT_CANVAS_HEIGHT = 16384;
export const MAX_EXPORT_CANVAS_AREA = 268000000;

export type FeedbackRenderMode = "footer" | "overlay";

/**
 * Edge of one pixelation block, in image px. Big enough that a block spans
 * several glyph strokes at normal capture scale, so what it replaces cannot be
 * read back out of it.
 */
const REDACT_BLOCK_SIZE = 12;

/**
 * Destroy the pixels under one redaction: the region is squashed onto a buffer
 * of one pixel per block and stretched straight back over itself, so what
 * lands on the canvas is one resampled value per block and the original is
 * gone from it.
 *
 * Clamped to the canvas because the region is drawn by hand and can hang off
 * the edge, and skipped when it has no area - `drawImage` throws on a
 * zero-sized source rect, and there is nothing to hide in one anyway.
 */
function pixelateRegion(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  region: RedactAnnotation,
  size: { width: number; height: number }
): void {
  const x = Math.max(0, Math.floor(region.x));
  const y = Math.max(0, Math.floor(region.y));
  const width = Math.min(Math.ceil(region.x + region.width), size.width) - x;
  const height = Math.min(Math.ceil(region.y + region.height), size.height) - y;
  if (width <= 0 || height <= 0) return;

  const blocksWide = Math.ceil(width / REDACT_BLOCK_SIZE);
  const blocksHigh = Math.ceil(height / REDACT_BLOCK_SIZE);

  const buffer = document.createElement("canvas");
  buffer.width = blocksWide;
  buffer.height = blocksHigh;
  const bufferCtx = buffer.getContext("2d");
  if (!bufferCtx) throw new Error("Failed to create canvas context");

  // On, and asked to be good about it: the default downscale samples a couple
  // of neighbours per output pixel, which can carry one original pixel through
  // almost intact. "high" makes the browser weigh the whole block instead, so
  // a block is a summary of what it replaced rather than a sample of it.
  bufferCtx.imageSmoothingEnabled = true;
  bufferCtx.imageSmoothingQuality = "high";
  bufferCtx.drawImage(canvas, x, y, width, height, 0, 0, blocksWide, blocksHigh);
  // Off for the way back, or the blocks interpolate into a blur that still
  // carries the shape of what was under them.
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(buffer, 0, 0, blocksWide, blocksHigh, x, y, width, height);
  ctx.imageSmoothingEnabled = true;
}

export function selectFeedbackRenderMode(params: {
  imageWidth: number;
  imageHeight: number;
  footerHeight: number;
  maxCanvasHeight?: number;
  maxCanvasArea?: number;
}): FeedbackRenderMode {
  const maxCanvasHeight = params.maxCanvasHeight ?? MAX_EXPORT_CANVAS_HEIGHT;
  const maxCanvasArea = params.maxCanvasArea ?? MAX_EXPORT_CANVAS_AREA;
  const targetHeight = params.imageHeight + params.footerHeight;
  const targetArea = params.imageWidth * targetHeight;

  if (targetHeight > maxCanvasHeight || targetArea > maxCanvasArea) {
    return "overlay";
  }

  return "footer";
}

/**
 * The three corners of an arrow's head, tip first. Shared with the canvas, which
 * draws the same head as an SVG polygon, so on-screen and exported arrows match.
 */
export function arrowHeadPoints(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): { x: number; y: number }[] {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = 10;

  return [
    { x: x2, y: y2 },
    {
      x: x2 - size * Math.cos(angle - Math.PI / 6),
      y: y2 - size * Math.sin(angle - Math.PI / 6)
    },
    {
      x: x2 - size * Math.cos(angle + Math.PI / 6),
      y: y2 - size * Math.sin(angle + Math.PI / 6)
    }
  ];
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string
): void {
  const [tip, left, right] = arrowHeadPoints(x1, y1, x2, y2);

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(left.x, left.y);
  ctx.lineTo(right.x, right.y);
  ctx.closePath();
  ctx.fill();
}

/** Numbered pin: the only thing that ties a marked area to its note in the footer legend. */
function drawPin(
  ctx: CanvasRenderingContext2D,
  n: number,
  x: number,
  y: number,
  r: number,
  color: string
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = Math.max(2, r / 7);
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${Math.round(r * 1.15)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(n), x, y + r * 0.05);
  ctx.restore();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = words[0];

  for (let i = 1; i < words.length; i += 1) {
    const next = `${current} ${words[i]}`;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
    } else {
      lines.push(current);
      current = words[i];
    }
  }

  lines.push(current);
  return lines;
}

function withEllipsis(text: string): string {
  return text.length > 3 ? `${text.slice(0, text.length - 3)}...` : "...";
}

/** One rendered line of the notes block: a legend line, its wrapped tail, or a sub-heading. */
interface NoteRow {
  text: string;
  /** Present on the first line of an annotation's note; draws the matching pin. */
  pin?: { n: number; color: string };
  bold?: boolean;
}

function buildNoteRows(params: {
  ctx: CanvasRenderingContext2D;
  annotations: Annotation[];
  generalFeedback: string;
  maxTextWidth: number;
  fontSize: number;
}): NoteRow[] {
  const { ctx, annotations, generalFeedback, maxTextWidth, fontSize } = params;
  const rows: NoteRow[] = [];

  ctx.font = `${fontSize}px sans-serif`;
  // Every numbered annotation gets a legend row, placeholder included, so no
  // pin on the image is missing from the list. `noteText` is the prompt's, so
  // the two wordings cannot drift.
  for (const { n, annotation } of numberAnnotations(annotations)) {
    wrapText(ctx, noteText(annotation), maxTextWidth).forEach((line, index) => {
      rows.push(index === 0 ? { text: line, pin: { n, color: annotation.color } } : { text: line });
    });
  }

  if (generalFeedback) {
    // Worth a sub-heading only when there are annotation rows above it to
    // separate it from; alone under "Notes" it would be a second heading.
    if (rows.length > 0) rows.push({ text: "General feedback", bold: true });
    for (const line of wrapText(ctx, generalFeedback, maxTextWidth)) {
      rows.push({ text: line });
    }
  }

  return rows;
}

interface NotesLayout {
  fontSize: number;
  lineHeight: number;
  titleHeight: number;
  padding: number;
  gutter: number;
  legendPinRadius: number;
}

function notesLayout(imageWidth: number): NotesLayout {
  const fontSize = Math.round(pinRadius(imageWidth) * 0.9);
  const legendPinRadius = Math.round(pinRadius(imageWidth) * 0.6);
  return {
    fontSize,
    lineHeight: Math.round(fontSize * 1.5),
    titleHeight: Math.round(fontSize * 1.9),
    padding: fontSize,
    gutter: legendPinRadius * 2 + Math.round(fontSize * 0.6),
    legendPinRadius
  };
}

function notesHeight(rows: NoteRow[], layout: NotesLayout): number {
  return (
    layout.padding * 2 + layout.fontSize + layout.titleHeight + rows.length * layout.lineHeight
  );
}

/** Draws the "Notes" title plus every row, pins included, from a top-left origin. */
function drawNotes(params: {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  rows: NoteRow[];
  layout: NotesLayout;
}): void {
  const { ctx, x, y, rows, layout } = params;

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#0f172a";
  ctx.font = `bold ${layout.fontSize}px sans-serif`;
  ctx.fillText("Notes", x, y);

  let textY = y + layout.titleHeight;
  for (const row of rows) {
    if (row.pin) {
      drawPin(
        ctx,
        row.pin.n,
        x + layout.legendPinRadius,
        textY - layout.fontSize * 0.35,
        layout.legendPinRadius,
        row.pin.color
      );
    }

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#1f2937";
    ctx.font = `${row.bold ? "bold " : ""}${layout.fontSize}px sans-serif`;
    ctx.fillText(row.text, x + layout.gutter, textY);
    textY += layout.lineHeight;
  }
}

function drawNotesFooter(params: {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  imageHeight: number;
  footerHeight: number;
  rows: NoteRow[];
  layout: NotesLayout;
}): void {
  const { ctx, canvas, imageHeight, footerHeight, rows, layout } = params;
  const top = imageHeight;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, top, canvas.width, footerHeight);
  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, top);
  ctx.lineTo(canvas.width, top);
  ctx.stroke();

  drawNotes({
    ctx,
    x: layout.padding,
    y: top + layout.padding + layout.fontSize,
    rows,
    layout
  });
}

function drawNotesOverlay(params: {
  ctx: CanvasRenderingContext2D;
  imageWidth: number;
  imageHeight: number;
  cardWidth: number;
  rows: NoteRow[];
  layout: NotesLayout;
}): void {
  const { ctx, imageHeight, cardWidth, layout } = params;
  const maxRows = 8;
  const rows = [...params.rows];
  if (rows.length > maxRows) {
    rows.splice(maxRows - 1, rows.length - (maxRows - 1), {
      ...rows[maxRows - 1],
      text: withEllipsis(rows[maxRows - 1].text)
    });
  }

  const cardHeight = notesHeight(rows, layout);
  const x = 12;
  const y = Math.max(12, imageHeight - cardHeight - 12);

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillRect(x, y, cardWidth, cardHeight);
  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, cardWidth, cardHeight);

  drawNotes({
    ctx,
    x: x + layout.padding,
    y: y + layout.padding + layout.fontSize,
    rows,
    layout
  });
}

/**
 * Rasterize the annotations onto the capture and return a PNG data URL.
 *
 * Redactions are burned in first, right on top of the base image, so the
 * returned PNG never holds the pixels they cover. That is the whole of the
 * redaction guarantee: every output is this data URL, so there is no second
 * path an unredacted capture could leave by.
 *
 * With `crop`, only that region of the capture is drawn, onto a canvas sized
 * to it. The annotations are drawn exactly as given: shifting them into crop
 * space is `applyCrop`'s job, done once by the caller so the image, the
 * prompts and the sidecar all describe the same list.
 */
export async function exportAnnotatedImage(
  baseDataUrl: string,
  annotations: Annotation[],
  options?: { generalFeedback?: string; crop?: Rect }
): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Failed to load base image"));
    i.src = baseDataUrl;
  });

  const generalFeedback = options?.generalFeedback?.trim() ?? "";
  // The region of the capture this export shows: the whole image, or the crop
  // clamped to what the capture actually has. Everything below sizes off
  // `size`, not off the loaded image.
  const source: Rect = options?.crop
    ? clampCrop(options.crop, img)
    : { x: 0, y: 0, width: img.width, height: img.height };
  const size = { width: source.width, height: source.height };

  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to create canvas context");

  const layout = notesLayout(size.width);
  const overlayCardWidth = Math.min(Math.max(260, size.width * 0.48), size.width - 24);
  const footerTextWidth = Math.max(200, size.width - layout.padding * 2 - layout.gutter);

  let rows = buildNoteRows({
    ctx,
    annotations,
    generalFeedback,
    maxTextWidth: footerTextWidth,
    fontSize: layout.fontSize
  });
  const footerHeight = rows.length > 0 ? notesHeight(rows, layout) : 0;
  const renderMode: FeedbackRenderMode =
    rows.length === 0
      ? "footer"
      : selectFeedbackRenderMode({
          imageWidth: size.width,
          imageHeight: size.height,
          footerHeight
        });

  if (rows.length > 0 && renderMode === "footer") {
    canvas.height = size.height + footerHeight;
  }

  if (renderMode === "overlay") {
    // The overlay card is narrower than the footer, so re-wrap to its width.
    rows = buildNoteRows({
      ctx,
      annotations,
      generalFeedback,
      maxTextWidth: Math.max(120, overlayCardWidth - layout.padding * 2 - layout.gutter),
      fontSize: layout.fontSize
    });
  }

  ctx.drawImage(
    img,
    source.x,
    source.y,
    source.width,
    source.height,
    0,
    0,
    source.width,
    source.height
  );

  // Straight after the base image and before a single mark is drawn: every
  // pin, shape and legend row lands on top of pixels that are already gone,
  // and every output - download, clipboard, cloud package, Claude Code PNG and
  // the saved share - is made from this one canvas.
  for (const region of redactions(annotations)) {
    pixelateRegion(ctx, canvas, region, size);
  }

  const r = pinRadius(size.width);
  const shapeLineWidth = Math.max(3, Math.round(r / 5));

  for (const { n, annotation } of numberAnnotations(annotations)) {
    ctx.strokeStyle = annotation.color;
    ctx.fillStyle = annotation.color;
    ctx.lineWidth = shapeLineWidth;

    if (annotation.tool === "box") {
      ctx.strokeRect(annotation.x, annotation.y, annotation.width, annotation.height);
    } else if (annotation.tool === "arrow") {
      ctx.beginPath();
      ctx.moveTo(annotation.x1, annotation.y1);
      ctx.lineTo(annotation.x2, annotation.y2);
      ctx.stroke();
      drawArrowHead(
        ctx,
        annotation.x1,
        annotation.y1,
        annotation.x2,
        annotation.y2,
        annotation.color
      );
    } else if (annotation.tool === "text") {
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.font = `${Math.round(r * 0.9)}px sans-serif`;
      ctx.fillText(annotation.text, annotation.x + r * 1.4, annotation.y);
    }

    const center = pinCenter(annotation, r, size);
    drawPin(ctx, n, center.x, center.y, r, annotation.color);
  }

  if (rows.length > 0) {
    if (renderMode === "footer") {
      drawNotesFooter({
        ctx,
        canvas,
        imageHeight: size.height,
        footerHeight,
        rows,
        layout
      });
    } else {
      drawNotesOverlay({
        ctx,
        imageWidth: size.width,
        imageHeight: size.height,
        cardWidth: overlayCardWidth,
        rows,
        layout
      });
    }
  }

  return canvas.toDataURL("image/png");
}
