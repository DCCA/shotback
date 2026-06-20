import type { BoxAnnotation } from "@/types/annotation";

export type BoxResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

export const BOX_RESIZE_HANDLES: BoxResizeHandle[] = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];

const HORIZONTAL_FLIP_MAP: Record<BoxResizeHandle, BoxResizeHandle> = {
  n: "n",
  ne: "nw",
  e: "w",
  se: "sw",
  s: "s",
  sw: "se",
  w: "e",
  nw: "ne"
};

const VERTICAL_FLIP_MAP: Record<BoxResizeHandle, BoxResizeHandle> = {
  n: "s",
  ne: "se",
  e: "e",
  se: "ne",
  s: "n",
  sw: "nw",
  w: "w",
  nw: "sw"
};

export interface ResizeBoxParams {
  box: Pick<BoxAnnotation, "x" | "y" | "width" | "height">;
  handle: BoxResizeHandle;
  deltaX: number;
  deltaY: number;
  boundsWidth: number;
  boundsHeight: number;
  minSize?: number;
}

export interface ResizeBoxResult {
  box: Pick<BoxAnnotation, "x" | "y" | "width" | "height">;
  handle: BoxResizeHandle;
}

export function getBoxResizeCursor(handle: BoxResizeHandle): string {
  const cursorMap: Record<BoxResizeHandle, string> = {
    n: "ns-resize",
    ne: "nesw-resize",
    e: "ew-resize",
    se: "nwse-resize",
    s: "ns-resize",
    sw: "nesw-resize",
    w: "ew-resize",
    nw: "nwse-resize"
  };

  return cursorMap[handle];
}

export function getBoxHandlePosition(
  box: Pick<BoxAnnotation, "x" | "y" | "width" | "height">,
  handle: BoxResizeHandle
): { x: number; y: number } {
  const left = box.x;
  const top = box.y;
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  const midX = (left + right) / 2;
  const midY = (top + bottom) / 2;

  switch (handle) {
    case "n":
      return { x: midX, y: top };
    case "ne":
      return { x: right, y: top };
    case "e":
      return { x: right, y: midY };
    case "se":
      return { x: right, y: bottom };
    case "s":
      return { x: midX, y: bottom };
    case "sw":
      return { x: left, y: bottom };
    case "w":
      return { x: left, y: midY };
    case "nw":
      return { x: left, y: top };
    default:
      return { x: midX, y: midY };
  }
}

export function applyBoxResizeDelta(params: ResizeBoxParams): ResizeBoxResult {
  const minSize = Math.max(1, params.minSize ?? 8);
  const maxX = Math.max(0, params.boundsWidth);
  const maxY = Math.max(0, params.boundsHeight);

  let left = params.box.x;
  let top = params.box.y;
  let right = params.box.x + params.box.width;
  let bottom = params.box.y + params.box.height;
  let handle = params.handle;

  if (handle.includes("w")) left += params.deltaX;
  if (handle.includes("e")) right += params.deltaX;
  if (handle.includes("n")) top += params.deltaY;
  if (handle.includes("s")) bottom += params.deltaY;

  if (left > right) {
    [left, right] = [right, left];
    handle = HORIZONTAL_FLIP_MAP[handle];
  }

  if (top > bottom) {
    [top, bottom] = [bottom, top];
    handle = VERTICAL_FLIP_MAP[handle];
  }

  const horizontalEdge = handle.includes("w") ? "w" : handle.includes("e") ? "e" : null;
  const verticalEdge = handle.includes("n") ? "n" : handle.includes("s") ? "s" : null;

  if (horizontalEdge === "w") {
    left = Math.max(0, Math.min(left, right - minSize));
  } else if (horizontalEdge === "e") {
    right = Math.min(maxX, Math.max(right, left + minSize));
  } else {
    left = Math.max(0, left);
    right = Math.min(maxX, right);
  }

  if (verticalEdge === "n") {
    top = Math.max(0, Math.min(top, bottom - minSize));
  } else if (verticalEdge === "s") {
    bottom = Math.min(maxY, Math.max(bottom, top + minSize));
  } else {
    top = Math.max(0, top);
    bottom = Math.min(maxY, bottom);
  }

  if (right - left < minSize) {
    if (horizontalEdge === "w") {
      left = Math.max(0, right - minSize);
    } else if (horizontalEdge === "e") {
      right = Math.min(maxX, left + minSize);
    }
  }

  if (bottom - top < minSize) {
    if (verticalEdge === "n") {
      top = Math.max(0, bottom - minSize);
    } else if (verticalEdge === "s") {
      bottom = Math.min(maxY, top + minSize);
    }
  }

  return {
    box: {
      x: left,
      y: top,
      width: Math.max(minSize, right - left),
      height: Math.max(minSize, bottom - top)
    },
    handle
  };
}
