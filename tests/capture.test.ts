import { describe, expect, it, vi } from "vitest";
import {
  activateTab,
  inspectPoints,
  readFiberComponents,
  buildEnvironment,
  buildScrollSteps,
  CAPTURE_DELAY_SECONDS,
  CAPTURE_MODES,
  captureNoticeHeading,
  captureOptions,
  toPageCoords,
  isNoReceiverError,
  isTabsBusyError,
  segmentPlacement,
  sendToContentScript
} from "../src/lib/capture";
import type { PageMetrics } from "../src/lib/capture";

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

describe("captureOptions", () => {
  it("maps the three offered modes onto what the orchestrator takes", () => {
    expect(captureOptions("full")).toEqual({ mode: "full", delaySeconds: 0 });
    expect(captureOptions("visible")).toEqual({ mode: "visible", delaySeconds: 0 });
    expect(captureOptions("delayed")).toEqual({
      mode: "full",
      delaySeconds: CAPTURE_DELAY_SECONDS
    });
  });

  it("offers exactly the three modes the chooser renders, full first", () => {
    expect(CAPTURE_MODES.map((mode) => mode.value)).toEqual(["full", "visible", "delayed"]);
    // The primary button captures the full page; the chooser only changes that.
    expect(CAPTURE_MODES[0].label).toBe("Full page");
  });

  it("counts the delay down in whole seconds", () => {
    expect(CAPTURE_DELAY_SECONDS).toBe(3);
  });
});

describe("captureNoticeHeading", () => {
  it("counts down while a delay runs", () => {
    expect(captureNoticeHeading(3)).toBe("Capturing in 3...");
    expect(captureNoticeHeading(1)).toBe("Capturing in 1...");
  });

  it("names the capture itself once the countdown is done", () => {
    expect(captureNoticeHeading(0)).toBe("Capturing full page…");
  });
});

describe("toPageCoords", () => {
  // A full-page capture starts by scrolling to the top, so image space and
  // page space share an origin.
  const full = { scale: 2, scrollerTop: 0, scrollOffset: 0 };

  it("is a plain unscale for a full-page capture", () => {
    expect(toPageCoords({ x: 200, y: 400 }, full)).toEqual({ x: 100, y: 200 });
  });

  it("adds the scroll the capture started from, for a visible-area one", () => {
    // The page was 1200 CSS px down when the one frame was taken, so the top
    // of the image is page y 1200 - not page y 0.
    expect(
      toPageCoords({ x: 200, y: 400 }, { scale: 2, scrollerTop: 0, scrollOffset: 1200 })
    ).toEqual({ x: 100, y: 1400 });
  });

  it("leaves a band above the scroller alone: it never scrolled", () => {
    // Inner-scroller page: the 64px header is kept whole in the first frame
    // and does not move with the scroller, so the offset must not apply to it.
    const inner = { scale: 1, scrollerTop: 64, scrollOffset: 900 };
    expect(toPageCoords({ x: 10, y: 20 }, inner)).toEqual({ x: 10, y: 20 });
    expect(toPageCoords({ x: 10, y: 100 }, inner)).toEqual({ x: 10, y: 1000 });
  });
});

