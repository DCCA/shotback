interface PageMetrics {
  fullHeight: number;
  viewportHeight: number;
  viewportWidth: number;
  devicePixelRatio: number;
  pageUrl: string;
}

let originalScrollY = 0;
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

  const spinner = document.createElement("div");
  spinner.style.cssText = [
    "flex:0 0 auto",
    "width:16px",
    "height:16px",
    "border-radius:50%",
    "border:2px solid rgba(255,255,255,0.35)",
    "border-top-color:#fff",
    "animation:shotback-spin 0.8s linear infinite"
  ].join(";");

  const text = document.createElement("div");
  const heading = document.createElement("div");
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SB_CAPTURE_BEGIN") {
    ensureCaptureOverlay().style.display = "flex";
    window.requestAnimationFrame(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === "SB_SET_OVERLAY") {
    setCaptureOverlayDisplay(Boolean(message.visible));
    window.requestAnimationFrame(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === "SB_CAPTURE_END") {
    removeCaptureOverlay();
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "SB_GET_PAGE_METRICS") {
    originalScrollY = window.scrollY;

    const metrics: PageMetrics = {
      fullHeight: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0),
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
    // Re-show the notice between capture frames (it was hidden for the shot).
    setCaptureOverlayDisplay(true);

    window.requestAnimationFrame(() => {
      sendResponse({ ok: true, y: window.scrollY });
    });
    return true;
  }

  if (message?.type === "SB_RESTORE_SCROLL") {
    window.scrollTo(0, originalScrollY);
    removeCaptureOverlay();
    sendResponse({ ok: true });
    return true;
  }

  return false;
});
