import { describe, expect, it } from "vitest";
import { applyCrop, clampCrop, cropViewMetrics, MIN_CROP_SIZE, type Rect } from "../src/lib/crop";
import type {
  ArrowAnnotation,
  BoxAnnotation,
  HighlightAnnotation,
  PenAnnotation,
  RedactAnnotation,
  TextAnnotation
} from "../src/types/annotation";

const CROP: Rect = { x: 100, y: 100, width: 400, height: 300 };

function box(overrides: Partial<BoxAnnotation> = {}): BoxAnnotation {
  return {
    id: "b1",
    tool: "box",
    color: "#ff0000",
    createdAt: "2026-02-21T00:00:01.000Z",
    comment: "note",
    x: 150,
    y: 150,
    width: 60,
    height: 40,
    ...overrides
  };
}

function arrow(overrides: Partial<ArrowAnnotation> = {}): ArrowAnnotation {
  return {
    id: "a1",
    tool: "arrow",
    color: "#00ff00",
    createdAt: "2026-02-21T00:00:02.000Z",
    comment: "point",
    x1: 150,
    y1: 150,
    x2: 250,
    y2: 250,
    ...overrides
  };
}

function redaction(overrides: Partial<RedactAnnotation> = {}): RedactAnnotation {
  return {
    id: "r1",
    tool: "redact",
    color: "#ff3333",
    createdAt: "2026-02-21T00:00:04.000Z",
    x: 150,
    y: 150,
    width: 60,
    height: 40,
    ...overrides
  };
}

function text(overrides: Partial<TextAnnotation> = {}): TextAnnotation {
  return {
    id: "t1",
    tool: "text",
    color: "#0000ff",
    createdAt: "2026-02-21T00:00:03.000Z",
    x: 150,
    y: 150,
    text: "Label",
    ...overrides
  };
}

describe("applyCrop boxes", () => {
  it("shifts a fully inside box into crop space", () => {
    expect(applyCrop([box()], CROP)).toEqual([{ ...box(), x: 50, y: 50, width: 60, height: 40 }]);
  });

  it("keeps every other field, context included", () => {
    const context = {
      cssPath: "#app > button.cta",
      tag: "button",
      classes: ["cta"],
      rect: { x: 1, y: 2, width: 3, height: 4 }
    };
    const [cropped] = applyCrop([box({ context })], CROP);
    expect(cropped.context).toEqual(context);
    expect(cropped.id).toBe("b1");
    expect(cropped.comment).toBe("note");
  });

  it("clamps a box that hangs off the top-left of the crop", () => {
    const cropped = applyCrop([box({ x: 60, y: 40, width: 100, height: 100 })], CROP);
    expect(cropped).toEqual([
      { ...box({ x: 60, y: 40, width: 100, height: 100 }), x: 0, y: 0, width: 60, height: 40 }
    ]);
  });

  it("clamps a box that hangs off the bottom-right of the crop", () => {
    const cropped = applyCrop([box({ x: 450, y: 350, width: 200, height: 200 })], CROP);
    expect(cropped).toEqual([
      { ...box({ x: 450, y: 350, width: 200, height: 200 }), x: 350, y: 250, width: 50, height: 50 }
    ]);
  });

  it("clamps a box larger than the crop down to the whole crop", () => {
    const cropped = applyCrop([box({ x: 0, y: 0, width: 2000, height: 2000 })], CROP);
    expect(cropped[0]).toMatchObject({ x: 0, y: 0, width: 400, height: 300 });
  });

  it("drops a box fully outside the crop", () => {
    expect(applyCrop([box({ x: 600, y: 600 })], CROP)).toEqual([]);
  });

  it("drops a box that only touches the crop edge", () => {
    expect(applyCrop([box({ x: 40, y: 150, width: 60, height: 40 })], CROP)).toEqual([]);
  });
});

