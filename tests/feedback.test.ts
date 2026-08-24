import { describe, expect, it } from "vitest";
import {
  annotationSummary,
  buildClaudeCodePrompt,
  buildExternalLlmPrompt
} from "../src/lib/feedback";
import type {
  ArrowAnnotation,
  BoxAnnotation,
  RedactAnnotation,
  TextAnnotation
} from "../src/types/annotation";

// Distinct, ordered timestamps: numbering follows creation time, so the
// helpers must not rely on the array position they happen to be passed in.
const boxTimestamp = "2026-02-21T00:00:01.000Z";
const arrowTimestamp = "2026-02-21T00:00:02.000Z";
const textTimestamp = "2026-02-21T00:00:03.000Z";

function box(comment?: string): BoxAnnotation {
  return {
    id: "b1",
    tool: "box",
    color: "#ff0000",
    createdAt: boxTimestamp,
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
    createdAt: arrowTimestamp,
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
    createdAt: textTimestamp,
    x: 1,
    y: 2,
    text: value
  };
}

const environment = {
  pageTitle: "Acme Dashboard",
  pageUrl: "https://example.test/page",
  capturedAt: "2026-08-24T10:11:12.000Z",
  viewport: { width: 1280, height: 800 },
  devicePixelRatio: 2,
  userAgent: "Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0.0.0",
  colorScheme: "dark" as const,
  scroller: "document" as const
};

const image = { width: 1000, height: 500 };

const elementContext = {
  cssPath: "#app > section.hero > button.cta",
  tag: "button",
  classes: ["cta"],
  text: "Buy now",
  rect: { x: 200, y: 184, width: 200, height: 120 }
};

const environmentBlock = [
  "Environment:",
  "- Page title: Acme Dashboard",
  "- Viewport: 1280x800 @2x",
  "- Color scheme: dark",
  "- Scroller: document",
  "- User agent: Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0.0.0",
  "- Captured at: 2026-08-24T10:11:12.000Z"
].join("\n");

const diagnostics = {
  failedRequests: [
    { url: "https://example.test/missing.png", status: 404, initiatorType: "img" },
    { url: "https://example.test/api/user", status: 500, initiatorType: "fetch" }
  ]
};

const emptyDiagnostics = { failedRequests: [] };

