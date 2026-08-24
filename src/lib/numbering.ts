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

/** Where the pin sits: top-left corner of a box, the arrow tail, the text baseline start. */
export function pinAnchor(annotation: Annotation): { x: number; y: number } {
  if (annotation.tool === "arrow") return { x: annotation.x1, y: annotation.y1 };
  return { x: annotation.x, y: annotation.y };
}
