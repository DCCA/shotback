import { describe, expect, it } from "vitest";
import type { CaptureEnvironment, PageDiagnostics } from "../src/lib/capture";
import { buildBatchSidecar, buildSidecar } from "../src/lib/sidecar";
import type { Annotation } from "../src/types/annotation";

const image = { width: 1000, height: 2000 };

const box: Annotation = {
  id: "b",
  tool: "box",
  color: "#f00",
  createdAt: "2026-08-24T00:00:02.000Z",
  comment: "  too tight  ",
  x: 100,
  y: 250,
  width: 300,
  height: 120
};

const arrow: Annotation = {
  id: "a",
  tool: "arrow",
  color: "#f00",
  createdAt: "2026-08-24T00:00:01.000Z",
  x1: 400,
  y1: 500,
  x2: 100,
  y2: 300
};

const text: Annotation = {
  id: "t",
  tool: "text",
  color: "#f00",
  createdAt: "2026-08-24T00:00:03.000Z",
  x: 50,
  y: 40,
  text: "label"
};

const base = {
  capturedAt: "2026-08-24T00:00:00.000Z",
  pageUrl: "https://example.test/pricing",
  generalFeedback: "  the hero is noisy  ",
  image,
  imagePath: "shotback/cap-42.png"
};

describe("buildSidecar", () => {
  it("carries the version, capture metadata and image path", () => {
    const sidecar = buildSidecar({ ...base, annotations: [] });
    expect(sidecar.version).toBe(1);
    expect(sidecar.capturedAt).toBe("2026-08-24T00:00:00.000Z");
    expect(sidecar.pageUrl).toBe("https://example.test/pricing");
    expect(sidecar.generalFeedback).toBe("the hero is noisy");
    expect(sidecar.imagePath).toBe("shotback/cap-42.png");
    expect(sidecar.annotations).toEqual([]);
  });

  it("numbers annotations by creation time, not array order", () => {
    const sidecar = buildSidecar({ ...base, annotations: [text, box, arrow] });
    expect(sidecar.annotations.map((a) => [a.n, a.tool])).toEqual([
      [1, "arrow"],
      [2, "box"],
      [3, "text"]
    ]);
  });

  it("lists a highlight and a pen stroke with their bounds", () => {
    const highlight: Annotation = {
      id: "h",
      tool: "highlight",
      color: "#f59e0b",
      createdAt: "2026-08-24T00:00:04.000Z",
      comment: "read this",
      x: 100,
      y: 200,
      width: 300,
      height: 40
    };
    const pen: Annotation = {
      id: "p",
      tool: "pen",
      color: "#3b82f6",
      createdAt: "2026-08-24T00:00:05.000Z",
      comment: "scribble",
      points: [
        { x: 500, y: 100 },
        { x: 600, y: 300 }
      ]
    };

    const sidecar = buildSidecar({ ...base, annotations: [highlight, pen] });
    expect(sidecar.annotations.map((a) => [a.n, a.tool, a.comment])).toEqual([
      [1, "highlight", "read this"],
      [2, "pen", "scribble"]
    ]);
    expect(sidecar.annotations[0].rect).toEqual({ x: 100, y: 200, width: 300, height: 40 });
    // A pen stroke has no rect of its own: its bounds are the extent of its
    // points, which is what an agent needs to find it on the image.
    expect(sidecar.annotations[1].rect).toEqual({ x: 500, y: 100, width: 100, height: 200 });
    expect(sidecar.annotations[1].normalizedRect).toEqual({
      x: 0.5,
      y: 0.05,
      width: 0.1,
      height: 0.1
    });
  });

  it("clamps a reported rect to the image, so the JSON never leaves 0..1", () => {
    // A pen stroke kept by a crop because one point was inside: the points
    // outside it keep their real (now negative) coordinates so the stroke is
    // not redrawn, but the rect the sidecar *reports* describes where it is on
    // the exported image - which cannot be off it.
    const pen: Annotation = {
      id: "p",
      tool: "pen",
      color: "#3b82f6",
      createdAt: "2026-08-24T00:00:06.000Z",
      comment: "crosses the edge",
      points: [
        { x: -80, y: -40 },
        { x: 300, y: 500 },
        { x: 1400, y: 2600 }
      ]
    };

    const sidecar = buildSidecar({ ...base, annotations: [pen] });
    const { rect, normalizedRect } = sidecar.annotations[0];
    expect(rect).toEqual({ x: 0, y: 0, width: 1000, height: 2000 });
    for (const value of Object.values(normalizedRect)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("leaves a rect already inside the image alone", () => {
    // The clamp must not quietly reshape the tools that were already correct.
    expect(buildSidecar({ ...base, annotations: [box] }).annotations[0].rect).toEqual({
      x: 100,
      y: 250,
      width: 300,
      height: 120
    });
  });

  it("carries the note text of each annotation", () => {
    const sidecar = buildSidecar({ ...base, annotations: [box, text] });
    expect(sidecar.annotations.map((a) => a.comment)).toEqual(["too tight", "label"]);
  });

  it("uses a placeholder comment when a box has none", () => {
    const sidecar = buildSidecar({
      ...base,
      annotations: [{ ...box, comment: undefined }]
    });
    expect(sidecar.annotations[0].comment).toBe("(no comment)");
  });

  it("reports a box rect in image px and normalized to the image", () => {
    const sidecar = buildSidecar({ ...base, annotations: [box] });
    expect(sidecar.annotations[0].rect).toEqual({ x: 100, y: 250, width: 300, height: 120 });
    expect(sidecar.annotations[0].normalizedRect).toEqual({
      x: 0.1,
      y: 0.125,
      width: 0.3,
      height: 0.06
    });
  });

  it("rounds the normalized rect to four decimals", () => {
    const sidecar = buildSidecar({
      ...base,
      annotations: [{ ...box, x: 333, y: 333, width: 333, height: 333 }]
    });
    expect(sidecar.annotations[0].normalizedRect).toEqual({
      x: 0.333,
      y: 0.1665,
      width: 0.333,
      height: 0.1665
    });
  });

  it("reports an arrow as its bounding box", () => {
    const sidecar = buildSidecar({ ...base, annotations: [arrow] });
    expect(sidecar.annotations[0].rect).toEqual({ x: 100, y: 300, width: 300, height: 200 });
  });

  it("reports a text annotation with its estimated bounds", () => {
    const sidecar = buildSidecar({ ...base, annotations: [text] });
    expect(sidecar.annotations[0].rect).toEqual({ x: 50, y: 22, width: 50, height: 22 });
  });

  it("keeps a normalized rect finite when no capture has sized the image", () => {
    const sidecar = buildSidecar({
      ...base,
      image: { width: 0, height: 0 },
      annotations: [box]
    });
    expect(sidecar.annotations[0].normalizedRect).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it("passes the element context through untouched", () => {
    const context = {
      cssPath: "#app > button.cta",
      tag: "button",
      classes: ["cta"],
      component: ["PricingCard"],
      rect: { x: 100, y: 250, width: 300, height: 120 }
    };
    const sidecar = buildSidecar({ ...base, annotations: [{ ...box, context }] });
    expect(sidecar.annotations[0].context).toEqual(context);
  });

  it("omits environment, diagnostics and context when there are none", () => {
    const sidecar = buildSidecar({ ...base, annotations: [box] });
    expect(Object.keys(JSON.parse(JSON.stringify(sidecar)))).toEqual([
      "version",
      "capturedAt",
      "pageUrl",
      "generalFeedback",
      "annotations",
      "imagePath"
    ]);
    expect(Object.keys(JSON.parse(JSON.stringify(sidecar)).annotations[0])).toEqual([
      "n",
      "tool",
      "comment",
      "rect",
      "normalizedRect"
    ]);
  });

  it("passes environment and diagnostics through", () => {
    const environment: CaptureEnvironment = {
      pageTitle: "Pricing",
      pageUrl: "https://example.test/pricing",
      capturedAt: "2026-08-24T00:00:00.000Z",
      viewport: { width: 1280, height: 800 },
      devicePixelRatio: 2,
      userAgent: "test-agent",
      colorScheme: "dark",
      scroller: "element"
    };
    const diagnostics: PageDiagnostics = {
      failedRequests: [{ url: "https://example.test/logo.png", status: 404, initiatorType: "img" }]
    };
    const sidecar = buildSidecar({ ...base, annotations: [], environment, diagnostics });
    expect(sidecar.environment).toEqual(environment);
    expect(sidecar.diagnostics).toEqual(diagnostics);
  });

  it("carries the image format when given", () => {
    const sidecar = buildSidecar({ ...base, annotations: [], imageFormat: "jpeg" });
    expect(sidecar.imageFormat).toBe("jpeg");
  });

  it("omits the image format when not given", () => {
    const sidecar = buildSidecar({ ...base, annotations: [] });
    expect(sidecar.imageFormat).toBeUndefined();
    expect(Object.keys(JSON.parse(JSON.stringify(sidecar)))).not.toContain("imageFormat");
  });
});

const redaction: Annotation = {
  id: "r",
  tool: "redact",
  color: "#ff3333",
  createdAt: "2026-08-24T00:00:04.000Z",
  x: 100,
  y: 200,
  width: 250,
  height: 100
};

describe("buildSidecar redactions", () => {
  it("lists them apart from the annotations, with no number, comment or context", () => {
    const sidecar = buildSidecar({ ...base, annotations: [box, redaction] });
    expect(sidecar.annotations.map((a) => a.tool)).toEqual(["box"]);
    expect(sidecar.redactions).toEqual([
      {
        tool: "redact",
        rect: { x: 100, y: 200, width: 250, height: 100 },
        normalizedRect: { x: 0.1, y: 0.1, width: 0.25, height: 0.05 }
      }
    ]);
  });

  it("omits the field entirely when nothing is redacted", () => {
    expect(buildSidecar({ ...base, annotations: [box] }).redactions).toBeUndefined();
  });
});

describe("buildBatchSidecar", () => {
  const first = buildSidecar({ ...base, annotations: [box], imagePath: "cap-0.png" });
  const second = buildSidecar({
    ...base,
    annotations: [],
    pageUrl: "https://example.test/checkout",
    imagePath: "cap-1.png"
  });

  it("wraps the per-capture sidecars untouched under one version", () => {
    const batch = buildBatchSidecar([first, second]);
    expect(batch.version).toBe(1);
    expect(batch.captures).toEqual([first, second]);
  });

  it("keeps every capture's batch-relative image path", () => {
    expect(buildBatchSidecar([first, second]).captures.map((c) => c.imagePath)).toEqual([
      "cap-0.png",
      "cap-1.png"
    ]);
  });

  it("has no captures for an empty batch", () => {
    expect(buildBatchSidecar([])).toEqual({ version: 1, captures: [] });
  });
});
