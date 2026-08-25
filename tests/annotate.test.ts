import { afterEach, describe, expect, it, vi } from "vitest";
import {
  exportAnnotatedImage,
  pixelateRegion,
  redactionBounds,
  selectFeedbackRenderMode
} from "../src/lib/annotate";
import { applyCrop, type Rect } from "../src/lib/crop";
import type {
  ArrowAnnotation,
  BoxAnnotation,
  HighlightAnnotation,
  PenAnnotation,
  RedactAnnotation
} from "../src/types/annotation";

describe("selectFeedbackRenderMode", () => {
  it("uses footer when resulting canvas size is within limits", () => {
    expect(
      selectFeedbackRenderMode({
        imageWidth: 1200,
        imageHeight: 6000,
        footerHeight: 220
      })
    ).toBe("footer");
  });

  it("uses overlay when resulting canvas height exceeds limit", () => {
    expect(
      selectFeedbackRenderMode({
        imageWidth: 1200,
        imageHeight: 16300,
        footerHeight: 200
      })
    ).toBe("overlay");
  });

  it("uses overlay when resulting canvas area exceeds limit", () => {
    expect(
      selectFeedbackRenderMode({
        imageWidth: 22000,
        imageHeight: 12000,
        footerHeight: 160,
        maxCanvasHeight: 30000,
        maxCanvasArea: 250000000
      })
    ).toBe("overlay");
  });
});

interface RecordedCall {
  name: string;
  args: unknown[];
}

/**
 * The unit tests run in Node, so the export is exercised against a recording
 * 2D-context stub: every drawing call is captured and can be asserted on.
 */
function recordingContext(): { ctx: CanvasRenderingContext2D; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const state: Record<string, unknown> = {};

  const ctx = new Proxy(state, {
    get(target, property) {
      if (typeof property !== "string") return undefined;
      if (property === "measureText") return (text: string) => ({ width: text.length * 7 });
      if (property in target) return target[property];
      return (...args: unknown[]) => {
        calls.push({ name: property, args });
      };
    },
    set(target, property, value) {
      if (typeof property === "string") {
        target[property] = value;
        // Recorded in order alongside the draw calls, so a test can assert
        // *when* a flag such as `imageSmoothingEnabled` was set.
        calls.push({ name: `set:${property}`, args: [value] });
      }
      return true;
    }
  }) as unknown as CanvasRenderingContext2D;

  return { ctx, calls };
}

