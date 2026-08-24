import { describe, expect, it } from "vitest";
import { placeInlineEditor } from "../src/lib/editor-placement";

const image = { width: 1000, height: 800 };
const editor = { width: 240, height: 84 };

describe("placeInlineEditor", () => {
  it("sits just below the shape, left-aligned", () => {
    expect(placeInlineEditor({ x: 100, y: 100, width: 200, height: 50 }, image, editor)).toEqual({
      x: 100,
      y: 158
    });
  });
  it("flips above the shape near the bottom edge", () => {
    expect(placeInlineEditor({ x: 100, y: 740, width: 200, height: 50 }, image, editor)).toEqual({
      x: 100,
      y: 648
    });
  });
  it("clamps to the right edge", () => {
    expect(placeInlineEditor({ x: 900, y: 100, width: 80, height: 50 }, image, editor).x).toBe(750);
  });
});
