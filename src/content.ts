import type { PageDiagnostics } from "@/lib/capture";
import { cssPath, type ElementLike } from "@/lib/dom-context";
import type { ElementContext } from "@/types/annotation";

interface PageMetrics {
  fullHeight: number;
  viewportHeight: number;
  viewportWidth: number;
  devicePixelRatio: number;
  pageUrl: string;
  scrollerTop: number;
  title: string;
  colorScheme: "light" | "dark";
  scroller: "document" | "element";
}

/** Failed requests reported, and chars of each URL. */
const MAX_DIAGNOSTICS = 20;
const MAX_DIAGNOSTIC_TEXT = 200;

/**
 * A URL is page-controlled text on its way into a prompt, so it is clamped at
 * this boundary: one line, 200 chars.
 */
function diagnosticText(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_DIAGNOSTIC_TEXT);
}

/**
 * Resources the page asked for and did not get, read on demand from resource
 * timing (there is no event that reports them all). `responseStatus` is recent
 * enough to be worth feature-guarding; without it no status is knowable, so no
 * request can be called failed.
 *
 * Uncaught page errors are deliberately not collected here: Chromium reports an
 * error only to listeners in the world that threw, so a `window` listener in
 * this isolated world never sees the page's own (measured, not assumed - the
 * e2e probe in `.docs/done/2026-08-24-diagnostics/` records it). Catching them
 * needs a `world: "MAIN"` content script on every page load, which is a
 * security-posture decision, not an implementation detail.
 */
function failedRequests(): PageDiagnostics["failedRequests"] {
  const seen = new Set<string>();
  const failed: PageDiagnostics["failedRequests"] = [];

  for (const entry of performance.getEntriesByType("resource")) {
    const { responseStatus, initiatorType } = entry as PerformanceResourceTiming;
    if (typeof responseStatus !== "number" || responseStatus < 400) continue;

    const url = diagnosticText(entry.name);
    const key = `${responseStatus} ${url}`;
    if (seen.has(key)) continue;
    seen.add(key);

    failed.push({ url, status: responseStatus, initiatorType: diagnosticText(initiatorType) });
    if (failed.length >= MAX_DIAGNOSTICS) break;
  }

  return failed;
}

let originalScrollY = 0;
/** The element being scrolled for capture, or null when the document scrolls. */
let scroller: Element | null = null;

/**
 * Find what actually scrolls. Most pages scroll the document; SPA shells set
 * `html,body{overflow:hidden}` and scroll an inner element instead, which is
 * why `documentElement.scrollHeight` alone captures a single viewport there.
 * ponytail: largest element with overflow auto/scroll and at least half the
 * viewport tall - no nested-scroller support until a real page needs it.
 */
function findScroller(): Element | null {
  const root = document.scrollingElement ?? document.documentElement;
  if (root.scrollHeight > window.innerHeight + 1) return null;

  let best: Element | null = null;
  let bestArea = 0;
  for (const el of document.querySelectorAll("*")) {
    if (el.scrollHeight <= el.clientHeight + 1 || el.clientHeight < window.innerHeight / 2)
      continue;
    const overflowY = getComputedStyle(el).overflowY;
    if (overflowY !== "auto" && overflowY !== "scroll") continue;
    const area = el.clientWidth * el.clientHeight;
    if (area > bestArea) {
      best = el;
      bestArea = area;
    }
  }
  return best;
}

const SCROLLBAR_STYLE_ID = "shotback-hide-scrollbar";

