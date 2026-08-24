import { describe, expect, it } from "vitest";
import type { CaptureEnvironment, PageDiagnostics } from "../src/lib/capture";
import { buildSidecar } from "../src/lib/sidecar";
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
});