describe("buildEnvironment", () => {
  const metrics = {
    fullHeight: 2400,
    viewportHeight: 800,
    viewportWidth: 1280,
    devicePixelRatio: 2,
    pageUrl: "https://example.test/page",
    scrollerTop: 0,
    scrollTop: 0,
    title: "Acme Dashboard",
    colorScheme: "dark" as const,
    scroller: "document" as const
  };

  it("maps page metrics onto the capture environment", () => {
    expect(buildEnvironment(metrics, "UA/1.0", new Date("2026-08-24T10:11:12.000Z"))).toEqual({
      pageTitle: "Acme Dashboard",
      pageUrl: "https://example.test/page",
      capturedAt: "2026-08-24T10:11:12.000Z",
      viewport: { width: 1280, height: 800 },
      devicePixelRatio: 2,
      userAgent: "UA/1.0",
      colorScheme: "dark",
      scroller: "document"
    });
  });

  it("carries an inner scroller and a light scheme through unchanged", () => {
    const env = buildEnvironment(
      { ...metrics, scroller: "element", colorScheme: "light", scrollerTop: 64 },
      "UA/2.0",
      new Date("2026-01-02T03:04:05.678Z")
    );

    expect(env.scroller).toBe("element");
    expect(env.colorScheme).toBe("light");
    expect(env.capturedAt).toBe("2026-01-02T03:04:05.678Z");
  });

  it("collapses a hostile page title to one line of 200 chars", () => {
    const title = `${"a".repeat(5000)}\n\n${"b".repeat(5000)}`;
    const env = buildEnvironment({ ...metrics, title }, "UA/1.0", new Date());

    expect(env.pageTitle).toHaveLength(200);
    expect(env.pageTitle).not.toContain("\n");
  });

  it("clamps a very long page URL", () => {
    const pageUrl = `https://example.test/${"q".repeat(1000)}`;
    const env = buildEnvironment({ ...metrics, pageUrl }, "UA/1.0", new Date());

    expect(env.pageUrl).toHaveLength(500);
  });

  it("yields an empty title when the page reported none", () => {
    // The title comes off a page-controlled message, so `undefined` is a real
    // shape at runtime even though the type says otherwise.
    const env = buildEnvironment(
      { ...metrics, title: undefined } as unknown as PageMetrics,
      "UA/1.0",
      new Date()
    );

    expect(env.pageTitle).toBe("");
  });
});

describe("segmentPlacement", () => {
  it("draws whole frames at their scroll offset when the document scrolls", () => {
    const metrics = { viewportHeight: 700, scrollerTop: 0 };
    expect(segmentPlacement(0, 0, metrics)).toEqual({ sy: 0, sh: 700, dy: 0 });
    expect(segmentPlacement(2, 1400, metrics)).toEqual({ sy: 0, sh: 700, dy: 1400 });
  });

  it("keeps the first frame whole and crops later frames to the scroller rows", () => {
    const metrics = { viewportHeight: 436, scrollerTop: 64 };
    expect(segmentPlacement(0, 0, metrics)).toEqual({ sy: 0, sh: 500, dy: 0 });
    expect(segmentPlacement(1, 436, metrics)).toEqual({ sy: 64, sh: 436, dy: 500 });
  });
});

describe("isNoReceiverError", () => {
  it("matches the content-script-not-ready errors", () => {
    expect(
      isNoReceiverError(new Error("Could not establish connection. Receiving end does not exist."))
    ).toBe(true);
    expect(isNoReceiverError(new Error("Receiving end does not exist"))).toBe(true);
  });

  it("does not match unrelated errors", () => {
    expect(isNoReceiverError(new Error("Cannot access a chrome:// URL"))).toBe(false);
  });
});

describe("sendToContentScript", () => {
  function stubChrome(sendMessage: ReturnType<typeof vi.fn>) {
    const executeScript = vi.fn().mockResolvedValue(undefined);
    (globalThis as unknown as { chrome: unknown }).chrome = {
      tabs: { sendMessage },
      scripting: { executeScript }
    };
    return { executeScript };
  }

  it("returns the response on the first try", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true });
    stubChrome(sendMessage);
    await expect(sendToContentScript(1, { type: "X" }, { delayMs: 0 })).resolves.toEqual({
      ok: true
    });
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("re-injects and retries when the receiver is not ready, then succeeds", async () => {
    const sendMessage = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("Could not establish connection. Receiving end does not exist.")
      )
      .mockRejectedValueOnce(new Error("Receiving end does not exist"))
      .mockResolvedValue({ ok: true });
    const { executeScript } = stubChrome(sendMessage);

    await expect(sendToContentScript(1, { type: "X" }, { delayMs: 0 })).resolves.toEqual({
      ok: true
    });
    expect(sendMessage).toHaveBeenCalledTimes(3);
    expect(executeScript).toHaveBeenCalledTimes(2);
  });

  it("rethrows non-receiver errors immediately without retrying", async () => {
    const sendMessage = vi.fn().mockRejectedValue(new Error("Cannot access a chrome:// URL"));
    stubChrome(sendMessage);
    await expect(sendToContentScript(1, { type: "X" }, { delayMs: 0 })).rejects.toThrow(
      "chrome://"
    );
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("gives up after exhausting retries", async () => {
    const sendMessage = vi.fn().mockRejectedValue(new Error("Receiving end does not exist"));
    stubChrome(sendMessage);
    await expect(sendToContentScript(1, { type: "X" }, { retries: 2, delayMs: 0 })).rejects.toThrow(
      "Receiving end does not exist"
    );
    expect(sendMessage).toHaveBeenCalledTimes(3);
  });
});

