import { describe, expect, it } from "vitest";
import { numberAnnotations, pinAnchor, pinRadius } from "../src/lib/numbering";

const mk = (id: string, createdAt: string) => ({
  id,
  tool: "box" as const,
  color: "#f00",
  createdAt,
  x: 5,
  y: 7,
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
