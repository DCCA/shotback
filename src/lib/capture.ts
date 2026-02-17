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

export async function captureFullPage(
  tabId: number,
  windowId: number,
  onProgress?: (index: number, total: number) => void
): Promise<CaptureResult> {
  const [activeTab] = await chrome.tabs.query({ active: true, windowId });
  const previousActiveTabId = activeTab?.id;

  await chrome.tabs.update(tabId, { active: true });
  await wait(150);

  try {
    await ensureInjectable(tabId);

    const metrics = await sendMessage<PageMetrics>(tabId, { type: "SB_GET_PAGE_METRICS" });
    const steps = buildScrollSteps(metrics.fullHeight, metrics.viewportHeight);

    const segments: Array<{ y: number; dataUrl: string }> = [];
    try {
      for (let i = 0; i < steps.length; i += 1) {
        const y = steps[i];
        await sendMessage(tabId, { type: "SB_SCROLL_TO", y });
        await wait(120);
        const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
        segments.push({ y, dataUrl });
        onProgress?.(i + 1, steps.length);
      }
    } finally {
      await sendMessage(tabId, { type: "SB_RESTORE_SCROLL" }).catch(() => undefined);
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
      await chrome.tabs.update(previousActiveTabId, { active: true });
    }
  }
}
