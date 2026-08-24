import type { ElementContext } from "@/types/annotation";

/**
 * Geometry of whatever actually scrolls: the document, or - for SPA shells
 * with `html,body{overflow:hidden}` - the largest scrollable element.
 * `fullHeight`/`viewportHeight` are that scroller's scrollHeight/clientHeight;
 * `scrollerTop` is where it starts in the viewport (0 for the document).
 */
export interface PageMetrics {
  fullHeight: number;
  viewportHeight: number;
  viewportWidth: number;
  devicePixelRatio: number;
  pageUrl: string;
  scrollerTop: number;
  title: string;
  colorScheme: "light" | "dark";
  /** What the content script scrolled: the document, or an inner element. */
  scroller: "document" | "element";
}

/**
 * The captured tab's context, attached to the prompts and to saved shares so an
 * agent never has to ask "which page, how wide, light or dark?". Everything but
 * `userAgent`/`capturedAt` describes the target tab, not the editor page.
 */
export interface CaptureEnvironment {
  pageTitle: string;
  pageUrl: string;
  /** ISO 8601. */
  capturedAt: string;
  /** CSS px of the captured tab. */
  viewport: { width: number; height: number };
  devicePixelRatio: number;
  userAgent: string;
  colorScheme: "light" | "dark";
  scroller: "document" | "element";
}

export interface CaptureResult {
  dataUrl: string;
  pageUrl: string;
  environment: CaptureEnvironment;
  /** Stitched image px per page CSS px, so image coords can be mapped back. */
  scale: number;
  /** Page CSS px above the scroller on the stitched image (0 for the document). */
  scrollerTop: number;
}

/** Pure; `now` is injected so the mapping stays testable. */
export function buildEnvironment(
  metrics: PageMetrics,
  userAgent: string,
  now: Date
): CaptureEnvironment {
  return {
    pageTitle: metrics.title,
    pageUrl: metrics.pageUrl,
    capturedAt: now.toISOString(),
    viewport: { width: metrics.viewportWidth, height: metrics.viewportHeight },
    devicePixelRatio: metrics.devicePixelRatio,
    userAgent,
    colorScheme: metrics.colorScheme,
    scroller: metrics.scroller
  };
}

export function buildScrollSteps(fullHeight: number, viewportHeight: number): number[] {
  if (fullHeight <= viewportHeight) return [0];

  const steps: number[] = [];
  let y = 0;
  while (y < fullHeight - viewportHeight) {
    steps.push(y);
    y += viewportHeight;
  }
  steps.push(fullHeight - viewportHeight);

  return Array.from(new Set(steps));
}

/**
 * Where frame `index` (captured at scroll offset `y`) lands on the stitched
 * canvas, in CSS px. The first frame is drawn whole so any chrome above an
 * inner scroller (a header) is kept once; later frames are cropped to the
 * scroller's rows. With `scrollerTop: 0` every frame is drawn whole at `y`.
 */
export function segmentPlacement(
  index: number,
  y: number,
  metrics: Pick<PageMetrics, "viewportHeight" | "scrollerTop">
): { sy: number; sh: number; dy: number } {
  const { viewportHeight, scrollerTop } = metrics;
  if (index === 0) return { sy: 0, sh: scrollerTop + viewportHeight, dy: 0 };
  return { sy: scrollerTop, sh: viewportHeight, dy: scrollerTop + y };
}

async function sendMessage<T>(tabId: number, message: unknown): Promise<T> {
  return chrome.tabs.sendMessage(tabId, message) as Promise<T>;
}

/** Send a best-effort, cosmetic message (the capture notice). Never throws. */
async function notify(tabId: number, message: unknown): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // The on-page notice is purely cosmetic; ignore if the receiver is absent.
  }
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load captured image"));
    img.src = dataUrl;
  });
}

async function ensureInjectable(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
  } catch {
    // Content script is already present on normal pages; ignore duplicate injection failures.
  }
}

/**
 * True for the transient error Chrome throws when a message is sent to a tab
 * whose content script has not registered its listener yet.
 */
export function isNoReceiverError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /receiving end does not exist|could not establish connection/i.test(message);
}

/**
 * True for the transient error Chrome throws from tab edits while the tab strip
 * is mid-operation (a real drag, or — for one-click capture — the strip still
 * settling right after the editor tab was created).
 */
export function isTabsBusyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /tabs cannot be edited right now|user may be dragging a tab/i.test(message);
}

