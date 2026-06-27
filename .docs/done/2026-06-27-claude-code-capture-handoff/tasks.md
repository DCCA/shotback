# Tasks: Frictionless Capture → Claude Code Handoff

## 1. Change A — One-Click Capture (PR1)
- [x] 1.1 Remove `default_popup` from `public/manifest.json` `action`.
- [x] 1.2 Add `chrome.action.onClicked` handler in `src/background.ts` → open `editor.html?tabId=&windowId=&autocapture=1`.
- [x] 1.3 Add one-shot auto-capture `useEffect` (ref-guarded) in `src/editor/main.tsx`.
- [x] 1.4 Delete `popup.html` + `src/popup/`; remove `popup` input from `vite.config.ts`.
- [x] 1.5 `npm run check` (+ `format:check`) green; build `dist/`; load-unpacked sanity check.
- [x] 1.6 Branch, commit, push, open PR, merge, delete branch.

## 2. Change B — Copy for Claude Code (PR2)
- [x] 2.1 Add `src/lib/wslPath.ts` (`toClaudePath`) + `tests/wslPath.test.ts` (TDD).
- [x] 2.2 Add `buildClaudeCodePrompt` to `src/lib/feedback.ts` + extend `tests/feedback.test.ts` (TDD).
- [x] 2.3 Add `"downloads"` permission to `public/manifest.json`; update `SECURITY.md`.
- [x] 2.4 Wire `copyForClaudeCode()` + new button in `src/editor/main.tsx`.
- [x] 2.5 `npm run check` (+ `format:check`) green; build `dist/`; load-unpacked sanity check.
- [x] 2.6 Branch off updated `main`, commit, push, open PR, merge, delete branch.

## 3. Wrap-up
- [x] 3.1 Move change folder `doing/ → done/`; add `completion-summary.md`.