/** Returns the single canvas stub every `createElement` hands back, so its size can be asserted. */
function stubCanvasAndImage(
  calls: RecordedCall[],
  ctx: CanvasRenderingContext2D
): { width: number; height: number } {
  const newCanvas = () => ({
    width: 0,
    height: 0,
    getContext: () => ctx,
    // Recorded like every other draw call, so a test can assert the exact
    // MIME type and quality argument `exportAnnotatedImage` finishes with.
    toDataURL: (...args: unknown[]) => {
      calls.push({ name: "toDataURL", args });
      return "data:x";
    }
  });
  const canvas = newCanvas();
  let first = true;

  // Only the first canvas is the export canvas the assertions read; the
  // pixelation buffer gets its own object, so sizing it never rewrites it.
  vi.stubGlobal("document", {
    createElement: () => {
      if (!first) return newCanvas();
      first = false;
      return canvas;
    }
  });

  vi.stubGlobal(
    "Image",
    class {
      width = 1200;
      height = 800;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
  );

  calls.length = 0;
  return canvas;
}

function box(comment: string): BoxAnnotation {
  return {
    id: "b1",
    tool: "box",
    color: "#ff0000",
    createdAt: "2026-02-21T00:00:01.000Z",
    comment,
    x: 100,
    y: 200,
    width: 60,
    height: 40
  };
}

function arrow(comment: string): ArrowAnnotation {
  return {
    id: "a1",
    tool: "arrow",
    color: "#00ff00",
    createdAt: "2026-02-21T00:00:02.000Z",
    comment,
    x1: 300,
    y1: 400,
    x2: 500,
    y2: 600
  };
}

describe("exportAnnotatedImage pins", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("draws a numbered pin per annotation instead of a comment pill", async () => {
    const { ctx, calls } = recordingContext();
    stubCanvasAndImage(calls, ctx);

    const dataUrl = await exportAnnotatedImage("data:", [box("hi"), arrow("there")]);
    expect(dataUrl).toBe("data:x");

    // pinRadius(1200) === 20: one full-size pin per annotation, at its anchor.
    const pins = calls.filter((call) => call.name === "arc" && call.args[2] === 20);
    expect(pins.map((call) => [call.args[0], call.args[1]])).toEqual([
      [100, 200],
      [300, 400]
    ]);

    const labels = calls.filter((call) => call.name === "fillText");
    expect(labels.some((call) => call.args[0] === "1")).toBe(true);
    expect(labels.some((call) => call.args[0] === "2")).toBe(true);

    // The comments belong in the footer legend (drawn below the 800px image),
    // never as a pill painted over the screenshot itself.
    const onImage = labels.filter((call) => (call.args[2] as number) <= 800);
    expect(onImage.map((call) => call.args[0])).toEqual(["1", "2"]);
    expect(labels.some((call) => call.args[0] === "Notes")).toBe(true);
    expect(labels.some((call) => call.args[0] === "hi")).toBe(true);
    expect(labels.some((call) => call.args[0] === "there")).toBe(true);
  });

  it("numbers pins by creation time, not array order", async () => {
    const { ctx, calls } = recordingContext();
    stubCanvasAndImage(calls, ctx);

    await exportAnnotatedImage("data:", [arrow("second"), box("first")]);

    const numbered = calls
      .filter((call) => call.name === "fillText" && (call.args[2] as number) <= 800)
      .map((call) => [call.args[0], call.args[1]]);
    expect(numbered).toEqual([
      ["1", 100],
      ["2", 300]
    ]);
  });

  it("legends an uncommented annotation with the prompt's placeholder", async () => {
    const { ctx, calls } = recordingContext();
    stubCanvasAndImage(calls, ctx);

    await exportAnnotatedImage("data:", [{ ...box(""), comment: "" }]);

    const labels = calls.filter((call) => call.name === "fillText");
    expect(labels.some((call) => call.args[0] === "Notes")).toBe(true);
    // Same wording as `formatAreaComments`, so pin 1 on the image and `1.` in
    // the prompt always have a matching legend row.
    expect(labels.some((call) => call.args[0] === "(no comment)")).toBe(true);
  });

  it("draws no footer when there is nothing to say", async () => {
    const { ctx, calls } = recordingContext();
    stubCanvasAndImage(calls, ctx);

    await exportAnnotatedImage("data:", []);

    expect(calls.some((call) => call.name === "fillText" && call.args[0] === "Notes")).toBe(false);
  });

  it("drops the General feedback sub-heading when it is the only block", async () => {
    const { ctx, calls } = recordingContext();
    stubCanvasAndImage(calls, ctx);

    await exportAnnotatedImage("data:", [], { generalFeedback: "ship it" });

    const labels = calls.filter((call) => call.name === "fillText").map((call) => call.args[0]);
    expect(labels).toContain("Notes");
    expect(labels).toContain("ship it");
    expect(labels).not.toContain("General feedback");
  });

  it("keeps a pin drawn at the image corner fully inside the image", async () => {
    const { ctx, calls } = recordingContext();
    stubCanvasAndImage(calls, ctx);

    await exportAnnotatedImage("data:", [
      { ...box("corner"), x: 2, y: 3 },
      { ...arrow("far"), x1: 1199, y1: 799 }
    ]);

    const pins = calls.filter((call) => call.name === "arc" && call.args[2] === 20);
    expect(pins.map((call) => [call.args[0], call.args[1]])).toEqual([
      [20, 20],
      [1180, 780]
    ]);
  });
});