const diagnosticsBlock = [
  "Diagnostics:",
  "- Failed requests:",
  "  1. 404 https://example.test/missing.png",
  "  2. 500 https://example.test/api/user"
].join("\n");

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

  it("renders the environment block after the page URL when one is captured", () => {
    const prompt = buildExternalLlmPrompt({
      pageUrl: "https://example.test/page",
      generalFeedback: "",
      annotations: [],
      environment
    });

    expect(prompt).toBe(
      [
        "Please review this screenshot and provide feedback.",
        "",
        "Page URL: https://example.test/page",
        "",
        environmentBlock,
        "",
        "General feedback context: (none)",
        "",
        "Area comments:",
        "(none)"
      ].join("\n")
    );
  });

  it("falls back to a placeholder title", () => {
    const prompt = buildExternalLlmPrompt({
      pageUrl: "https://example.test/page",
      generalFeedback: "",
      annotations: [],
      environment: { ...environment, pageTitle: "  " }
    });

    expect(prompt).toContain("- Page title: (untitled)");
  });

  it("omits the environment block entirely when no environment is captured", () => {
    const prompt = buildExternalLlmPrompt({
      pageUrl: "https://example.test/page",
      generalFeedback: "",
      annotations: []
    });

    expect(prompt).toBe(
      [
        "Please review this screenshot and provide feedback.",
        "",
        "Page URL: https://example.test/page",
        "General feedback context: (none)",
        "",
        "Area comments:",
        "(none)"
      ].join("\n")
    );
  });

  it("numbers area comments by creation time", () => {
    const first = { ...box("first"), id: "b1", createdAt: "2026-02-21T00:00:01.000Z" };
    const second = { ...box("second"), id: "b2", createdAt: "2026-02-21T00:00:02.000Z" };
    const prompt = buildExternalLlmPrompt({
      pageUrl: "u",
      generalFeedback: "",
      annotations: [second, first]
    });
    expect(prompt).toContain("1. [box] first");
    expect(prompt).toContain("2. [box] second");
  });

  it("names the element under each annotation when a context was captured", () => {
    const prompt = buildExternalLlmPrompt({
      pageUrl: "https://example.test/page",
      generalFeedback: "",
      annotations: [
        { ...box("fix padding"), context: elementContext },
        {
          ...arrow("point here"),
          context: { ...elementContext, component: ["PricingCard", "Page"] }
        },
        text("Label")
      ],
      image
    });

    expect(prompt).toBe(
      [
        "Please review this screenshot and provide feedback.",
        "",
        "Page URL: https://example.test/page",
        "General feedback context: (none)",
        "",
        "Area comments:",
        "1. [box] fix padding - at (0, 0) size 10x10 px [0%, 0% of page] -> #app > section.hero > button.cta",
        "2. [arrow] point here - from (0, 0) to (5, 5) px -> #app > section.hero > button.cta in <PricingCard > Page>",
        "3. [text] Label - at (1, 2) px"
      ].join("\n")
    );
  });

  it("names the element even when no image size is given", () => {
    const prompt = buildExternalLlmPrompt({
      pageUrl: "https://example.test/page",
      generalFeedback: "",
      annotations: [{ ...box("fix padding"), context: elementContext }]
    });

    expect(prompt).toContain("1. [box] fix padding -> #app > section.hero > button.cta");
  });

  it("appends per-annotation geometry when an image size is given", () => {
    const prompt = buildExternalLlmPrompt({
      pageUrl: "https://example.test/page",
      generalFeedback: "",
      annotations: [box("fix padding"), arrow("point here"), text("Label")],
      image
    });

    expect(prompt).toBe(
      [
        "Please review this screenshot and provide feedback.",
        "",
        "Page URL: https://example.test/page",
        "General feedback context: (none)",
        "",
        "Area comments:",
        "1. [box] fix padding - at (0, 0) size 10x10 px [0%, 0% of page]",
        "2. [arrow] point here - from (0, 0) to (5, 5) px",
        "3. [text] Label - at (1, 2) px"
      ].join("\n")
    );
  });

  it("renders the diagnostics block after the environment block (detailed only)", () => {
    const prompt = buildExternalLlmPrompt({
      pageUrl: "https://example.test/page",
      generalFeedback: "",
      annotations: [],
      environment,
      diagnostics,
      verbosity: "detailed"
    });

    expect(prompt).toBe(
      [
        "Please review this screenshot and provide feedback.",
        "",
        "Page URL: https://example.test/page",
        "",
        environmentBlock,
        "",
        diagnosticsBlock,
        "",
        "General feedback context: (none)",
        "",
        "Area comments:",
        "(none)"
      ].join("\n")
    );
  });

  it("omits the diagnostics block at standard verbosity even when diagnostics were captured", () => {
    const prompt = buildExternalLlmPrompt({
      pageUrl: "https://example.test/page",
      generalFeedback: "",
      annotations: [],
      environment,
      diagnostics
    });

    expect(prompt).not.toContain("Diagnostics:");
  });

  it("renders the diagnostics block on its own when no environment was captured (detailed only)", () => {
    const prompt = buildExternalLlmPrompt({
      pageUrl: "https://example.test/page",
      generalFeedback: "",
      annotations: [],
      diagnostics,
      verbosity: "detailed"
    });

    expect(prompt).toBe(
      [
        "Please review this screenshot and provide feedback.",
        "",
        "Page URL: https://example.test/page",
        "",
        diagnosticsBlock,
        "",
        "General feedback context: (none)",
        "",
        "Area comments:",
        "(none)"
      ].join("\n")
    );
  });

  it("caps the failed-request list at twenty entries (detailed)", () => {
    const prompt = buildExternalLlmPrompt({
      pageUrl: "https://example.test/page",
      generalFeedback: "",
      annotations: [],
      diagnostics: {
        failedRequests: Array.from({ length: 25 }, (_, i) => ({
          url: `https://example.test/${i}`,
          status: 500,
          initiatorType: "fetch"
        }))
      },
      verbosity: "detailed"
    });

    expect(prompt).toContain("  20. 500 https://example.test/19");
    expect(prompt).not.toContain("https://example.test/20");
  });

  it("omits the diagnostics block when nothing was collected (byte-identical to Task 15)", () => {
    const prompt = buildExternalLlmPrompt({
      pageUrl: "https://example.test/page",
      generalFeedback: "",
      annotations: [box("fix padding")],
      diagnostics: emptyDiagnostics
    });

    expect(prompt).toBe(
      [
        "Please review this screenshot and provide feedback.",
        "",
        "Page URL: https://example.test/page",
        "General feedback context: (none)",
        "",
        "Area comments:",
        "1. [box] fix padding"
      ].join("\n")
    );
  });

  it("omits geometry entirely when no image size is given (byte-identical to Task 13)", () => {
    const prompt = buildExternalLlmPrompt({
      pageUrl: "https://example.test/page",
      generalFeedback: "",
      annotations: [box("fix padding")]
    });

    expect(prompt).toBe(
      [
        "Please review this screenshot and provide feedback.",
        "",
        "Page URL: https://example.test/page",
        "General feedback context: (none)",
        "",
        "Area comments:",
        "1. [box] fix padding"
      ].join("\n")
    );
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

  it("points at the JSON sidecar right after the image", () => {
    const prompt = buildClaudeCodePrompt({
      filePath: "/mnt/c/Downloads/shotback/cap-42.png",
      sidecarPath: "/mnt/c/Downloads/shotback/cap-42.json",
      pageUrl: "https://example.test/page",
      generalFeedback: "",
      annotations: [box("fix padding")]
    });

    expect(prompt.split("\n").slice(0, 2)).toEqual([
      "Review this screenshot: /mnt/c/Downloads/shotback/cap-42.png",
      "Machine-readable annotations (selectors, rects, diagnostics): /mnt/c/Downloads/shotback/cap-42.json"
    ]);
  });

  it("omits the sidecar line when no sidecar was written", () => {
    const prompt = buildClaudeCodePrompt({
      filePath: "/mnt/c/Downloads/shotback/cap-42.png",
      pageUrl: "https://example.test/page",
      generalFeedback: "",
      annotations: [box("fix padding")]
    });

    expect(prompt).not.toContain("Machine-readable annotations");
    expect(prompt.split("\n")[1]).toBe("");
  });

  it("names the element under each annotation when a context was captured", () => {
    const prompt = buildClaudeCodePrompt({
      filePath: "/mnt/c/Downloads/shotback/cap.png",
      pageUrl: "https://example.test/page",
      generalFeedback: "",
      annotations: [
        { ...box("fix padding"), context: { ...elementContext, component: ["PricingCard"] } }
      ],
      image
    });

    expect(prompt).toContain(
      "1. [box] fix padding - at (0, 0) size 10x10 px [0%, 0% of page] -> #app > section.hero > button.cta in <PricingCard>"
    );
  });

  it("renders the environment block after the page URL when one is captured", () => {
    const prompt = buildClaudeCodePrompt({
      filePath: "/mnt/c/Downloads/shotback/cap.png",
      pageUrl: "https://example.test/page",
      generalFeedback: "",
      annotations: [],
      environment
    });

    expect(prompt).toBe(
      [
        "Review this screenshot: /mnt/c/Downloads/shotback/cap.png",
        "",
        "Page URL: https://example.test/page",
        "",
        environmentBlock,
        "",
        "General feedback context: (none)",
        "",
        "Area comments:",
        "(none)"
      ].join("\n")
    );
  });

  it("omits the environment block entirely when no environment is captured", () => {
    const prompt = buildClaudeCodePrompt({
      filePath: "/mnt/c/Downloads/shotback/cap.png",
      pageUrl: "https://example.test/page",
      generalFeedback: "",
      annotations: []
    });

    expect(prompt).toBe(
      [
        "Review this screenshot: /mnt/c/Downloads/shotback/cap.png",
        "",
        "Page URL: https://example.test/page",
        "General feedback context: (none)",
        "",
        "Area comments:",
        "(none)"
      ].join("\n")
    );
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

  it("appends per-annotation geometry when an image size is given", () => {
    const prompt = buildClaudeCodePrompt({
      filePath: "/mnt/c/Downloads/shotback/cap.png",
      pageUrl: "https://example.test/page",
      generalFeedback: "",
      annotations: [box("fix padding"), arrow("point here"), text("Label")],
      image
    });

    expect(prompt).toBe(
      [
        "Review this screenshot: /mnt/c/Downloads/shotback/cap.png",
        "",
        "Page URL: https://example.test/page",
        "General feedback context: (none)",
        "",
        "Area comments:",
        "1. [box] fix padding - at (0, 0) size 10x10 px [0%, 0% of page]",
        "2. [arrow] point here - from (0, 0) to (5, 5) px",
        "3. [text] Label - at (1, 2) px"
      ].join("\n")
    );
  });

  it("renders the diagnostics block after the environment block (detailed only)", () => {
    const prompt = buildClaudeCodePrompt({
      filePath: "/mnt/c/Downloads/shotback/cap.png",
      pageUrl: "https://example.test/page",
      generalFeedback: "",
      annotations: [],
      environment,
      diagnostics,
      verbosity: "detailed"
    });

    expect(prompt).toBe(
      [
        "Review this screenshot: /mnt/c/Downloads/shotback/cap.png",
        "",
        "Page URL: https://example.test/page",
        "",
        environmentBlock,
        "",
        diagnosticsBlock,
        "",
        "General feedback context: (none)",
        "",
        "Area comments:",
        "(none)"
      ].join("\n")
    );
  });

  it("omits the diagnostics block at standard verbosity even when diagnostics were captured", () => {
    const prompt = buildClaudeCodePrompt({
      filePath: "/mnt/c/Downloads/shotback/cap.png",
      pageUrl: "https://example.test/page",
      generalFeedback: "",
      annotations: [],
      environment,
      diagnostics
    });

    expect(prompt).not.toContain("Diagnostics:");
  });

  it("omits the diagnostics block when nothing was collected (byte-identical to Task 15)", () => {
    const prompt = buildClaudeCodePrompt({
      filePath: "/mnt/c/Downloads/shotback/cap.png",
      pageUrl: "https://example.test/page",
      generalFeedback: "",
      annotations: [],
      diagnostics: emptyDiagnostics
    });

    expect(prompt).toBe(
      [
        "Review this screenshot: /mnt/c/Downloads/shotback/cap.png",
        "",
        "Page URL: https://example.test/page",
        "General feedback context: (none)",
        "",
        "Area comments:",
        "(none)"
      ].join("\n")
    );
  });

  it("omits geometry entirely when no image size is given (byte-identical to Task 13)", () => {
    const prompt = buildClaudeCodePrompt({
      filePath: "/mnt/c/Downloads/shotback/cap.png",
      pageUrl: "https://example.test/page",
      generalFeedback: "",
      annotations: [box("fix padding")]
    });

    expect(prompt).toBe(
      [
        "Review this screenshot: /mnt/c/Downloads/shotback/cap.png",
        "",
        "Page URL: https://example.test/page",
        "General feedback context: (none)",
        "",
        "Area comments:",
        "1. [box] fix padding"
      ].join("\n")
    );
  });
});

// A single fixed input, varied only by `verbosity`, so each level's snapshot
// isolates exactly what that level adds or drops. Covers environment,
// geometry, per-annotation context (including a React component chain) and
// diagnostics all at once.
const verbosityAnnotations = [
  { ...box("fix padding"), context: elementContext },
  { ...arrow("point here"), context: { ...elementContext, component: ["PricingCard", "Page"] } },
  text("Label")
];

describe("prompt verbosity levels", () => {
  it("buildExternalLlmPrompt: compact drops environment, geometry, context and diagnostics", () => {
    const prompt = buildExternalLlmPrompt({
      pageUrl: "https://example.test/page",
      generalFeedback: "",
      annotations: verbosityAnnotations,
      environment,
      diagnostics,
      image,
      verbosity: "compact"
    });

    expect(prompt).toBe(
      [
        "Please review this screenshot and provide feedback.",
        "",
        "Page URL: https://example.test/page",
        "General feedback context: (none)",
        "",
        "Area comments:",
        "1. [box] fix padding",
        "2. [arrow] point here",
        "3. [text] Label"
      ].join("\n")
    );
  });

  it("buildExternalLlmPrompt: standard carries environment, geometry and context but not diagnostics", () => {
    const prompt = buildExternalLlmPrompt({
      pageUrl: "https://example.test/page",
      generalFeedback: "",
      annotations: verbosityAnnotations,
      environment,
      diagnostics,
      image
      // verbosity omitted: "standard" is the default.
    });

    expect(prompt).toBe(
      [
        "Please review this screenshot and provide feedback.",
        "",
        "Page URL: https://example.test/page",
        "",
        environmentBlock,
        "",
        "General feedback context: (none)",
        "",
        "Area comments:",
        "1. [box] fix padding - at (0, 0) size 10x10 px [0%, 0% of page] -> #app > section.hero > button.cta",
        "2. [arrow] point here - from (0, 0) to (5, 5) px -> #app > section.hero > button.cta in <PricingCard > Page>",
        "3. [text] Label - at (1, 2) px"
      ].join("\n")
    );
  });

  it("buildExternalLlmPrompt: detailed adds diagnostics and per-annotation context detail lines", () => {
    const prompt = buildExternalLlmPrompt({
      pageUrl: "https://example.test/page",
      generalFeedback: "",
      annotations: verbosityAnnotations,
      environment,
      diagnostics,
      image,
      verbosity: "detailed"
    });

    expect(prompt).toBe(
      [
        "Please review this screenshot and provide feedback.",
        "",
        "Page URL: https://example.test/page",
        "",
        environmentBlock,
        "",
        diagnosticsBlock,
        "",
        "General feedback context: (none)",
        "",
        "Area comments:",
        "1. [box] fix padding - at (0, 0) size 10x10 px [0%, 0% of page] -> #app > section.hero > button.cta",
        '   text: "Buy now"',
        "   classes: [cta]",
        "   rect: 200,184 200x120",
        "2. [arrow] point here - from (0, 0) to (5, 5) px -> #app > section.hero > button.cta in <PricingCard > Page>",
        '   text: "Buy now"',
        "   classes: [cta]",
        "   rect: 200,184 200x120",
        "3. [text] Label - at (1, 2) px"
      ].join("\n")
    );
  });

  it("buildClaudeCodePrompt: compact drops environment, geometry, context and diagnostics", () => {
    const prompt = buildClaudeCodePrompt({
      filePath: "/mnt/c/Downloads/shotback/cap.png",
      pageUrl: "https://example.test/page",
      generalFeedback: "",
      annotations: verbosityAnnotations,
      environment,
      diagnostics,
      image,
      verbosity: "compact"
    });

    expect(prompt).toBe(
      [
        "Review this screenshot: /mnt/c/Downloads/shotback/cap.png",
        "",
        "Page URL: https://example.test/page",
        "General feedback context: (none)",
        "",
        "Area comments:",
        "1. [box] fix padding",
        "2. [arrow] point here",
        "3. [text] Label"
      ].join("\n")
    );
  });

  it("buildClaudeCodePrompt: standard carries environment, geometry and context but not diagnostics", () => {
    const prompt = buildClaudeCodePrompt({
      filePath: "/mnt/c/Downloads/shotback/cap.png",
      pageUrl: "https://example.test/page",
      generalFeedback: "",
      annotations: verbosityAnnotations,
      environment,
      diagnostics,
      image
      // verbosity omitted: "standard" is the default.
    });

    expect(prompt).toBe(
      [
        "Review this screenshot: /mnt/c/Downloads/shotback/cap.png",
        "",
        "Page URL: https://example.test/page",
        "",
        environmentBlock,
        "",
        "General feedback context: (none)",
        "",
        "Area comments:",
        "1. [box] fix padding - at (0, 0) size 10x10 px [0%, 0% of page] -> #app > section.hero > button.cta",
        "2. [arrow] point here - from (0, 0) to (5, 5) px -> #app > section.hero > button.cta in <PricingCard > Page>",
        "3. [text] Label - at (1, 2) px"
      ].join("\n")
    );
  });

  it("buildClaudeCodePrompt: detailed adds diagnostics and per-annotation context detail lines", () => {
    const prompt = buildClaudeCodePrompt({
      filePath: "/mnt/c/Downloads/shotback/cap.png",
      pageUrl: "https://example.test/page",
      generalFeedback: "",
      annotations: verbosityAnnotations,
      environment,
      diagnostics,
      image,
      verbosity: "detailed"
    });

    expect(prompt).toBe(
      [
        "Review this screenshot: /mnt/c/Downloads/shotback/cap.png",
        "",
        "Page URL: https://example.test/page",
        "",
        environmentBlock,
        "",
        diagnosticsBlock,
        "",
        "General feedback context: (none)",
        "",
        "Area comments:",
        "1. [box] fix padding - at (0, 0) size 10x10 px [0%, 0% of page] -> #app > section.hero > button.cta",
        '   text: "Buy now"',
        "   classes: [cta]",
        "   rect: 200,184 200x120",
        "2. [arrow] point here - from (0, 0) to (5, 5) px -> #app > section.hero > button.cta in <PricingCard > Page>",
        '   text: "Buy now"',
        "   classes: [cta]",
        "   rect: 200,184 200x120",
        "3. [text] Label - at (1, 2) px"
      ].join("\n")
    );
  });
});

function redaction(id = "r1", createdAt = "2026-02-21T00:00:04.000Z"): RedactAnnotation {
  return {
    id,
    tool: "redact",
    color: "#ff3333",
    createdAt,
    x: 40,
    y: 60,
    width: 120,
    height: 30
  };
}

// A redaction is a safety fact about the image, not a note: it gets one
// counted line in every prompt and never a numbered line of its own.
describe("redacted regions", () => {
  const params = {
    pageUrl: "https://example.test/page",
    generalFeedback: "",
    annotations: [box("fix padding"), redaction()],
    image
  };

  it("counts them on one line above the area comments, at every verbosity", () => {
    for (const verbosity of ["compact", "standard", "detailed"] as const) {
      const prompt = buildExternalLlmPrompt({ ...params, verbosity });
      expect(prompt).toContain("\nRedacted regions: 1\n\nArea comments:\n");
    }
  });

  it("counts them in the Claude Code prompt too", () => {
    const prompt = buildClaudeCodePrompt({ ...params, filePath: "/tmp/cap.png" });
    expect(prompt).toContain("Redacted regions: 1");
  });

  it("says nothing at all when nothing is redacted", () => {
    const prompt = buildExternalLlmPrompt({ ...params, annotations: [box("fix padding")] });
    expect(prompt).not.toContain("Redacted regions");
  });

  it("never numbers a redaction alongside the annotations", () => {
    const prompt = buildExternalLlmPrompt({
      ...params,
      annotations: [box("fix padding"), redaction(), redaction("r2")]
    });
    expect(prompt).toContain("Redacted regions: 2");
    expect(prompt).not.toContain("[redact]");
    expect(prompt.split("\n").filter((line) => /^\d+\. /.test(line))).toEqual([
      "1. [box] fix padding - at (0, 0) size 10x10 px [0%, 0% of page]"
    ]);
  });
});
