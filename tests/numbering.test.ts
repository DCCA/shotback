import { describe, expect, it } from "vitest";
import {
  canvasScale,
  describeGeometry,
  numberAnnotations,
  pinAnchor,
  pinCenter,
  pinRadius
} from "../src/lib/numbering";

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

describe("canvasScale", () => {
  it("is 1 at 1200px, and tracks pinRadius below/above it", () => {
    expect(canvasScale(1200)).toBe(1);
    expect(canvasScale(600)).toBeCloseTo(0.7);
    expect(canvasScale(4000)).toBeCloseTo(1.4);
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

describe("describeGeometry", () => {
  const image = { width: 1000, height: 800 };

  it("describes a box in px and % of page", () => {
    const box = mk("b", "2026-08-23T00:00:00Z", 10, 20);
    box.width = 30;
    box.height = 40;
    expect(describeGeometry(box, image)).toBe("at (10, 20) size 30x40 px [1%, 3% of page]");
  });

  it("describes an arrow as tail-to-head px", () => {
    const arrow = {
      id: "a",
      tool: "arrow" as const,
      color: "#f00",
      createdAt: "2026-08-23T00:00:00Z",
      x1: 5,
      y1: 6,
      x2: 50,
      y2: 60
    };
    expect(describeGeometry(arrow, image)).toBe("from (5, 6) to (50, 60) px");
  });

  it("describes text as a single point in px", () => {
    const text = {
      id: "t",
      tool: "text" as const,
      color: "#f00",
      createdAt: "2026-08-23T00:00:00Z",
      x: 12,
      y: 34,
      text: "Hi"
    };
    expect(describeGeometry(text, image)).toBe("at (12, 34) px");
  });

  it("rounds fractional px and percentages", () => {
    const box = mk("b", "2026-08-23T00:00:00Z", 10.4, 20.6);
    box.width = 30.5;
    box.height = 40.5;
    // px: Math.round(10.4)=10, Math.round(20.6)=21, Math.round(30.5)=31 (round half up), Math.round(40.5)=41 (round half up)
    // %: 100*10.4/1000 = 1.04 -> 1; 100*20.6/800 = 2.575 -> 3
    expect(describeGeometry(box, image)).toBe("at (10, 21) size 31x41 px [1%, 3% of page]");
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