/**
 * Activate a tab, retrying while the tab strip is transiently locked. Without
 * this, one-click auto-capture fails with "Tabs cannot be edited right now"
 * because it runs while the just-opened editor tab is still being inserted.
 */
export async function activateTab(
  tabId: number,
  options: { retries?: number; delayMs?: number } = {}
): Promise<void> {
  const retries = options.retries ?? 8;
  const delayMs = options.delayMs ?? 150;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await chrome.tabs.update(tabId, { active: true });
      return;
    } catch (error) {
      lastError = error;
      if (!isTabsBusyError(error)) throw error;
      await wait(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Could not activate tab");
}

/**
 * Send a message to a tab's content script, re-injecting it and retrying while
 * the receiving end is not ready. This is the difference between manual capture
 * (the user clicks seconds later, script is ready) and one-click auto-capture
 * (fires immediately on editor load, before the listener has registered).
 */
export async function sendToContentScript<T>(
  tabId: number,
  message: unknown,
  options: { retries?: number; delayMs?: number } = {}
): Promise<T> {
  const retries = options.retries ?? 6;
  const delayMs = options.delayMs ?? 150;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return (await chrome.tabs.sendMessage(tabId, message)) as T;
    } catch (error) {
      lastError = error;
      if (!isNoReceiverError(error)) throw error;
      await ensureInjectable(tabId);
      await wait(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Content script did not respond");
}

/**
 * Collect the React component chain around every element the content script
 * marked with `data-shotback-hit`, keyed by that mark (the point's index).
 *
 * This runs **in the page's own JavaScript world** (`world: "MAIN"`): React
 * hangs its fiber off the DOM node as an expando, and a content script's
 * isolated world cannot see page expandos at all (`Object.keys(element)` comes
 * back empty there, verified against real Chromium). Chrome serializes this
 * function's source to inject it, so it must reference nothing outside itself -
 * no imports, no module constants. It also clears the marks it consumes.
 */
export function readFiberComponents(): Record<string, string[]> {
  const chains: Record<string, string[]> = {};

  for (const element of document.querySelectorAll("[data-shotback-hit]")) {
    const mark = element.getAttribute("data-shotback-hit");
    element.removeAttribute("data-shotback-hit");
    if (mark === null) continue;

    const key = Object.keys(element).find((name) => name.startsWith("__reactFiber$"));
    let node = key ? (element as unknown as Record<string, unknown>)[key] : null;

    // Nearest first, three components deep; the step cap keeps a cyclic
    // `return` chain from hanging the page.
    const names: string[] = [];
    for (let step = 0; node && step < 60 && names.length < 3; step += 1) {
      const fiber = node as { type?: unknown; return?: unknown };
      const type = fiber.type;
      if (type && typeof type !== "string") {
        const named = type as { displayName?: unknown; name?: unknown };
        const name = typeof named.displayName === "string" ? named.displayName : named.name;
        if (typeof name === "string" && name) names.push(name);
      }
      node = (fiber.return ?? null) as Record<string, unknown> | null;
    }

    if (names.length > 0) chains[mark] = names;
  }

  return chains;
}

/** Drop the hit marks if the main-world pass never got to consume them. */
async function clearHitMarks(tabId: number): Promise<void> {
  await chrome.scripting
    .executeScript({
      target: { tabId },
      func: () => {
        for (const element of document.querySelectorAll("[data-shotback-hit]")) {
          element.removeAttribute("data-shotback-hit");
        }
      }
    })
    .catch(() => undefined);
}

/**
 * A component name is page-controlled text, so it is clamped on this side of
 * the boundary: one line, 50 chars. A hostile page cannot get an unbounded
 * string into a prompt by naming a component after it.
 */
function sanitizeComponentName(name: unknown): string {
  return String(name).replace(/\s+/g, " ").trim().slice(0, 50);
}

async function readComponentChains(tabId: number): Promise<Record<string, string[]>> {
  try {
    const [injected] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: readFiberComponents
    });
    const chains = (injected?.result as Record<string, string[]> | undefined) ?? {};
    return Object.fromEntries(
      Object.entries(chains).map(([mark, names]) => [
        mark,
        names.map(sanitizeComponentName).filter(Boolean)
      ])
    );
  } catch {
    // Non-React pages, restricted pages, a closed tab: no component chain.
    await clearHitMarks(tabId);
    return {};
  }
}