describe("applyCrop redactions", () => {
  it("shifts a fully inside redaction into crop space, like a box", () => {
    expect(applyCrop([redaction()], CROP)).toEqual([
      { ...redaction(), x: 50, y: 50, width: 60, height: 40 }
    ]);
  });

  it("clamps a redaction that hangs off the crop to the visible part", () => {
    const cropped = applyCrop([redaction({ x: 450, y: 350, width: 200, height: 200 })], CROP);
    expect(cropped).toEqual([
      {
        ...redaction({ x: 450, y: 350, width: 200, height: 200 }),
        x: 350,
        y: 250,
        width: 50,
        height: 50
      }
    ]);
  });

  it("drops a redaction fully outside the crop", () => {
    expect(applyCrop([redaction({ x: 600, y: 600 })], CROP)).toEqual([]);
  });
});

describe("applyCrop arrows", () => {
  it("shifts both endpoints when both are inside", () => {
    expect(applyCrop([arrow()], CROP)).toEqual([{ ...arrow(), x1: 50, y1: 50, x2: 150, y2: 150 }]);
  });

  it("keeps an arrow whose tail is inside and lets its head point outside", () => {
    const cropped = applyCrop([arrow({ x2: 900, y2: 800 })], CROP);
    expect(cropped).toEqual([{ ...arrow({ x2: 900, y2: 800 }), x1: 50, y1: 50, x2: 800, y2: 700 }]);
  });

  it("keeps an arrow whose head is inside and its tail outside", () => {
    const cropped = applyCrop([arrow({ x1: 0, y1: 0 })], CROP);
    expect(cropped).toEqual([{ ...arrow({ x1: 0, y1: 0 }), x1: -100, y1: -100, x2: 150, y2: 150 }]);
  });

  it("drops an arrow with both endpoints outside", () => {
    expect(applyCrop([arrow({ x1: 10, y1: 10, x2: 20, y2: 20 })], CROP)).toEqual([]);
  });
});

describe("applyCrop text", () => {
  it("shifts a text anchored inside the crop", () => {
    expect(applyCrop([text()], CROP)).toEqual([{ ...text(), x: 50, y: 50 }]);
  });

  it("drops a text anchored outside the crop", () => {
    expect(applyCrop([text({ x: 20, y: 20 })], CROP)).toEqual([]);
  });
});

describe("applyCrop highlights", () => {
  const highlight = (overrides: Partial<HighlightAnnotation> = {}): HighlightAnnotation => ({
    id: "h1",
    tool: "highlight",
    color: "#f59e0b",
    createdAt: "2026-02-21T00:00:04.000Z",
    comment: "read this",
    x: 150,
    y: 150,
    width: 60,
    height: 40,
    ...overrides
  });

  it("shifts a highlight fully inside the crop", () => {
    expect(applyCrop([highlight()], CROP)).toEqual([{ ...highlight(), x: 50, y: 50 }]);
  });

  it("clamps a highlight that hangs over the crop edge, like a box", () => {
    expect(applyCrop([highlight({ x: 60, y: 60, width: 100, height: 80 })], CROP)).toEqual([
      { ...highlight({ x: 60, y: 60, width: 100, height: 80 }), x: 0, y: 0, width: 60, height: 40 }
    ]);
  });

  it("drops a highlight entirely outside the crop", () => {
    expect(applyCrop([highlight({ x: 0, y: 0, width: 10, height: 10 })], CROP)).toEqual([]);
  });
});

describe("applyCrop pen strokes", () => {
  const pen = (overrides: Partial<PenAnnotation> = {}): PenAnnotation => ({
    id: "p1",
    tool: "pen",
    color: "#3b82f6",
    createdAt: "2026-02-21T00:00:05.000Z",
    comment: "scribble",
    points: [
      { x: 150, y: 150 },
      { x: 200, y: 220 }
    ],
    ...overrides
  });

  it("shifts every point of a stroke inside the crop", () => {
    expect(applyCrop([pen()], CROP)).toEqual([
      {
        ...pen(),
        points: [
          { x: 50, y: 50 },
          { x: 100, y: 120 }
        ]
      }
    ]);
  });

  it("keeps a stroke with any point inside, and does not clamp the ones outside", () => {
    const partly = pen({
      points: [
        { x: 20, y: 20 },
        { x: 150, y: 150 }
      ]
    });
    expect(applyCrop([partly], CROP)).toEqual([
      {
        ...partly,
        points: [
          { x: -80, y: -80 },
          { x: 50, y: 50 }
        ]
      }
    ]);
  });

  it("drops a stroke with every point outside the crop", () => {
    expect(
      applyCrop(
        [
          pen({
            points: [
              { x: 10, y: 10 },
              { x: 20, y: 20 }
            ]
          })
        ],
        CROP
      )
    ).toEqual([]);
  });
});

