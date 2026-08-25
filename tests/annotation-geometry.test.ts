import { describe, expect, it } from "vitest";
import { moveAnnotation } from "../src/editor/annotation-geometry";

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

  it("moves a highlight like a box, and every point of a pen stroke", () => {
    const highlight = {
      id: "h",
      tool: "highlight" as const,
      color: "#f59e0b",
      createdAt: ts,
      x: 10,
      y: 20,
      width: 30,
      height: 8
    };
    expect(moveAnnotation(highlight, 3, -4)).toMatchObject({ x: 13, y: 16 });

    const pen = {
      id: "p",
      tool: "pen" as const,
      color: "#3b82f6",
      createdAt: ts,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 20 }
      ]
    };
    expect(moveAnnotation(pen, 3, -4)).toMatchObject({
      points: [
        { x: 3, y: -4 },
        { x: 13, y: 16 }
      ]
    });
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