describe("readFiberComponents", () => {
  // The real thing runs in the page's world against React's own expando; here
  // the DOM it walks is stubbed, exactly the shape Chrome hands it.
  function fakeElement(mark: string, fiber: unknown): unknown {
    const attributes: Record<string, string> = { "data-shotback-hit": mark };
    return {
      __reactFiber$abc: fiber,
      getAttribute: (name: string) => attributes[name] ?? null,
      removeAttribute: (name: string) => {
        delete attributes[name];
      }
    };
  }

  function stubDocument(elements: unknown[]): void {
    (globalThis as unknown as { document: unknown }).document = {
      querySelectorAll: () => elements
    };
  }

  const fiber = (type: unknown, parent: unknown = null): unknown => ({ type, return: parent });

  it("collects named components nearest first, skipping host and anonymous types", () => {
    function PricingCard(): null {
      return null;
    }
    const Page = class Page {};
    const element = fakeElement("0", fiber("button", fiber(PricingCard, fiber({}, fiber(Page)))));
    stubDocument([element]);

    expect(readFiberComponents()).toEqual({ "0": ["PricingCard", "Page"] });
  });

  it("prefers displayName, caps the chain at three and clears the mark", () => {
    const named = (displayName: string) => ({ displayName });
    const element = fakeElement(
      "2",
      fiber(named("A"), fiber(named("B"), fiber(named("C"), fiber(named("D")))))
    );
    stubDocument([element]);

    expect(readFiberComponents()).toEqual({ "2": ["A", "B", "C"] });
    expect(
      (element as { getAttribute: (n: string) => string | null }).getAttribute("data-shotback-hit")
    ).toBeNull();
  });

  it("reports nothing for an element with no fiber", () => {
    stubDocument([{ getAttribute: () => "0", removeAttribute: () => undefined }]);

    expect(readFiberComponents()).toEqual({});
  });
});

