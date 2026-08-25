import { applyCrop, type Rect } from "@/lib/crop";
import type { Annotation, RedactAnnotation } from "@/types/annotation";

export interface NumberedAnnotation {
  n: number;
  annotation: Annotation;
}

/**
 * Timeline order = creation order. The same list drives the timeline, the
 * prompt, the canvas pins and the export.
 *
 * Redactions are excluded here, once, so every one of those surfaces skips
 * them together: a redaction says "these pixels are gone", which is not a note
 * to number, and numbering it would leave a pin and a legend row pointing at
 * the region the user hid.
 */
export function numberAnnotations(annotations: Annotation[]): NumberedAnnotation[] {
  return annotations
    .filter((annotation) => annotation.tool !== "redact")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((annotation, index) => ({ n: index + 1, annotation }));
}

/**
 * The annotations it is safe to map back onto the live page. Redactions are
 * filtered out here, in the lib, rather than at the one call site: reading the
 * element under one would put its selector, and up to 80 characters of its
 * text, into the very prompts the redaction exists to keep it out of, so a
 * future inspection call site must not be able to leak by default.
 */
export function inspectableAnnotations(annotations: Annotation[]): Annotation[] {
  return annotations.filter((annotation) => annotation.tool !== "redact");
}

/** The other half of that split: the redactions, in creation order. */
export function redactions(annotations: Annotation[]): RedactAnnotation[] {
  return annotations
    .filter((annotation): annotation is RedactAnnotation => annotation.tool === "redact")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Pin radius in image px: readable on a phone-width capture, not absurd on a 4K one. */
export function pinRadius(imageWidth: number): number {
  return Math.min(28, Math.max(14, Math.round(imageWidth / 60)));
}

/**
 * Scale factor for fixed-px-in-image-space affordances (resize handles, the
 * inline comment editor) that are not annotation geometry, so they stay a
 * sane on-screen size in fit mode instead of shrinking with the image.
 * Same clamp curve as `pinRadius`, normalised to 1 at 1200px.
 */
export function canvasScale(imageWidth: number): number {
  return pinRadius(imageWidth) / 20;
}

/**
 * Where the pin sits: top-left corner of a box or a highlight, the arrow tail,
 * the text baseline start, the top-left of a pen stroke's bounds.
 */
export function pinAnchor(annotation: Annotation): { x: number; y: number } {
  if (annotation.tool === "arrow") return { x: annotation.x1, y: annotation.y1 };
  if (annotation.tool === "pen") {
    const { x, y } = annotationBounds(annotation);
    return { x, y };
  }
  return { x: annotation.x, y: annotation.y };
}

/**
 * The point an annotation means, for mapping it back onto the live page: the
 * centre of whatever it covers (a box, a highlight, a pen stroke's bounds),
 * and for an arrow or a text label the point their pin sits on, which is what
 * they point at.
 */
export function inspectAnchor(annotation: Annotation): { x: number; y: number } {
  if (annotation.tool === "box" || annotation.tool === "highlight" || annotation.tool === "pen") {
    const { x, y, width, height } = annotationBounds(annotation);
    return { x: x + width / 2, y: y + height / 2 };
  }
  return pinAnchor(annotation);
}

/**
 * The rectangle an annotation occupies on the capture. Text has no measurable
 * box here, so it is estimated from its length and drawn baseline; a pen
 * stroke's is the extent of its points (an empty one has no extent, so it gets
 * a zero rect rather than the `Infinity` a bare `Math.min` of nothing yields).
 */
export function annotationBounds(annotation: Annotation): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (
    annotation.tool === "box" ||
    annotation.tool === "redact" ||
    annotation.tool === "highlight"
  ) {
    const { x, y, width, height } = annotation;
    return { x, y, width, height };
  }

  if (annotation.tool === "arrow") {
    const x = Math.min(annotation.x1, annotation.x2);
    const y = Math.min(annotation.y1, annotation.y2);
    return {
      x,
      y,
      width: Math.abs(annotation.x2 - annotation.x1),
      height: Math.abs(annotation.y2 - annotation.y1)
    };
  }

  if (annotation.tool === "pen") {
    if (annotation.points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
    const xs = annotation.points.map((point) => point.x);
    const ys = annotation.points.map((point) => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
  }

  return { x: annotation.x, y: annotation.y - 18, width: annotation.text.length * 10, height: 22 };
}

/**
 * Human-readable position of an annotation in image px plus % of page, for
 * the prompt's per-annotation line. Pure so it can be unit tested apart from
 * the builders that call it.
 */
export function describeGeometry(a: Annotation, image: { width: number; height: number }): string {
  const pct = (x: number, y: number) =>
    `[${Math.round((100 * x) / image.width)}%, ${Math.round((100 * y) / image.height)}% of page]`;

  if (a.tool === "box" || a.tool === "highlight") {
    return `at (${Math.round(a.x)}, ${Math.round(a.y)}) size ${Math.round(a.width)}x${Math.round(a.height)} px ${pct(a.x, a.y)}`;
  }
  if (a.tool === "arrow") {
    return `from (${Math.round(a.x1)}, ${Math.round(a.y1)}) to (${Math.round(a.x2)}, ${Math.round(a.y2)}) px`;
  }
  if (a.tool === "pen") {
    // Endpoints plus a count: the whole path would be unreadable in a prompt,
    // and the bounds (which is what the % refers to) is where to look on the
    // image. The sidecar carries the same rect for anything that needs it.
    const first = a.points[0] ?? { x: 0, y: 0 };
    const last = a.points[a.points.length - 1] ?? first;
    const bounds = annotationBounds(a);
    return `pen path of ${a.points.length} points from (${Math.round(first.x)}, ${Math.round(first.y)}) to (${Math.round(last.x)}, ${Math.round(last.y)}) px ${pct(bounds.x, bounds.y)}`;
  }
  return `at (${Math.round(a.x)}, ${Math.round(a.y)}) px`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * The pin's centre: its anchor pulled inside the image by its own radius, so a
 * pin on an annotation drawn at the very edge is never clipped. Shared by the
 * canvas and the export so the two cannot drift apart.
 */
export function pinCenter(
  annotation: Annotation,
  r: number,
  image: { width: number; height: number }
): { x: number; y: number } {
  const anchor = pinAnchor(annotation);
  return {
    x: clamp(anchor.x, r, image.width - r),
    y: clamp(anchor.y, r, image.height - r)
  };
}

/** One pin, ready to draw on the canvas overlay. */
export interface ViewPin {
  n: number;
  /** Centre in CAPTURE space, whatever region the canvas is showing. */
  center: { x: number; y: number };
}

/**
 * The pins exactly as the exports will draw them, translated back into capture
 * space so the canvas overlay - which keeps the full image's viewBox even when
 * a crop is applied - can draw them without deriving a second numbering.
 *
 * With no crop this is the plain annotation list: the editor numbers
 * everything it holds, including anything an export would later drop. With a
 * crop applied the canvas has to agree with the export instead, so the list,
 * the numbering, the pin radius and the clamp all come from the crop:
 * `applyCrop` renumbers the survivors, `pinRadius` follows the crop's width,
 * and `pinCenter` clamps against the crop's own canvas before the result is
 * shifted back by the crop origin. Without that, an anchor a couple of px
 * inside the crop edge drew half-clipped on the canvas and clamped a full
 * radius inside it in the PNG.
 *
 * An annotation the crop dropped has no entry, so it gets no pin - the same
 * thing the export does with it.
 */
export function viewPins(
  annotations: Annotation[],
  crop: Rect | null,
  image: { width: number; height: number }
): { radius: number; pins: Map<string, ViewPin> } {
  const source = crop ? applyCrop(annotations, crop) : annotations;
  const bounds = crop ? { width: crop.width, height: crop.height } : image;
  const origin = crop ?? { x: 0, y: 0 };
  const radius = pinRadius(bounds.width);

  const pins = new Map<string, ViewPin>();
  for (const { n, annotation } of numberAnnotations(source)) {
    const center = pinCenter(annotation, radius, bounds);
    pins.set(annotation.id, {
      n,
      center: { x: center.x + origin.x, y: center.y + origin.y }
    });
  }
  return { radius, pins };
}
