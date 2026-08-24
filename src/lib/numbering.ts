import type { Annotation } from "@/types/annotation";

export interface NumberedAnnotation {
  n: number;
  annotation: Annotation;
}

/** Timeline order = creation order. The same list drives the timeline, the prompt, the canvas pins and the export. */
export function numberAnnotations(annotations: Annotation[]): NumberedAnnotation[] {
  return [...annotations]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((annotation, index) => ({ n: index + 1, annotation }));
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
