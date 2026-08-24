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

/** Where the pin sits: top-left corner of a box, the arrow tail, the text baseline start. */
export function pinAnchor(annotation: Annotation): { x: number; y: number } {
  if (annotation.tool === "arrow") return { x: annotation.x1, y: annotation.y1 };
  return { x: annotation.x, y: annotation.y };
}

/**
 * The point an annotation means, for mapping it back onto the live page: the
 * centre of a box (what it frames), the tail of an arrow and the start of a
 * text label (where their pin sits, which is what they point at).
 */
export function inspectAnchor(annotation: Annotation): { x: number; y: number } {
  if (annotation.tool === "box") {
    return { x: annotation.x + annotation.width / 2, y: annotation.y + annotation.height / 2 };
  }
  return pinAnchor(annotation);
}

/**
 * The rectangle an annotation occupies on the capture. Text has no measurable
 * box here, so it is estimated from its length and drawn baseline.
 */
export function annotationBounds(annotation: Annotation): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (annotation.tool === "box" || annotation.tool === "redact") {
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

  if (a.tool === "box") {
    return `at (${Math.round(a.x)}, ${Math.round(a.y)}) size ${Math.round(a.width)}x${Math.round(a.height)} px ${pct(a.x, a.y)}`;
  }
  if (a.tool === "arrow") {
    return `from (${Math.round(a.x1)}, ${Math.round(a.y1)}) to (${Math.round(a.x2)}, ${Math.round(a.y2)}) px`;
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