describe("exportAnnotatedImage crop", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const crop: Rect = { x: 100, y: 200, width: 600, height: 400 };

  it("draws only the crop source rect onto a crop-sized canvas", async () => {
    const { ctx, calls } = recordingContext();
    const canvas = stubCanvasAndImage(calls, ctx);

    await exportAnnotatedImage("data:", applyCrop([box("hi")], crop), { crop });

    const [draw] = calls.filter((call) => call.name === "drawImage");
    expect(draw.args.slice(1)).toEqual([100, 200, 600, 400, 0, 0, 600, 400]);
    expect(canvas.width).toBe(600);
    // 400px of image plus the notes footer below it.
    expect(canvas.height).toBeGreaterThan(400);
  });

  it("pins the annotations it is given, already in crop space", async () => {
    const { ctx, calls } = recordingContext();
    stubCanvasAndImage(calls, ctx);

    await exportAnnotatedImage("data:", applyCrop([box("hi"), arrow("there")], crop), { crop });

    // pinRadius(600) === 14; the box lands on the crop origin, so its pin is
    // pulled inside by its own radius, and the arrow tail shifts by the origin.
    const pins = calls.filter((call) => call.name === "arc" && call.args[2] === 14);
    expect(pins.map((call) => [call.args[0], call.args[1]])).toEqual([
      [14, 14],
      [200, 200]
    ]);
  });

  it("clamps a crop that runs past the image bounds", async () => {
    const { ctx, calls } = recordingContext();
    const canvas = stubCanvasAndImage(calls, ctx);

    await exportAnnotatedImage("data:", [], { crop: { x: 1100, y: 700, width: 400, height: 400 } });

    const [draw] = calls.filter((call) => call.name === "drawImage");
    expect(draw.args.slice(1)).toEqual([800, 400, 400, 400, 0, 0, 400, 400]);
    expect(canvas.width).toBe(400);
    expect(canvas.height).toBe(400);
  });

  it("draws the whole image when no crop is given", async () => {
    const { ctx, calls } = recordingContext();
    const canvas = stubCanvasAndImage(calls, ctx);

    await exportAnnotatedImage("data:", []);

    const [draw] = calls.filter((call) => call.name === "drawImage");
    expect(draw.args.slice(1)).toEqual([0, 0, 1200, 800, 0, 0, 1200, 800]);
    expect(canvas.width).toBe(1200);
    expect(canvas.height).toBe(800);
  });

  it("pixelates a redaction in crop space, since the caller already shifted it", async () => {
    const { ctx, calls } = recordingContext();
    stubCanvasAndImage(calls, ctx);

    await exportAnnotatedImage("data:", applyCrop([redaction()], crop), { crop });

    const draws = calls.filter((call) => call.name === "drawImage");
    expect(draws[1].args.slice(1)).toEqual([50, 50, 60, 40, 0, 0, 5, 4]);
    expect(draws[2].args.slice(1)).toEqual([0, 0, 5, 4, 50, 50, 60, 40]);
  });
});

describe("exportAnnotatedImage format", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to a PNG data URL", async () => {
    const { ctx, calls } = recordingContext();
    stubCanvasAndImage(calls, ctx);

    await exportAnnotatedImage("data:", []);

    const toDataURL = calls.find((call) => call.name === "toDataURL");
    expect(toDataURL?.args).toEqual(["image/png"]);
  });

  it("exports a JPEG at quality 0.9 by default when asked", async () => {
    const { ctx, calls } = recordingContext();
    stubCanvasAndImage(calls, ctx);

    await exportAnnotatedImage("data:", [], { format: "jpeg" });

    const toDataURL = calls.find((call) => call.name === "toDataURL");
    expect(toDataURL?.args).toEqual(["image/jpeg", 0.9]);
  });

  it("honours an explicit JPEG quality", async () => {
    const { ctx, calls } = recordingContext();
    stubCanvasAndImage(calls, ctx);

    await exportAnnotatedImage("data:", [], { format: "jpeg", quality: 0.5 });

    const toDataURL = calls.find((call) => call.name === "toDataURL");
    expect(toDataURL?.args).toEqual(["image/jpeg", 0.5]);
  });

  it("fills the canvas white before drawing the base image, only for JPEG", async () => {
    const { ctx, calls } = recordingContext();
    stubCanvasAndImage(calls, ctx);

    await exportAnnotatedImage("data:", [], { format: "jpeg" });

    const draws = calls.filter((call) => call.name === "drawImage");
    const whiteFillColor = calls.findIndex(
      (call) => call.name === "set:fillStyle" && call.args[0] === "#ffffff"
    );
    const whiteFill = calls.findIndex(
      (call) => call.name === "fillRect" && call.args[2] === 1200 && call.args[3] === 800
    );
    expect(whiteFillColor).toBeGreaterThan(-1);
    expect(whiteFill).toBeGreaterThan(-1);
    // The colour must be set before the fill, and the fill must happen before
    // the base image is drawn, or a transparent source pixel would composite
    // onto whatever the canvas already held rather than onto white.
    expect(whiteFillColor).toBeLessThan(whiteFill);
    expect(whiteFill).toBeLessThan(calls.indexOf(draws[0]));
  });

  it("does not fill white for a PNG export", async () => {
    const { ctx, calls } = recordingContext();
    stubCanvasAndImage(calls, ctx);

    await exportAnnotatedImage("data:", []);

    const whiteFill = calls.findIndex(
      (call) => call.name === "fillRect" && call.args[2] === 1200 && call.args[3] === 800
    );
    expect(whiteFill).toBe(-1);
  });
});

