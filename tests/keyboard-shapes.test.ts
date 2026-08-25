import { describe, expect, it } from "vitest";
import {
  ARROW_KEYS,
  KEYBOARD_NUDGE,
  MIN_KEYBOARD_BOX_SIZE,
  onImage,
  placementArrow,
  placementRect,
  resizeRect
} from "../src/lib/keyboard-shapes";

const image = { width: 1000, height: 800 };

describe("placementRect", () => {
  it("centres the default shape on the point", () => {
    expect(placementRect({ x: 500, y: 400 }, image)).toEqual({
      x: 420,
      y: 350,
      width: 160,
      height: 100
    });
  });

  it("keeps a shape near an edge fully inside the image", () => {
    expect(placementRect({ x: 0, y: 0 }, image)).toEqual({ x: 0, y: 0, width: 160, height: 100 });
    expect(placementRect({ x: 1000, y: 800 }, image)).toEqual({
      x: 840,
      y: 700,
      width: 160,
      height: 100
    });
  });

  it("shrinks to an image smaller than the default shape", () => {
    // A 60x40 capture cannot hold a 160x100 box; it gets the whole image
    // rather than a shape three quarters of which is off the edge.
    expect(placementRect({ x: 30, y: 20 }, { width: 60, height: 40 })).toEqual({
      x: 0,
      y: 0,
      width: 60,
      height: 40
    });
  });
});

describe("placementArrow", () => {
  it("draws a diagonal through the point", () => {
    expect(placementArrow({ x: 500, y: 400 }, image)).toEqual({
      x1: 450,
      y1: 350,
      x2: 550,
      y2: 450
    });
  });

  it("clamps both ends onto the image", () => {
    expect(placementArrow({ x: 10, y: 10 }, image)).toEqual({ x1: 0, y1: 0, x2: 60, y2: 60 });
  });
});

describe("resizeRect", () => {
  const rect = { x: 100, y: 100, width: 200, height: 150 };

  it("grows and shrinks by the delta", () => {
    expect(resizeRect(rect, KEYBOARD_NUDGE, 0, image)).toEqual({
      x: 100,
      y: 100,
      width: 208,
      height: 150
    });
    expect(resizeRect(rect, 0, -KEYBOARD_NUDGE, image)).toEqual({
      x: 100,
      y: 100,
      width: 200,
      height: 142
    });
  });

  it("stops at the image edge, exactly as a pointer drag does", () => {
    const wide = { x: 900, y: 100, width: 100, height: 100 };
    expect(resizeRect(wide, KEYBOARD_NUDGE, 0, image)).toBe(null);
  });

  it("returns null at the minimum size instead of a new identical rect", () => {
    // The undo stack dedupes by reference, so a fresh object here would spend
    // an entry per press while nothing on screen moved.
    const tiny = { x: 10, y: 10, width: MIN_KEYBOARD_BOX_SIZE, height: MIN_KEYBOARD_BOX_SIZE };
    expect(resizeRect(tiny, -KEYBOARD_NUDGE, 0, image)).toBe(null);
    expect(resizeRect(tiny, 0, -KEYBOARD_NUDGE, image)).toBe(null);
    // ...and still resizes in the direction that has room.
    expect(resizeRect(tiny, KEYBOARD_NUDGE, 0, image)).toEqual({
      x: 10,
      y: 10,
      width: MIN_KEYBOARD_BOX_SIZE + KEYBOARD_NUDGE,
      height: MIN_KEYBOARD_BOX_SIZE
    });
  });
});

describe("onImage", () => {
  it("clamps and rounds", () => {
    expect(onImage(-5, 100)).toBe(0);
    expect(onImage(105, 100)).toBe(100);
    expect(onImage(10.6, 100)).toBe(11);
  });

  it("survives an image with no size yet", () => {
    expect(onImage(10, -1)).toBe(0);
  });
});

describe("ARROW_KEYS", () => {
  it("maps exactly the four arrows", () => {
    expect(Object.keys(ARROW_KEYS).sort()).toEqual([
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp"
    ]);
    expect(ARROW_KEYS.ArrowUp).toEqual({ x: 0, y: -1 });
  });
});