/** Hide scrollbars while capturing so the track is not baked into frames. */
function hideScrollbars(): void {
  if (document.getElementById(SCROLLBAR_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SCROLLBAR_STYLE_ID;
  style.textContent =
    "html,body,[data-shotback-scroller]{scrollbar-width:none!important}" +
    "html::-webkit-scrollbar,body::-webkit-scrollbar,[data-shotback-scroller]::-webkit-scrollbar{display:none!important}";
  document.documentElement.appendChild(style);
}

function showScrollbars(): void {
  document.getElementById(SCROLLBAR_STYLE_ID)?.remove();
  document.querySelector("[data-shotback-scroller]")?.removeAttribute("data-shotback-scroller");
}

function scrollCaptureTargetTo(top: number): void {
  // "instant" overrides `scroll-behavior: smooth`, which would otherwise
  // animate past the frame capture and stitch the previous viewport again.
  (scroller ?? window).scrollTo({ top, behavior: "instant" });
}
let captureOverlay: HTMLDivElement | null = null;

/**
 * Build (once) the on-page capture notice. It is `position: fixed` so it stays
 * put while the page scrolls, has the maximum z-index, and ignores pointer
 * events. The orchestrator hides it (`display:none`) for each captureVisibleTab
 * frame so it never lands in the screenshot, and re-shows it between frames.
 */
function ensureCaptureOverlay(): HTMLDivElement {
  if (captureOverlay && document.documentElement.contains(captureOverlay)) {
    return captureOverlay;
  }

  if (!document.getElementById("shotback-overlay-style")) {
    const style = document.createElement("style");
    style.id = "shotback-overlay-style";
    style.textContent = "@keyframes shotback-spin{to{transform:rotate(360deg)}}";
    document.documentElement.appendChild(style);
  }

  const overlay = document.createElement("div");
  overlay.setAttribute("data-shotback-overlay", "");
  overlay.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483647",
    "display:none",
    "align-items:flex-start",
    "justify-content:center",
    "pointer-events:none",
    "background:rgba(15,23,42,0.25)",
    "font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif"
  ].join(";");

  const pill = document.createElement("div");
  pill.style.cssText = [
    "margin-top:24px",
    "display:flex",
    "align-items:center",
    "gap:12px",
    "padding:12px 18px",
    "border-radius:9999px",
    "background:rgba(17,24,39,0.94)",
    "color:#fff",
    "box-shadow:0 10px 30px rgba(0,0,0,0.35)",
    "font-size:14px",
    "line-height:1.25",
    "font-weight:600"
  ].join(";");

  // A person who asked for less motion still sees the ring (it communicates
  // "this is in progress" on its own), just not spinning - the notice text
  // carries the rest.
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const spinner = document.createElement("div");
  spinner.setAttribute("data-shotback-spinner", "");
  spinner.style.cssText = [
    "flex:0 0 auto",
    "width:16px",
    "height:16px",
    "border-radius:50%",
    "border:2px solid rgba(255,255,255,0.35)",
    "border-top-color:#fff",
    ...(reducedMotion ? [] : ["animation:shotback-spin 0.8s linear infinite"])
  ].join(";");

  const text = document.createElement("div");
  const heading = document.createElement("div");
  heading.setAttribute("data-shotback-heading", "");
  heading.textContent = "Capturing full page…";
  const sub = document.createElement("div");
  sub.textContent = "Please don’t switch tabs or scroll until it finishes";
  sub.style.cssText = "font-weight:400;font-size:12px;opacity:0.8;margin-top:2px";
  text.appendChild(heading);
  text.appendChild(sub);

  pill.appendChild(spinner);
  pill.appendChild(text);
  overlay.appendChild(pill);
  document.documentElement.appendChild(overlay);
  captureOverlay = overlay;
  return overlay;
}

function setCaptureOverlayDisplay(visible: boolean): void {
  if (captureOverlay) captureOverlay.style.display = visible ? "flex" : "none";
}

function removeCaptureOverlay(): void {
  captureOverlay?.remove();
  captureOverlay = null;
}

/**
 * Run after the next paint. A single rAF fires *before* the frame is painted,
 * so the overlay's display change would not yet be on screen; a second rAF
 * guarantees the change has been painted before we report back — otherwise the
 * notice can leak into the captured frame.
 */
function afterPaint(callback: () => void): void {
  window.requestAnimationFrame(() => window.requestAnimationFrame(callback));
}

/** Ancestors described in a path: `cssPath` keeps five levels, so build five. */
const MAX_ANCESTORS = 5;
const MAX_CONTEXT_CLASSES = 5;
const MAX_CONTEXT_TEXT = 80;
/** An id, class, role or testid is page-controlled text, so it is clamped. */
const MAX_CONTEXT_TOKEN = 50;

const token = (value: string): string => value.slice(0, MAX_CONTEXT_TOKEN);

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** Adapt a live element into the plain shape `src/lib/dom-context.ts` walks. */
function toElementLike(el: Element, depth = MAX_ANCESTORS): ElementLike {
  const parent = el.parentElement;
  const sameTag = parent
    ? Array.from(parent.children).filter((child) => child.tagName === el.tagName)
    : [el];
  const attributes: Record<string, string> = {};
  for (const name of ["role", "data-testid"]) {
    const value = el.getAttribute(name);
    if (value) attributes[name] = value;
  }

  return {
    tagName: el.tagName,
    id: el.id,
    classList: Array.from(el.classList),
    parent: parent && depth > 1 ? toElementLike(parent, depth - 1) : null,
    indexOfType: sameTag.indexOf(el) + 1,
    siblingsOfTypeCount: sameTag.length,
    attributes
  };
}

function visibleText(el: Element): string {
  // Slice before collapsing: a hit on <body> would otherwise build a
  // page-sized string just to throw all but 80 chars of it away.
  const raw = el instanceof HTMLElement ? el.innerText : (el.textContent ?? "");
  return raw.slice(0, 500).replace(/\s+/g, " ").trim().slice(0, MAX_CONTEXT_TEXT);
}

/**
 * Marks the element an annotation landed on, so the main-world pass in
 * `capture.ts` can read its React fiber: page expandos like `__reactFiber$...`
 * are invisible from a content script's isolated world, DOM attributes are not.
 */
const HIT_ATTRIBUTE = "data-shotback-hit";

function clearHitMarks(): void {
  for (const marked of document.querySelectorAll(`[${HIT_ATTRIBUTE}]`)) {
    marked.removeAttribute(HIT_ATTRIBUTE);
  }
}

function describeElement(el: Element, scrollTop: number): ElementContext {
  const rect = el.getBoundingClientRect();
  const role = el.getAttribute("role");
  const testId = el.getAttribute("data-testid");
  const text = visibleText(el);

  return {
    cssPath: cssPath(toElementLike(el)),
    tag: token(el.tagName.toLowerCase()),
    ...(el.id ? { id: token(el.id) } : {}),
    classes: Array.from(el.classList).slice(0, MAX_CONTEXT_CLASSES).map(token),
    ...(role ? { role: token(role) } : {}),
    ...(testId ? { testId: token(testId) } : {}),
    ...(text ? { text } : {}),
    // Page CSS px: the same space the stitched capture is measured in.
    rect: {
      x: Math.round(rect.left),
      y: Math.round(rect.top + scrollTop),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    }
  };
}

/** The topmost real element at a viewport point, ignoring shotback's own DOM. */
function describeAt(x: number, y: number, scrollTop: number, index: number): ElementContext | null {
  const el = document
    .elementsFromPoint(x, y)
    .find(
      (candidate) => candidate.tagName !== "STYLE" && !candidate.closest("[data-shotback-overlay]")
    );
  if (!el) return null;

  // The main-world pass reads the fiber off this element; see capture.ts.
  el.setAttribute(HIT_ATTRIBUTE, String(index));
  return describeElement(el, scrollTop);
}

/**
 * Describe the element under each stitched-page point. Points come in page CSS
 * px, so the capture scroller is moved to bring each one into view - quietly:
 * no notice, no scrollbar hiding, and the original scroll position restored in
 * a `finally`. The point is centred in the viewport rather than parked at its
 * top edge, so a sticky header cannot answer for the element underneath it.
 */
function inspectPoints(points: Array<{ x: number; y: number }>): Array<ElementContext | null> {
  // A capture owns the scroll position while it runs; never fight it.
  if (captureOverlay) return points.map(() => null);

  // `scroller` is cleared when a capture finishes (and by re-injection), so
  // resolve it again here rather than assuming the capture just ran.
  const target = scroller ?? findScroller();
  const scrollTopOf = (): number => (target ? target.scrollTop : window.scrollY);
  const scrollerTop = target ? Math.max(0, Math.round(target.getBoundingClientRect().top)) : 0;
  const viewportHeight = target ? target.clientHeight : window.innerHeight;
  const maxScroll = target
    ? target.scrollHeight - target.clientHeight
    : Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0) -
      window.innerHeight;
  const originalTop = scrollTopOf();
  clearHitMarks();

  try {
    return points.map((point, index) => {
      const wanted = clamp(point.y - scrollerTop - viewportHeight / 2, 0, maxScroll);
      (target ?? window).scrollTo({ top: wanted, behavior: "instant" });
      const scrollTop = scrollTopOf();
      return describeAt(point.x, point.y - scrollTop, scrollTop, index);
    });
  } finally {
    (target ?? window).scrollTo({ top: originalTop, behavior: "instant" });
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SB_CAPTURE_BEGIN") {
    const overlay = ensureCaptureOverlay();
    // An optional heading is what makes the delayed mode's countdown work:
    // the orchestrator owns the timing and re-sends this once a second, so the
    // content script holds no timer and the text simply changes - no
    // animation, so a reduced-motion preference is unaffected.
    if (typeof message.heading === "string") {
      const heading = overlay.querySelector("[data-shotback-heading]");
      if (heading) heading.textContent = message.heading;
    }
    overlay.style.display = "flex";
    window.requestAnimationFrame(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === "SB_SET_OVERLAY") {
    setCaptureOverlayDisplay(Boolean(message.visible));
    // Wait for the hide/show to actually paint before the orchestrator captures.
    afterPaint(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === "SB_CAPTURE_END") {
    showScrollbars();
    removeCaptureOverlay();
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "SB_INSPECT_POINTS") {
    const points = Array.isArray(message.points) ? message.points : [];
    // The URL is read here, after the hit test, so the editor can tell that the
    // contexts describe the page it captured and not one navigated to since.
    sendResponse({ contexts: inspectPoints(points), pageUrl: window.location.href });
    return true;
  }

  if (message?.type === "SB_GET_DIAGNOSTICS") {
    const diagnostics: PageDiagnostics = { failedRequests: failedRequests() };
    sendResponse(diagnostics);
    return true;
  }

  if (message?.type === "SB_GET_PAGE_METRICS") {
    scroller = findScroller();
    scroller?.setAttribute("data-shotback-scroller", "");
    hideScrollbars();
    originalScrollY = scroller ? scroller.scrollTop : window.scrollY;

    // Page context the editor turns into the prompt's Environment block. It
    // has to be read here: the editor tab has its own title, size and scheme.
    const shared = {
      viewportWidth: window.innerWidth,
      devicePixelRatio: window.devicePixelRatio,
      pageUrl: window.location.href,
      title: document.title,
      colorScheme: window.matchMedia("(prefers-color-scheme: dark)").matches
        ? ("dark" as const)
        : ("light" as const)
    };

    const metrics: PageMetrics = scroller
      ? {
          ...shared,
          fullHeight: scroller.scrollHeight,
          viewportHeight: scroller.clientHeight,
          scrollerTop: Math.max(0, Math.round(scroller.getBoundingClientRect().top)),
          scroller: "element"
        }
      : {
          ...shared,
          fullHeight: Math.max(
            document.documentElement.scrollHeight,
            document.body?.scrollHeight ?? 0
          ),
          viewportHeight: window.innerHeight,
          scrollerTop: 0,
          scroller: "document"
        };

    sendResponse(metrics);
    return true;
  }

  if (message?.type === "SB_SCROLL_TO") {
    const y = Number(message.y ?? 0);
    scrollCaptureTargetTo(y);
    // Re-show the notice between capture frames (it was hidden for the shot).
    setCaptureOverlayDisplay(true);

    window.requestAnimationFrame(() => {
      sendResponse({ ok: true, y: scroller ? scroller.scrollTop : window.scrollY });
    });
    return true;
  }

  if (message?.type === "SB_RESTORE_SCROLL") {
    scrollCaptureTargetTo(originalScrollY);
    scroller = null;
    showScrollbars();
    removeCaptureOverlay();
    sendResponse({ ok: true });
    return true;
  }

  return false;
});
