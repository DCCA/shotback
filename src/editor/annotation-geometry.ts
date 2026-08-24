import type { Annotation } from "@/types/annotation";

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function moveAnnotation(annotation: Annotation, dx: number, dy: number): Annotation {
  if (annotation.tool === "box") {
    return { ...annotation, x: annotation.x + dx, y: annotation.y + dy };
  }

  if (annotation.tool === "arrow") {
    return {
      ...annotation,
      x1: annotation.x1 + dx,
      y1: annotation.y1 + dy,
      x2: annotation.x2 + dx,
      y2: annotation.y2 + dy
    };
  }

  return { ...annotation, x: annotation.x + dx, y: annotation.y + dy };
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
  if (annotation.tool === "box") {
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

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function shareLabel(pageUrl: string): string {
  try {
    return new URL(pageUrl).hostname || pageUrl;
  } catch {
    return pageUrl || "(unknown page)";
  }
}
