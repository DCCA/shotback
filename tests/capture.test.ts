import { describe, expect, it } from "vitest";
import { buildScrollSteps } from "../src/lib/capture";

describe("buildScrollSteps", () => {
  it("returns single step when content fits viewport", () => {
    expect(buildScrollSteps(600, 900)).toEqual([0]);
  });

  it("includes final aligned step", () => {
    expect(buildScrollSteps(2500, 1000)).toEqual([0, 1000, 1500]);
  });

  it("does not duplicate last step", () => {
    expect(buildScrollSteps(3000, 1000)).toEqual([0, 1000, 2000]);
  });
});