function redaction(overrides: Partial<RedactAnnotation> = {}): RedactAnnotation {
  return {
    id: "r1",
    tool: "redact",
    color: "#ff3333",
    createdAt: "2026-02-21T00:00:04.000Z",
    x: 150,
    y: 250,
    width: 60,
    height: 40,
    ...overrides
  };
}

/**
 * The path calls of the one stroke that starts at `from`. Scoped that way
 * because the notes footer draws its own separator rule with the same
 * `moveTo`/`lineTo` pair, and this is about the pen stroke, not that.
 */
function pathFrom(calls: RecordedCall[], from: [number, number]): RecordedCall[] {
  const start = calls.findIndex(
    (call) => call.name === "moveTo" && call.args[0] === from[0] && call.args[1] === from[1]
  );
  if (start < 0) return [];
  const end = calls.findIndex((call, index) => index > start && call.name === "stroke");
  return calls.slice(start, end < 0 ? undefined : end);
}

describe("exportAnnotatedImage highlight and pen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const highlight: HighlightAnnotation = {
    id: "h1",
    tool: "highlight",
    color: "#f59e0b",
    createdAt: "2026-02-21T00:00:01.000Z",
    comment: "read this",
    x: 100,
    y: 200,
    width: 300,
    height: 40
  };

  const pen: PenAnnotation = {
    id: "p1",
    tool: "pen",
    color: "#3b82f6",
    createdAt: "2026-02-21T00:00:02.000Z",
    comment: "scribble",
    points: [
      { x: 500, y: 100 },
      { x: 540, y: 160 },
      { x: 600, y: 130 }
    ]
  };

  it("fills a highlight as a multiply composite and restores the context after", async () => {
    const { ctx, calls } = recordingContext();
    stubCanvasAndImage(calls, ctx);

    await exportAnnotatedImage("data:", [highlight]);

    const fill = calls.findIndex((call) => call.name === "fillRect");
    expect(calls[fill].args).toEqual([100, 200, 300, 40]);

    // The multiply mode and the alpha have to be in force at the fill, and
    // undone by a restore before anything else (the pin, the legend) is drawn.
    const composite = calls.findIndex(
      (call) => call.name === "set:globalCompositeOperation" && call.args[0] === "multiply"
    );
    const alpha = calls.findIndex(
      (call) => call.name === "set:globalAlpha" && call.args[0] === 0.35
    );
    const save = calls.findIndex((call) => call.name === "save");
    expect(save).toBeGreaterThanOrEqual(0);
    expect(save).toBeLessThan(composite);
    expect(composite).toBeLessThan(fill);
    expect(alpha).toBeLessThan(fill);
    const restore = calls.findIndex((call, index) => index > fill && call.name === "restore");
    expect(restore).toBeGreaterThan(fill);

    // The edge is stroked after the restore, so it lands at full opacity and
    // in normal composite - which is the only thing visible over a dark
    // section, where multiply leaves the wash invisible.
    const edge = calls.findIndex((call) => call.name === "strokeRect");
    expect(edge).toBeGreaterThan(restore);
    expect(calls[edge].args).toEqual([100, 200, 300, 40]);
  });

  it("strokes a pen stroke as one round-capped polyline through every point", async () => {
    const { ctx, calls } = recordingContext();
    stubCanvasAndImage(calls, ctx);

    await exportAnnotatedImage("data:", [pen]);

    const path = pathFrom(calls, [500, 100]);
    expect(path.map((call) => [call.name, ...call.args])).toEqual([
      ["moveTo", 500, 100],
      ["lineTo", 540, 160],
      ["lineTo", 600, 130]
    ]);
    expect(calls.some((call) => call.name === "set:lineCap" && call.args[0] === "round")).toBe(
      true
    );
    expect(calls.some((call) => call.name === "set:lineJoin" && call.args[0] === "round")).toBe(
      true
    );
    expect(calls.some((call) => call.name === "stroke")).toBe(true);
  });

  it("pins both at the top-left of their bounds and legends their comments", async () => {
    const { ctx, calls } = recordingContext();
    stubCanvasAndImage(calls, ctx);

    await exportAnnotatedImage("data:", [highlight, pen]);

    const pins = calls.filter((call) => call.name === "arc" && call.args[2] === 20);
    expect(pins.map((call) => [call.args[0], call.args[1]])).toEqual([
      [100, 200],
      [500, 100]
    ]);
    const labels = calls.filter((call) => call.name === "fillText").map((call) => call.args[0]);
    expect(labels).toContain("read this");
    expect(labels).toContain("scribble");
  });

  it("draws nothing for a pen stroke with fewer than two points", async () => {
    const { ctx, calls } = recordingContext();
    stubCanvasAndImage(calls, ctx);

    await exportAnnotatedImage("data:", [{ ...pen, points: [{ x: 10, y: 10 }] }]);

    expect(pathFrom(calls, [10, 10])).toEqual([]);
  });
});