describe("applyCrop as a whole", () => {
  it("is a no-op shift for a crop at the origin covering everything", () => {
    const items = [box(), arrow(), text()];
    expect(applyCrop(items, { x: 0, y: 0, width: 1000, height: 1000 })).toEqual(items);
  });

  it("preserves order and does not mutate the input", () => {
    const items = [box(), arrow(), text({ x: 20, y: 20 })];
    const snapshot = JSON.parse(JSON.stringify(items));
    const cropped = applyCrop(items, CROP);
    expect(cropped.map((item) => item.id)).toEqual(["b1", "a1"]);
    expect(items).toEqual(snapshot);
  });

  it("returns an empty list for an empty input", () => {
    expect(applyCrop([], CROP)).toEqual([]);
  });
});

describe("clampCrop", () => {
  const image = { width: 800, height: 600 };

  it("leaves a crop that already fits alone", () => {
    expect(clampCrop({ x: 10, y: 20, width: 100, height: 50 }, image)).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 50
    });
  });

  it("rounds fractional pointer coordinates to whole px", () => {
    expect(clampCrop({ x: 10.4, y: 20.6, width: 100.5, height: 50.2 }, image)).toEqual({
      x: 10,
      y: 21,
      width: 101,
      height: 50
    });
  });

  it("pulls a crop that runs off the right/bottom edge back inside", () => {
    expect(clampCrop({ x: 750, y: 570, width: 200, height: 200 }, image)).toEqual({
      x: 600,
      y: 400,
      width: 200,
      height: 200
    });
  });

  it("pulls a negative origin back to zero", () => {
    expect(clampCrop({ x: -30, y: -40, width: 100, height: 100 }, image)).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 100
    });
  });

  it("never returns a crop smaller than the minimum", () => {
    expect(clampCrop({ x: 5, y: 5, width: 2, height: 0 }, image)).toEqual({
      x: 5,
      y: 5,
      width: MIN_CROP_SIZE,
      height: MIN_CROP_SIZE
    });
  });

  it("yields the minimum to an image smaller than it", () => {
    expect(clampCrop({ x: 3, y: 3, width: 2, height: 2 }, { width: 10, height: 16 })).toEqual({
      x: 0,
      y: 0,
      width: 10,
      height: 16
    });
  });

  it("never returns a crop larger than the image", () => {
    expect(clampCrop({ x: 0, y: 0, width: 5000, height: 5000 }, image)).toEqual({
      x: 0,
      y: 0,
      width: 800,
      height: 600
    });
  });
});

describe("cropViewMetrics", () => {
  const image = { width: 1000, height: 2000 };

  it("is a no-op window when the view is the whole image", () => {
    expect(cropViewMetrics({ x: 0, y: 0, ...image }, image)).toEqual({
      offsetXPercent: -0,
      offsetYPercent: -0,
      widthPercent: 100,
      aspectRatio: 0.5
    });
  });

  /**
   * The inner wrapper is absolutely positioned, so its `top` percentage
   * resolves against the window's HEIGHT and its `left` against the window's
   * WIDTH. Both therefore divide by their own axis of the view, never by the
   * width alone - the bug this test exists to pin down.
   */
  it("offsets the image by the crop origin on each axis independently", () => {
    expect(cropViewMetrics({ x: 250, y: 800, width: 500, height: 400 }, image)).toEqual({
      offsetXPercent: -50,
      offsetYPercent: -200,
      widthPercent: 200,
      aspectRatio: 1.25
    });
  });

  it("treats a degenerate view as the whole image rather than dividing by zero", () => {
    expect(cropViewMetrics({ x: 10, y: 10, width: 0, height: 0 }, image)).toEqual({
      offsetXPercent: -0,
      offsetYPercent: -0,
      widthPercent: 100,
      aspectRatio: 0.5
    });
  });
});
