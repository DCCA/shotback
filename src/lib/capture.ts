export interface PageMetrics {
  fullHeight: number;
  viewportHeight: number;
  viewportWidth: number;
  devicePixelRatio: number;
  pageUrl: string;
}

export interface CaptureResult {
  dataUrl: string;
  pageUrl: string;
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
        await notify(tabId, { type: "SB_SET_OVERLAY", visible: false });
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
    canvas.height = Math.round(metrics.fullHeight * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to create drawing context");

    for (let i = 0; i < segments.length; i += 1) {
      const segment = segments[i];
      const image = images[i];
      ctx.drawImage(image, 0, Math.round(segment.y * scale));
    }

    return {
      dataUrl: canvas.toDataURL("image/png"),
      pageUrl: metrics.pageUrl
    };
  } finally {
    if (previousActiveTabId && previousActiveTabId !== tabId) {
      // Best-effort: a failed restore must not mask the capture result.
      await activateTab(previousActiveTabId).catch(() => undefined);
    }
  }
}