describe("inspectPoints", () => {
  const pageUrl = "https://example.test/page";
  let executeScript: ReturnType<typeof vi.fn>;

  function stubChrome(sendMessage: ReturnType<typeof vi.fn>, chains: unknown = {}): void {
    executeScript = vi.fn().mockResolvedValue([{ result: chains }]);
    (globalThis as unknown as { chrome: unknown }).chrome = {
      tabs: { sendMessage },
      scripting: { executeScript }
    };
  }

  it("sends nothing when there is nothing to inspect", async () => {
    const sendMessage = vi.fn();
    stubChrome(sendMessage);
    await expect(inspectPoints(1, [], pageUrl)).resolves.toEqual([]);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("returns the contexts the page reported", async () => {
    const contexts = [
      {
        cssPath: "button.cta",
        tag: "button",
        classes: ["cta"],
        rect: { x: 10, y: 20, width: 30, height: 40 }
      }
    ];
    const sendMessage = vi.fn().mockResolvedValue({ contexts, pageUrl });
    stubChrome(sendMessage);
    await expect(inspectPoints(7, [{ x: 1, y: 2 }], pageUrl)).resolves.toEqual(contexts);
    expect(sendMessage).toHaveBeenCalledWith(7, {
      type: "SB_INSPECT_POINTS",
      points: [{ x: 1, y: 2 }]
    });
  });

  it("merges the component chain the main-world pass found", async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      pageUrl,
      contexts: [
        {
          cssPath: "button.cta",
          tag: "button",
          classes: [],
          rect: { x: 0, y: 0, width: 1, height: 1 }
        },
        null
      ]
    });
    stubChrome(sendMessage, { "0": ["PricingCard"] });

    const [first, second] = await inspectPoints(
      1,
      [
        { x: 1, y: 2 },
        { x: 3, y: 4 }
      ],
      pageUrl
    );
    expect(first?.component).toEqual(["PricingCard"]);
    expect(second).toBeNull();
  });

  it("clamps a page-controlled component name to one line of 50 chars", async () => {
    const hostile = "Evil\n".repeat(2000) + "Component";
    const sendMessage = vi.fn().mockResolvedValue({
      pageUrl,
      contexts: [
        { cssPath: "div", tag: "div", classes: [], rect: { x: 0, y: 0, width: 1, height: 1 } }
      ]
    });
    stubChrome(sendMessage, { "0": [hostile] });

    const [context] = await inspectPoints(1, [{ x: 1, y: 2 }], pageUrl);
    const [name] = context?.component ?? [];
    expect(name).toHaveLength(50);
    expect(name).not.toContain("\n");
    expect(name?.startsWith("Evil Evil ")).toBe(true);
  });

  it("answers every point with null when the tab has navigated away", async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      pageUrl: "https://example.test/somewhere-else",
      contexts: [
        { cssPath: "div", tag: "div", classes: [], rect: { x: 0, y: 0, width: 1, height: 1 } }
      ]
    });
    stubChrome(sendMessage);

    await expect(
      inspectPoints(
        1,
        [
          { x: 1, y: 2 },
          { x: 3, y: 4 }
        ],
        pageUrl
      )
    ).resolves.toEqual([null, null]);
    // ...and the hit marks it left on that other page are taken back off.
    expect(executeScript).toHaveBeenCalledTimes(1);
  });

  it("never throws: a failed inspection is simply no context", async () => {
    stubChrome(vi.fn().mockRejectedValue(new Error("Cannot access a chrome:// URL")));
    await expect(inspectPoints(1, [{ x: 1, y: 2 }], pageUrl)).resolves.toEqual([]);
  });
});

describe("isTabsBusyError", () => {
  it("matches the transient tab-strip-locked errors", () => {
    expect(
      isTabsBusyError(new Error("Tabs cannot be edited right now (user may be dragging a tab)."))
    ).toBe(true);
    expect(isTabsBusyError(new Error("User may be dragging a tab"))).toBe(true);
  });

  it("does not match unrelated errors", () => {
    expect(isTabsBusyError(new Error("No tab with id: 7"))).toBe(false);
  });
});

describe("activateTab", () => {
  function stubTabsUpdate(update: ReturnType<typeof vi.fn>) {
    (globalThis as unknown as { chrome: unknown }).chrome = { tabs: { update } };
  }

  it("activates on the first try", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    stubTabsUpdate(update);
    await expect(activateTab(5, { delayMs: 0 })).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledWith(5, { active: true });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("retries while the tab strip is busy, then succeeds", async () => {
    const update = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("Tabs cannot be edited right now (user may be dragging a tab).")
      )
      .mockRejectedValueOnce(new Error("Tabs cannot be edited right now"))
      .mockResolvedValue(undefined);
    stubTabsUpdate(update);
    await expect(activateTab(5, { delayMs: 0 })).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledTimes(3);
  });

  it("rethrows unrelated errors immediately", async () => {
    const update = vi.fn().mockRejectedValue(new Error("No tab with id: 5"));
    stubTabsUpdate(update);
    await expect(activateTab(5, { delayMs: 0 })).rejects.toThrow("No tab with id");
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("gives up after exhausting retries", async () => {
    const update = vi.fn().mockRejectedValue(new Error("Tabs cannot be edited right now"));
    stubTabsUpdate(update);
    await expect(activateTab(5, { retries: 2, delayMs: 0 })).rejects.toThrow(
      "Tabs cannot be edited right now"
    );
    expect(update).toHaveBeenCalledTimes(3);
  });
});
