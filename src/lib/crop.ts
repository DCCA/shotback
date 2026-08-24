import type { Annotation } from "@/types/annotation";

/** A region of the capture, in image px. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Smaller than this and a crop is a mis-click, not a region worth exporting. */
export const MIN_CROP_SIZE = 24;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * A crop rect that is safe to draw with: whole px, at least `MIN_CROP_SIZE`
 * per side (or the image, when it is smaller than that), and fully inside the
 * image. Applied both where a crop is created (a drag can run past the edge of
 * the image) and again at export time, so a stored crop can never ask
 * `drawImage` for pixels the capture does not have.
 */
export function clampCrop(crop: Rect, image: { width: number; height: number }): Rect {
  const width = clamp(Math.round(crop.width), MIN_CROP_SIZE, image.width);
  const height = clamp(Math.round(crop.height), MIN_CROP_SIZE, image.height);
  return {
    x: clamp(Math.round(crop.x), 0, image.width - width),
    y: clamp(Math.round(crop.y), 0, image.height - height),
    width,
    height
  };
}

/**
 * Shift annotations from capture space into crop space, dropping whatever the
 * crop cut away. Pure, and the single place that rule lives: the exported
 * image, the prompts and the JSON sidecar all render the list this returns, so
 * they cannot disagree about where an annotation is or whether it survived.
 *
 * Per tool:
 * - box: intersected with the crop, so a box half outside it is clamped to the
 *   visible part. A box that only touches the crop edge has no visible area
 *   left and is dropped.
 * - arrow: kept when either endpoint is inside, and only shifted - never
 *   clamped. Clipping the line to the crop edge would move the head, and an
 *   arrow's head is the thing it points at; an endpoint that lands slightly
 *   outside the crop-sized canvas just draws off it.
 * - text: kept when its anchor (where the pin sits, and where the label is
 *   drawn from) is inside, then shifted.
 *
 * Annotations keep their identity, comments and DOM context: only coordinates
 * change. Numbering is re-derived downstream from the surviving list, so a
 * cropped-out annotation leaves no gap in the pins or the notes legend.
 */
export function applyCrop(annotations: Annotation[], crop: Rect): Annotation[] {
  const right = crop.x + crop.width;
  const bottom = crop.y + crop.height;
  const isInside = (x: number, y: number): boolean =>
    x >= crop.x && x <= right && y >= crop.y && y <= bottom;

  const cropped: Annotation[] = [];

  for (const annotation of annotations) {
    if (annotation.tool === "box") {
      const left = Math.max(annotation.x, crop.x);
      const top = Math.max(annotation.y, crop.y);
      const width = Math.min(annotation.x + annotation.width, right) - left;
      const height = Math.min(annotation.y + annotation.height, bottom) - top;
      if (width <= 0 || height <= 0) continue;
      cropped.push({ ...annotation, x: left - crop.x, y: top - crop.y, width, height });
      continue;
    }

    if (annotation.tool === "arrow") {
      if (!isInside(annotation.x1, annotation.y1) && !isInside(annotation.x2, annotation.y2)) {
        continue;
      }
      cropped.push({
        ...annotation,
        x1: annotation.x1 - crop.x,
        y1: annotation.y1 - crop.y,
        x2: annotation.x2 - crop.x,
        y2: annotation.y2 - crop.y
      });
      continue;
    }

    if (!isInside(annotation.x, annotation.y)) continue;
    cropped.push({ ...annotation, x: annotation.x - crop.x, y: annotation.y - crop.y });
  }

  return cropped;
}
