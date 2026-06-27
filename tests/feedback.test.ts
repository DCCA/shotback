import { describe, expect, it } from "vitest";
import {
  annotationSummary,
  buildClaudeCodePrompt,
  buildExternalLlmPrompt
} from "../src/lib/feedback";
import type { ArrowAnnotation, BoxAnnotation, TextAnnotation } from "../src/types/annotation";

const baseTimestamp = "2026-02-21T00:00:00.000Z";

function box(comment?: string): BoxAnnotation {
  return {
    id: "b1",
    tool: "box",
    color: "#ff0000",
    createdAt: baseTimestamp,
    comment,
    x: 0,
    y: 0,
    width: 10,
    height: 10
  };
}

function arrow(comment?: string): ArrowAnnotation {
  return {
    id: "a1",
    tool: "arrow",
    color: "#00ff00",
    createdAt: baseTimestamp,
    comment,
    x1: 0,
    y1: 0,
    x2: 5,
    y2: 5
  };
}

function text(value: string): TextAnnotation {
  return {
    id: "t1",
    tool: "text",
    color: "#0000ff",
    createdAt: baseTimestamp,
    x: 1,
    y: 2,
    text: value
  };
}

describe("annotationSummary", () => {
  it("returns the text content for text annotations", () => {
    expect(annotationSummary(text("Heading is misaligned"))).toBe("Heading is misaligned");
  });

  it("returns the trimmed comment for area annotations", () => {
    expect(annotationSummary(box("  spacing too tight  "))).toBe("spacing too tight");
  });

  it("falls back to a placeholder when no comment is present", () => {
    expect(annotationSummary(box())).toBe("(no comment)");
    expect(annotationSummary(arrow("   "))).toBe("(no comment)");
  });
});

describe("buildExternalLlmPrompt", () => {
  it("uses placeholders when nothing is provided", () => {
    const prompt = buildExternalLlmPrompt({
      pageUrl: "",
      generalFeedback: "",
      annotations: []
    });

    expect(prompt).toContain("Page URL: (unknown)");
    expect(prompt).toContain("General feedback context: (none)");
    expect(prompt).toContain("Area comments:\n(none)");
  });

  it("numbers each annotation and tags it with its tool", () => {
    const prompt = buildExternalLlmPrompt({
      pageUrl: "https://example.test/page",
      generalFeedback: "  overall looks good  ",
      annotations: [box("fix padding"), arrow("point here"), text("Label")]
    });

    expect(prompt).toContain("Page URL: https://example.test/page");
    expect(prompt).toContain("General feedback context: overall looks good");
    expect(prompt).toContain("1. [box] fix padding");
    expect(prompt).toContain("2. [arrow] point here");
    expect(prompt).toContain("3. [text] Label");
  });

  it("marks empty text and missing comments explicitly", () => {
    const prompt = buildExternalLlmPrompt({
      pageUrl: "https://example.test",
      generalFeedback: "",
      annotations: [box(), text("")]
    });

    expect(prompt).toContain("1. [box] (no comment)");
    expect(prompt).toContain("2. [text] (empty)");
  });
});

describe("buildClaudeCodePrompt", () => {
  it("leads with the saved file path", () => {
    const prompt = buildClaudeCodePrompt({
      filePath: "/mnt/c/Users/dcca/Downloads/shotback/cap.png",
      pageUrl: "https://example.test/page",
      generalFeedback: "looks off",
      annotations: [box("fix padding")]
    });

    expect(
      prompt.startsWith("Review this screenshot: /mnt/c/Users/dcca/Downloads/shotback/cap.png")
    ).toBe(true);
    expect(prompt).toContain("Page URL: https://example.test/page");
    expect(prompt).toContain("General feedback context: looks off");
    expect(prompt).toContain("1. [box] fix padding");
  });

  it("uses placeholders when context is empty", () => {
    const prompt = buildClaudeCodePrompt({
      filePath: "Downloads/shotback/cap.png",
      pageUrl: "",
      generalFeedback: "",
      annotations: []
    });

    expect(prompt).toContain("Review this screenshot: Downloads/shotback/cap.png");
    expect(prompt).toContain("Page URL: (unknown)");
    expect(prompt).toContain("General feedback context: (none)");
    expect(prompt).toContain("Area comments:\n(none)");
  });
});
