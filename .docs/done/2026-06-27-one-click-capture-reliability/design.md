# Design: One-Click Capture Reliability + On-Page Notice

All changes are in `src/lib/capture.ts` and `src/content.ts`; no manifest/permission changes.

## Retry helpers (`src/lib/capture.ts`, exported + unit-tested)
- `isNoReceiverError(error)` / `isTabsBusyError(error)` — pure predicates matching the two transient Chrome error strings.
- `sendToContentScript(tabId, message, {retries=6, delayMs=150})` — send; on a no-receiver error, `ensureInjectable` (re-inject `content.js`) + `wait`, retry; rethrow other errors; throw after exhausting retries. Used for the racy first `SB_GET_PAGE_METRICS`.
- `activateTab(tabId, {retries=8, delayMs=150})` — `chrome.tabs.update(tabId, {active:true})`; on a tabs-busy error, `wait` + retry; rethrow others. Used to activate the target tab and (best-effort) restore the previously-active tab.

## On-page notice
- `src/content.ts` builds a `position:fixed`, max-z-index, `pointer-events:none` notice with inline styles (no dependence on page CSS) and a CSS-keyframe spinner. Handlers: `SB_CAPTURE_BEGIN` (show), `SB_SET_OVERLAY {visible}` (toggle), `SB_CAPTURE_END` (remove). `SB_SCROLL_TO` re-shows it; `SB_RESTORE_SCROLL` removes it.
- **Paint correctness:** `SB_SET_OVERLAY` acks via `afterPaint` = double `requestAnimationFrame`, so the display change is painted before the orchestrator proceeds — a single rAF runs before paint and let the notice leak into a frame.
- `src/lib/capture.ts` drives the lifecycle: `notify(SB_CAPTURE_BEGIN)` + a 450ms read pause; per segment `SB_SCROLL_TO` (re-show) → `wait(120)` → `notify(SB_SET_OVERLAY false)` → `wait(60)` (compositor settle) → `captureVisibleTab`; `SB_RESTORE_SCROLL` + `notify(SB_CAPTURE_END)` in `finally`. `notify` swallows errors so the cosmetic notice can never abort a capture.

## Testing
- `tests/capture.test.ts` covers `isNoReceiverError`, `isTabsBusyError`, and the retry/give-up/immediate-rethrow paths of `sendToContentScript` and `activateTab` with a stubbed `globalThis.chrome` (54 tests total).
- The DOM overlay + capture orchestration are at the `chrome.*`/DOM boundary → verified manually (load unpacked), per the repo's no-runner-for-live-extension convention.

## Delivery
Shipped as four PRs off `main`: #11 (content-script retry), #12 (tab-activation retry), #13 (on-page notice), #14 (notice paint-race fix).
