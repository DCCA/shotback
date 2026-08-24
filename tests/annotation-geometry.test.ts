import { describe, expect, it } from "vitest";
import { annotationCommentAnchor, moveAnnotation } from "../src/editor/annotation-geometry";

const ts = "2026-08-23T00:00:00.000Z";

describe("moveAnnotation", () => {
  it("moves a box by the delta", () => {
    const box = {
      id: "b",
      tool: "box" as const,
      color: "#f00",
      createdAt: ts,
      x: 10,
      y: 20,
      width: 5,
      height: 5
    };
    expect(moveAnnotation(box, 3, -4)).toMatchObject({ x: 13, y: 16 });
  });

  it("moves both arrow endpoints", () => {
    const arrow = {
      id: "a",
      tool: "arrow" as const,
      color: "#f00",
      createdAt: ts,
      x1: 0,
      y1: 0,
      x2: 10,
      y2: 10
    };
    expect(moveAnnotation(arrow, 1, 2)).toMatchObject({ x1: 1, y1: 2, x2: 11, y2: 12 });
  });
});

describe("annotationCommentAnchor", () => {
  it("uses the top-left of an arrow's bounding box", () => {
    const arrow = {
      id: "a",
      tool: "arrow" as const,
      color: "#f00",
      createdAt: ts,
      x1: 30,
      y1: 5,
      x2: 10,
      y2: 25
    };
    expect(annotationCommentAnchor(arrow)).toEqual({ x: 10, y: 5 });
  });
});
