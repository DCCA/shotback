import { describe, expect, it } from "vitest";
import { numberAnnotations, pinAnchor, pinCenter, pinRadius } from "../src/lib/numbering";

const mk = (id: string, createdAt: string, x = 5, y = 7) => ({
  id,
  tool: "box" as const,
  color: "#f00",
  createdAt,
  x,
  y,
  width: 10,
  height: 10
});

describe("numberAnnotations", () => {
  it("numbers by creation time regardless of array order", () => {
    const list = [mk("late", "2026-08-23T00:00:02Z"), mk("early", "2026-08-23T00:00:01Z")];
    expect(numberAnnotations(list).map((x) => [x.n, x.annotation.id])).toEqual([
      [1, "early"],
      [2, "late"]
    ]);
  });
});

describe("pinRadius", () => {
  it("clamps between 14 and 28", () => {
    expect(pinRadius(300)).toBe(14);
    expect(pinRadius(1200)).toBe(20);
    expect(pinRadius(4000)).toBe(28);
  });
});

describe("pinAnchor", () => {
  it("uses the arrow tail, not the bounding box", () => {
    const arrow = {
      id: "a",
      tool: "arrow" as const,
      color: "#f00",
      createdAt: "2026-08-23T00:00:00Z",
      x1: 30,
      y1: 40,
      x2: 0,
      y2: 0
    };
    expect(pinAnchor(arrow)).toEqual({ x: 30, y: 40 });
  });
});

describe("pinCenter", () => {
  const image = { width: 1200, height: 800 };

  it("pulls a pin at the top-left corner fully inside the image", () => {
    expect(pinCenter(mk("a", "2026-08-23T00:00:00Z", 5, 5), 20, image)).toEqual({ x: 20, y: 20 });
  });

  it("pulls a pin at the bottom-right corner fully inside the image", () => {
    expect(pinCenter(mk("a", "2026-08-23T00:00:00Z", 1195, 795), 20, image)).toEqual({
      x: 1180,
      y: 780
    });
  });

  it("leaves an interior anchor alone", () => {
    expect(pinCenter(mk("a", "2026-08-23T00:00:00Z", 400, 300), 20, image)).toEqual({
      x: 400,
      y: 300
    });
  });
});