describe("exportAnnotatedImage redactions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pixelates the region through a block-sized buffer, smoothing off", async () => {
    const { ctx, calls } = recordingContext();
    stubCanvasAndImage(calls, ctx);

    await exportAnnotatedImage("data:", [redaction()]);

    const draws = calls.filter((call) => call.name === "drawImage");
    // 1: the base image; 2: the region down to ceil(60/12) x ceil(40/12);
    // 3: that buffer stretched back over the region.
    expect(draws).toHaveLength(3);
    expect(draws[1].args.slice(1)).toEqual([150, 250, 60, 40, 0, 0, 5, 4]);
    expect(draws[2].args.slice(1)).toEqual([0, 0, 5, 4, 150, 250, 60, 40]);

    // The downscale must weigh the whole block, not sample a pixel or two out
    // of it: a sampled block can carry an original pixel through intact.
    const quality = calls.findIndex(
      (call) => call.name === "set:imageSmoothingQuality" && call.args[0] === "high"
    );
    expect(quality).toBeGreaterThan(-1);
    expect(quality).toBeLessThan(calls.indexOf(draws[1]));

    const smoothingOff = calls.findIndex(
      (call) => call.name === "set:imageSmoothingEnabled" && call.args[0] === false
    );
    // Smoothing must be off before the region is painted back, or the blocks
    // interpolate into a blur the original can be read through.
    expect(smoothingOff).toBeGreaterThan(-1);
    expect(smoothingOff).toBeLessThan(calls.indexOf(draws[2]));
  });

  it("pixelates before anything is drawn on top, so no pin can cover a secret", async () => {
    const { ctx, calls } = recordingContext();
    stubCanvasAndImage(calls, ctx);

    await exportAnnotatedImage("data:", [box("hi"), redaction()], { generalFeedback: "ship it" });

    const draws = calls.filter((call) => call.name === "drawImage");
    const lastPixelation = calls.indexOf(draws[2]);
    const firstAnnotationMark = calls.findIndex(
      (call) => call.name === "strokeRect" || call.name === "arc"
    );
    expect(lastPixelation).toBeLessThan(firstAnnotationMark);
  });

  it("gives a redaction no pin and no legend row of its own", async () => {
    const { ctx, calls } = recordingContext();
    stubCanvasAndImage(calls, ctx);

    await exportAnnotatedImage("data:", [box("hi"), redaction()]);

    const pins = calls.filter((call) => call.name === "arc" && call.args[2] === 20);
    expect(pins.map((call) => [call.args[0], call.args[1]])).toEqual([[100, 200]]);
    const labels = calls.filter((call) => call.name === "fillText").map((call) => call.args[0]);
    expect(labels).not.toContain("2");
  });

  it("clamps a redaction that runs past the image, and skips an empty one", async () => {
    const { ctx, calls } = recordingContext();
    stubCanvasAndImage(calls, ctx);

    await exportAnnotatedImage("data:", [
      redaction({ id: "r1", x: 1150, y: 780, width: 200, height: 200 }),
      redaction({ id: "r2", x: 10, y: 10, width: 0, height: 40 })
    ]);

    const draws = calls.filter((call) => call.name === "drawImage");
    expect(draws).toHaveLength(3);
    expect(draws[1].args.slice(1)).toEqual([1150, 780, 50, 20, 0, 0, 5, 2]);
  });
});