/**
 * Ask the captured tab to describe the element under each point (page CSS px).
 * Best effort by design: it runs after every annotation commit, so a closed
 * tab or a missing content script must return "no context" (an empty array,
 * which leaves the stored contexts alone) and never surface an error or block
 * the edit.
 *
 * `pageUrl` is the page the capture came from. If the tab has navigated since,
 * every point is answered with `null` rather than kept: the stored contexts
 * describe a page that is gone, and a stale selector is worse than none.
 */
export async function inspectPoints(
  tabId: number,
  points: Array<{ x: number; y: number }>,
  pageUrl: string
): Promise<Array<ElementContext | null>> {
  if (points.length === 0) return [];

  try {
    const response = await sendToContentScript<{
      contexts?: Array<ElementContext | null>;
      pageUrl?: string;
    }>(tabId, { type: "SB_INSPECT_POINTS", points });
    if (response?.pageUrl !== pageUrl) {
      // The marks landed on the page that is there now; take them back off.
      await clearHitMarks(tabId);
      return points.map(() => null);
    }

    const contexts = response?.contexts ?? [];
    if (contexts.length === 0) return contexts;

    const chains = await readComponentChains(tabId);
    return contexts.map((context, index) => {
      const component = chains[String(index)];
      return context && component ? { ...context, component } : context;
    });
  } catch {
    return [];
  }
}

export async function captureFullPage(
  tabId: number,
  windowId: number,
  onProgress?: (index: number, total: number) => void
): Promise<CaptureResult> {
  const [activeTab] = await chrome.tabs.query({ active: true, windowId });
  const previousActiveTabId = activeTab?.id;

  await activateTab(tabId);
  await wait(150);

  try {
    await ensureInjectable(tabId);

    // The first message races content-script startup on one-click auto-capture,
    // so retry it (re-injecting) until the listener is ready.
    const metrics = await sendToContentScript<PageMetrics>(tabId, { type: "SB_GET_PAGE_METRICS" });
    const steps = buildScrollSteps(metrics.fullHeight, metrics.viewportHeight);

    // Show an on-page notice (the user is looking at this tab, not the editor)
    // and give them a moment to read it. Overlay messages are cosmetic, so a
    // failure must never abort the capture.
    await notify(tabId, { type: "SB_CAPTURE_BEGIN" });
    await wait(450);

    const segments: Array<{ y: number; dataUrl: string }> = [];
    try {
      for (let i = 0; i < steps.length; i += 1) {
        const y = steps[i];
        await sendMessage(tabId, { type: "SB_SCROLL_TO", y });
        await wait(120);
        // Hide the notice so it is not baked into this frame, then capture.
        // notify resolves only after the hide has painted (double-rAF in the
        // content script); a short extra settle covers compositor lag.
        await notify(tabId, { type: "SB_SET_OVERLAY", visible: false });
        await wait(60);
        const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
        segments.push({ y, dataUrl });
        onProgress?.(i + 1, steps.length);
      }
    } finally {
      await sendMessage(tabId, { type: "SB_RESTORE_SCROLL" }).catch(() => undefined);
      await notify(tabId, { type: "SB_CAPTURE_END" });
    }

    const images = await Promise.all(segments.map((segment) => loadImage(segment.dataUrl)));
    const first = images[0];
    const scale = first.width / metrics.viewportWidth;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(metrics.viewportWidth * scale);
    canvas.height = Math.round((metrics.scrollerTop + metrics.fullHeight) * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to create drawing context");

    for (let i = 0; i < segments.length; i += 1) {
      const image = images[i];
      const { sy, sh, dy } = segmentPlacement(i, segments[i].y, metrics);
      const sourceY = Math.round(sy * scale);
      const height = Math.min(Math.round(sh * scale), image.height - sourceY);
      ctx.drawImage(
        image,
        0,
        sourceY,
        image.width,
        height,
        0,
        Math.round(dy * scale),
        image.width,
        height
      );
    }

    return {
      dataUrl: canvas.toDataURL("image/png"),
      pageUrl: metrics.pageUrl,
      environment: buildEnvironment(metrics, navigator.userAgent, new Date()),
      scale,
      scrollerTop: metrics.scrollerTop
    };
  } finally {
    if (previousActiveTabId && previousActiveTabId !== tabId) {
      // Best-effort: a failed restore must not mask the capture result.
      await activateTab(previousActiveTabId).catch(() => undefined);
    }
  }
}
