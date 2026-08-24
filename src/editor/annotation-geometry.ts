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