describe("pixelateRegion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("blocks a region from an arbitrary source, so the canvas can reuse the export's own code", () => {
    const { ctx, calls } = recordingContext();
    stubCanvasAndImage(calls, ctx);
    // Stands in for the editor's <img>: the live overlay reads the untouched
    // capture, where the export reads its own canvas.
    const source = { width: 1200, height: 800 } as unknown as CanvasImageSource;

    pixelateRegion(ctx, source, redaction(), { width: 1200, height: 800 });

    const draws = calls.filter((call) => call.name === "drawImage");
    // Exactly the two the export makes per region, with the same block
    // geometry: 60x40 down to ceil(60/12) x ceil(40/12) and back.
    expect(draws).toHaveLength(2);
    expect(draws[0].args[0]).toBe(source);
    expect(draws[0].args.slice(1)).toEqual([150, 250, 60, 40, 0, 0, 5, 4]);
    expect(draws[1].args.slice(1)).toEqual([0, 0, 5, 4, 150, 250, 60, 40]);
  });

  it("skips a region with no area, so a zero-sized drawImage can never be attempted", () => {
    const { ctx, calls } = recordingContext();
    stubCanvasAndImage(calls, ctx);

    pixelateRegion(ctx, {} as CanvasImageSource, redaction({ width: 0 }), {
      width: 1200,
      height: 800
    });

    expect(calls.filter((call) => call.name === "drawImage")).toHaveLength(0);
  });
});

describe("redactionBounds", () => {
  it("anchors a crop-clipped region where the export does, not at its un-clipped corner", () => {
    // A crop whose left edge is not on a block boundary (505 % 12 !== 0), with
    // a redaction that starts outside it - the case where a preview drawn in
    // image space and an export drawn in crop space disagree.
    const crop: Rect = { x: 505, y: 100, width: 400, height: 300 };
    const region = redaction({ x: 490, y: 150, width: 120, height: 40 });
    const image = { width: 1200, height: 800 };

    const [clipped] = applyCrop([region], crop) as RedactAnnotation[];
    // What the export pixelates: the visible part, measured from the crop.
    expect(clipped.x).toBe(0);
    const exported = redactionBounds(clipped, { width: crop.width, height: crop.height })!;
    expect(exported).toEqual({ x: 0, y: 50, width: 105, height: 40 });

    const seams = (start: number, width: number): number[] =>
      Array.from({ length: Math.ceil(width / 12) }, (_, i) => start + i * 12);

    // Back in image px, the export's block seams start at the crop's edge...
    const exportSeams = seams(crop.x + exported.x, exported.width);
    expect(exportSeams[0]).toBe(505);

    // ...where pixelating the whole region off the untouched image would start
    // them 15px earlier and land every seam somewhere else. That is the
    // divergence the canvas overlay avoids by rendering the export's own view.
    const naive = redactionBounds(region, image)!;
    const naiveSeams = seams(naive.x, naive.width);
    expect(naiveSeams[0]).toBe(490);
    expect(exportSeams.some((seam) => naiveSeams.includes(seam))).toBe(false);
  });

  it("returns null for a region the canvas has no room for", () => {
    expect(redactionBounds(redaction({ x: 1200, width: 40 }), { width: 1200, height: 800 })).toBe(
      null
    );
  });
});
