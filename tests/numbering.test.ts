import { describe, expect, it } from "vitest";
import {
  annotationBounds,
  canvasScale,
  describeGeometry,
  inspectableAnnotations,
  numberAnnotations,
  redactions,
  inspectAnchor,
  pinAnchor,
  pinCenter,
  pinRadius,
  viewPins
} from "../src/lib/numbering";
import type { HighlightAnnotation, PenAnnotation } from "../src/types/annotation";

const ts = "2026-08-23T00:00:00.000Z";

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

describe("inspectAnchor", () => {
  it("uses the centre of a box, which is what the box frames", () => {
    const item = { ...mk("b", "2026-08-23T00:00:00Z", 100, 200), width: 60, height: 40 };
    expect(inspectAnchor(item)).toEqual({ x: 130, y: 220 });
  });

  it("falls back to the pin anchor for arrows and text", () => {
    const item = {
      id: "a",
      tool: "arrow" as const,
      color: "#f00",
      createdAt: "2026-08-23T00:00:00Z",
      x1: 30,
      y1: 40,
      x2: 90,
      y2: 120
    };
    expect(inspectAnchor(item)).toEqual(pinAnchor(item));
    expect(inspectAnchor(item)).toEqual({ x: 30, y: 40 });
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

  it("returns a redaction's own rect, like a box", () => {
    expect(annotationBounds(redaction("r", ts))).toEqual({ x: 20, y: 30, width: 40, height: 50 });
  });
});

const redaction = (id: string, createdAt: string) => ({
  id,
  tool: "redact" as const,
  color: "#f00",
  createdAt,
  x: 20,
  y: 30,
  width: 40,
  height: 50
});

describe("redactions", () => {
  it("are left out of the numbering: no pin, no legend row, no prompt line", () => {
    const list = [
      mk("first", "2026-08-23T00:00:01Z"),
      redaction("r1", "2026-08-23T00:00:02Z"),
      mk("second", "2026-08-23T00:00:03Z")
    ];
    expect(numberAnnotations(list).map((item) => [item.n, item.annotation.id])).toEqual([
      [1, "first"],
      [2, "second"]
    ]);
  });

  it("are never inspectable, so no selector is read from under one", () => {
    const list = [mk("box", "2026-08-23T00:00:00Z"), redaction("r1", "2026-08-23T00:00:01Z")];
    expect(inspectableAnnotations(list).map((item) => item.id)).toEqual(["box"]);
  });

  it("are returned on their own, in creation order", () => {
    const list = [
      redaction("late", "2026-08-23T00:00:02Z"),
      mk("box", "2026-08-23T00:00:00Z"),
      redaction("early", "2026-08-23T00:00:01Z")
    ];
    expect(redactions(list).map((item) => item.id)).toEqual(["early", "late"]);
  });
});

describe("viewPins", () => {
  const image = { width: 1200, height: 2000 };
  // Radius is 20 for a 1200px image and 14 for the 300px-wide crop below
  // (`pinRadius` clamps at 14), which is what makes the clamp differences
  // visible in these cases.
  const crop = { x: 500, y: 400, width: 300, height: 240 };
  const box = (id: string, x: number, y: number, createdAt = ts) => ({
    id,
    tool: "box" as const,
    color: "#f00",
    createdAt,
    x,
    y,
    width: 20,
    height: 20,
    comment: ""
  });

  it("numbers and clamps against the full image when nothing is cropped", () => {
    const { radius, pins } = viewPins([box("a", 0, 0)], null, image);
    expect(radius).toBe(20);
    expect(pins.get("a")).toEqual({ n: 1, center: { x: 20, y: 20 } });
  });

  /**
   * The four crop edges. Each anchor sits inside the crop but nearer its edge
   * than the pin radius, so the export clamps it a full radius in - which is
   * exactly what the canvas used to disagree about, because it clamped against
   * the whole image instead and drew the pin half outside the crop.
   */
  it("clamps a west-edge anchor against the crop, not the image", () => {
    const { pins } = viewPins([box("a", 502, 500)], crop, image);
    expect(pins.get("a")).toEqual({ n: 1, center: { x: 500 + 14, y: 500 } });
  });

  it("clamps a north-edge anchor against the crop", () => {
    expect(viewPins([box("a", 600, 402)], crop, image).pins.get("a")).toEqual({
      n: 1,
      center: { x: 600, y: 400 + 14 }
    });
  });

  it("clamps an east-edge anchor against the crop", () => {
    expect(viewPins([box("a", 798, 500)], crop, image).pins.get("a")).toEqual({
      n: 1,
      center: { x: 500 + (300 - 14), y: 500 }
    });
  });

  it("clamps a south-edge anchor against the crop", () => {
    expect(viewPins([box("a", 600, 638)], crop, image).pins.get("a")).toEqual({
      n: 1,
      center: { x: 600, y: 400 + (240 - 14) }
    });
  });

  it("renumbers the survivors and gives a dropped annotation no pin", () => {
    const list = [
      box("outside", 0, 0, "2026-08-23T00:00:01Z"),
      box("inside", 600, 500, "2026-08-23T00:00:02Z"),
      box("alsoInside", 650, 550, "2026-08-23T00:00:03Z")
    ];
    const { pins } = viewPins(list, crop, image);
    expect(pins.has("outside")).toBe(false);
    // The survivors take 1 and 2 - the same renumbering the export does, and
    // the reason a pin numbered 3 on the canvas used to be 2 in the PNG.
    expect(pins.get("inside")?.n).toBe(1);
    expect(pins.get("alsoInside")?.n).toBe(2);
  });
});

describe("highlight and pen", () => {
  const highlight: HighlightAnnotation = {
    id: "h1",
    tool: "highlight",
    color: "#f59e0b",
    createdAt: ts,
    comment: "read this",
    x: 40,
    y: 60,
    width: 120,
    height: 30
  };

  const pen: PenAnnotation = {
    id: "p1",
    tool: "pen",
    color: "#3b82f6",
    createdAt: ts,
    comment: "scribble",
    points: [
      { x: 200, y: 100 },
      { x: 260, y: 180 },
      { x: 150, y: 140 }
    ]
  };

  it("bounds a highlight like a box", () => {
    expect(annotationBounds(highlight)).toEqual({ x: 40, y: 60, width: 120, height: 30 });
  });

  it("bounds a pen stroke to the extent of its points", () => {
    expect(annotationBounds(pen)).toEqual({ x: 150, y: 100, width: 110, height: 80 });
  });

  it("gives a pointless pen stroke a zero rect rather than NaN", () => {
    expect(annotationBounds({ ...pen, points: [] })).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0
    });
  });

  it("pins both at the top-left of their bounds", () => {
    expect(pinAnchor(highlight)).toEqual({ x: 40, y: 60 });
    expect(pinAnchor(pen)).toEqual({ x: 150, y: 100 });
  });

  it("inspects both at the centre of their bounds", () => {
    expect(inspectAnchor(highlight)).toEqual({ x: 100, y: 75 });
    expect(inspectAnchor(pen)).toEqual({ x: 205, y: 140 });
  });

  it("numbers and inspects both alongside the other tools", () => {
    const list = [highlight, pen];
    expect(numberAnnotations(list).map((item) => item.n)).toEqual([1, 2]);
    expect(inspectableAnnotations(list)).toHaveLength(2);
  });

  it("describes a highlight like a box and a pen stroke as a path", () => {
    const image = { width: 1000, height: 1000 };
    expect(describeGeometry(highlight, image)).toBe("at (40, 60) size 120x30 px [4%, 6% of page]");
    expect(describeGeometry(pen, image)).toBe(
      "pen path of 3 points from (200, 100) to (150, 140) px [15%, 10% of page]"
    );
  });
});
