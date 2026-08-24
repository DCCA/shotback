import { describe, expect, it } from "vitest";
import { annotationBounds, moveAnnotation } from "../src/editor/annotation-geometry";

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

describe("annotationBounds", () => {
  it("returns a box unchanged", () => {
    const box = {
      id: "b",
      tool: "box" as const,
      color: "#f00",
      createdAt: ts,
      x: 10,
      y: 20,
      width: 40,
      height: 30
    };
    expect(annotationBounds(box)).toEqual({ x: 10, y: 20, width: 40, height: 30 });
  });

  it("spans both arrow endpoints whichever way it was drawn", () => {
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
    expect(annotationBounds(arrow)).toEqual({ x: 10, y: 5, width: 20, height: 20 });
  });

  it("estimates a text run from its length", () => {
    const text = {
      id: "t",
      tool: "text" as const,
      color: "#f00",
      createdAt: ts,
      x: 100,
      y: 50,
      text: "abcd"
    };
    expect(annotationBounds(text)).toEqual({ x: 100, y: 32, width: 40, height: 22 });
  });
});
