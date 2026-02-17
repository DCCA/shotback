interface PageMetrics {
  fullHeight: number;
  viewportHeight: number;
  viewportWidth: number;
  devicePixelRatio: number;
  pageUrl: string;
}

let originalScrollY = 0;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SB_GET_PAGE_METRICS") {
    originalScrollY = window.scrollY;

    const metrics: PageMetrics = {
      fullHeight: Math.max(
        document.documentElement.scrollHeight,
        document.body?.scrollHeight ?? 0
      ),
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      devicePixelRatio: window.devicePixelRatio,
      pageUrl: window.location.href
    };

    sendResponse(metrics);
    return true;
  }

  if (message?.type === "SB_SCROLL_TO") {
    const y = Number(message.y ?? 0);
    window.scrollTo(0, y);

    window.requestAnimationFrame(() => {
      sendResponse({ ok: true, y: window.scrollY });
    });
    return true;
  }

  if (message?.type === "SB_RESTORE_SCROLL") {
    window.scrollTo(0, originalScrollY);
    sendResponse({ ok: true });
    return true;
  }

  return false;
});
