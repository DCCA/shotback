# Completion Summary: One-Click Capture Reliability + On-Page Notice

Hardening of one-click capture, found while dogfooding. Shipped as four PRs.

## What changed
- **Content-script retry (PR #11):** `sendToContentScript` re-injects `content.js` and retries the first `SB_GET_PAGE_METRICS` past the transient "Receiving end does not exist" error. Also fixes capturing tabs that were open before the extension was (re)loaded.
- **Tab-activation retry (PR #12):** `activateTab` retries `chrome.tabs.update(..., {active:true})` past "Tabs cannot be edited right now"; used for target activation and best-effort restore.
- **On-page notice (PR #13):** `content.ts` injects a fixed "Capturing full page… don't switch tabs or scroll" notice during capture, hidden for each frame and removed at the end. All notice messages are best-effort (`notify`).
- **Notice paint-race fix (PR #14):** `SB_SET_OVERLAY` now acks after the next paint (double-rAF) and capture adds a 60ms settle, so the notice no longer leaks into the screenshot.

## Validation
- `tests/capture.test.ts`: `isNoReceiverError`, `isTabsBusyError`, and the retry/give-up/rethrow behavior of `sendToContentScript` + `activateTab`. **54 tests pass.**
- `npm run check` + `format:check` green; CI green before each merge.
- Confirmed the wiring in the built `dist/` (notice strings, double-rAF, retry guards).

## Deferred
- Live in-browser confirmation (one-click → auto-capture → notice visible while scrolling → clean stitched PNG). Not runnable in CI; tracked in `.docs/todo/2026-02-23-priority-todo.md`.
