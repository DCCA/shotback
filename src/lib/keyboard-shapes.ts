import { applyBoxResizeDelta } from "@/lib/boxResize";
import type { Rect } from "@/lib/crop";

/**
 * The geometry behind drawing with no pointer: where a keyboard-placed shape
 * lands, and what an arrow key does to the selection. Pure and DOM-free, so
 * the cases that are painful to reach through the canvas - a rectangle already
 * at its minimum size, one already against the image edge, an image smaller
 * than the default shape - are unit tests rather than e2e choreography.
 *
 * The canvas keeps the parts that need the DOM (which box is on screen) and
 * the parts that need React (committing, selecting, focusing).
 */

/**
 * Default size of a keyboard-placed rectangle, in image px. Drawing was
 * pointer-only until these existed: a keyboard user could select, comment on
 * and delete annotations from the timeline but could never create the first
 * one, which put the whole annotate step of capture -> annotate -> export out
 * of reach. A shape placed at the centre of what is on screen is then nudged
 * into place with the arrow keys.
 */
export const KEYBOARD_SHAPE_SIZE = { width: 160, height: 100 };
/** Half of a keyboard-placed arrow's reach: tail to head is ~140px diagonally. */
export const KEYBOARD_ARROW_REACH = 50;
/** One arrow key: 8px, the same step Shift+arrow resizes a rectangle by. */
export const KEYBOARD_NUDGE = 8;
/**
 * Smallest a rectangle may be resized to from the keyboard - the same floor
 * the pointer's resize handles use, so the two paths cannot disagree about
 * what "as small as it goes" means.
 */
export const MIN_KEYBOARD_BOX_SIZE = 8;

/** The four keys `nudgeBy`/`resizeRect` answer to, and what each one means. */
export const ARROW_KEYS: Record<string, { x: number; y: number }> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 }
};

interface Size {
  width: number;
  height: number;
}

/** A coordinate pulled onto `[0, extent]` and rounded to whole px. */
export function onImage(value: number, extent: number): number {
  return Math.round(Math.min(Math.max(value, 0), Math.max(0, extent)));
}

/**
 * The default rectangle, centred on `centre` and fully inside the image -
 * shrunk to the image first, so a capture narrower than 160px still gets a
 * shape that fits rather than one hanging off the edge.
 */
export function placementRect(centre: { x: number; y: number }, image: Size): Rect {
  const width = Math.min(KEYBOARD_SHAPE_SIZE.width, image.width);
  const height = Math.min(KEYBOARD_SHAPE_SIZE.height, image.height);
  return {
    x: onImage(centre.x - width / 2, image.width - width),
    y: onImage(centre.y - height / 2, image.height - height),
    width,
    height
  };
}

/** A keyboard-placed arrow: a ~140px diagonal through `centre`, clamped to the image. */
export function placementArrow(
  centre: { x: number; y: number },
  image: Size
): { x1: number; y1: number; x2: number; y2: number } {
  return {
    x1: onImage(centre.x - KEYBOARD_ARROW_REACH, image.width),
    y1: onImage(centre.y - KEYBOARD_ARROW_REACH, image.height),
    x2: onImage(centre.x + KEYBOARD_ARROW_REACH, image.width),
    y2: onImage(centre.y + KEYBOARD_ARROW_REACH, image.height)
  };
}

/**
 * Shift+arrow, as a new rectangle - or `null` when the key would change
 * nothing, which is the whole reason this is a function and not two lines at
 * the call site. A rectangle already at the minimum size (or already filling
 * the image) still produced a *new object* on every press, and since the undo
 * stack only dedupes identical references, holding Shift+Left at the floor
 * quietly spent the history on entries that look identical to the eye.
 *
 * It resizes through `applyBoxResizeDelta` with the "se" handle - the same
 * helper and the same bounds the pointer's own resize handles use - so the
 * keyboard cannot grow a rectangle past an edge a drag would have stopped at.
 */
export function resizeRect(rect: Rect, deltaX: number, deltaY: number, image: Size): Rect | null {
  const { box } = applyBoxResizeDelta({
    box: rect,
    handle: "se",
    deltaX,
    deltaY,
    boundsWidth: image.width,
    boundsHeight: image.height,
    minSize: MIN_KEYBOARD_BOX_SIZE
  });

  const unchanged =
    box.x === rect.x && box.y === rect.y && box.width === rect.width && box.height === rect.height;
  return unchanged ? null : box;
}
