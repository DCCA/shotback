import { describe, expect, it } from "vitest";
import { selectFeedbackRenderMode } from "../src/lib/annotate";

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
