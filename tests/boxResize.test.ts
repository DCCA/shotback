import { describe, expect, it } from "vitest";
import { applyBoxResizeDelta } from "../src/lib/boxResize";

describe("applyBoxResizeDelta", () => {
  it("flips to east handle when west handle crosses the opposite side", () => {
    const result = applyBoxResizeDelta({
      box: { x: 10, y: 10, width: 20, height: 20 },
      handle: "w",
      deltaX: 30,
      deltaY: 0,
      boundsWidth: 200,
      boundsHeight: 200
    });

    expect(result.handle).toBe("e");
    expect(result.box).toEqual({ x: 30, y: 10, width: 10, height: 20 });
  });

  it("flips to south handle when north handle crosses the opposite side", () => {
    const result = applyBoxResizeDelta({
      box: { x: 10, y: 10, width: 20, height: 20 },
      handle: "n",
      deltaX: 0,
      deltaY: 35,
      boundsWidth: 200,
      boundsHeight: 200
    });

    expect(result.handle).toBe("s");
    expect(result.box).toEqual({ x: 10, y: 30, width: 20, height: 15 });
  });

  it("flips both axes for corner handles when crossing both sides", () => {
    const result = applyBoxResizeDelta({
      box: { x: 10, y: 10, width: 20, height: 20 },
      handle: "nw",
      deltaX: 28,
      deltaY: 25,
      boundsWidth: 200,
      boundsHeight: 200
    });

    expect(result.handle).toBe("se");
    expect(result.box).toEqual({ x: 30, y: 30, width: 8, height: 8 });
  });

  it("enforces minimum size when shrinking from an edge", () => {
    const result = applyBoxResizeDelta({
      box: { x: 10, y: 10, width: 20, height: 20 },
      handle: "e",
      deltaX: -18,
      deltaY: 0,
      boundsWidth: 200,
      boundsHeight: 200,
      minSize: 8
    });

    expect(result.box).toEqual({ x: 10, y: 10, width: 8, height: 20 });
    expect(result.handle).toBe("e");
  });

  it("clamps size to image bounds when expanding beyond the right edge", () => {
    const result = applyBoxResizeDelta({
      box: { x: 10, y: 10, width: 20, height: 20 },
      handle: "e",
      deltaX: 200,
      deltaY: 0,
      boundsWidth: 50,
      boundsHeight: 200
    });

    expect(result.box).toEqual({ x: 10, y: 10, width: 40, height: 20 });
    expect(result.handle).toBe("e");
  });

  it("supports smooth back-and-forth resizing after crossing", () => {
    const first = applyBoxResizeDelta({
      box: { x: 10, y: 10, width: 20, height: 20 },
      handle: "w",
      deltaX: 30,
      deltaY: 0,
      boundsWidth: 200,
      boundsHeight: 200
    });

    const second = applyBoxResizeDelta({
      box: first.box,
      handle: first.handle,
      deltaX: -25,
      deltaY: 0,
      boundsWidth: 200,
      boundsHeight: 200
    });

    expect(second.handle).toBe("w");
    expect(second.box).toEqual({ x: 15, y: 10, width: 15, height: 20 });
  });
});
