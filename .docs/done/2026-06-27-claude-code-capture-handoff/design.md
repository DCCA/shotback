# Design: Frictionless Capture → Claude Code Handoff

## Change A — One-Click Capture

- **`public/manifest.json`**: remove `"default_popup": "popup.html"` from `action`. With no popup, Chrome dispatches `chrome.action.onClicked`. No permission changes for this change.
- **`src/background.ts`**: add `chrome.action.onClicked.addListener((tab) => …)`. Build the same URL the popup built and open it with an extra flag:
  `editor.html?tabId=<tab.id>&windowId=<tab.windowId>&autocapture=1`, via `chrome.tabs.create`. Guard against missing `tab.id`.
- **`src/editor/main.tsx`**: read `autocapture` from the query string. Add a one-shot `useEffect` guarded by a `useRef` boolean: when `autocapture === "1"`, `canCapture` is true, and it hasn't fired, call the existing `takeScreenshot()`. The capture logic in `src/lib/capture.ts` already activates the target tab and restores the previously-active tab + scroll in `finally`, so auto-firing is behaviorally identical to the manual button.
- **Cleanup**: delete `popup.html` and `src/popup/`; remove the `popup` entry from `rollupOptions.input` in `vite.config.ts`. The editor's existing "Capture" button remains for re-capture.

## Change B — Copy for Claude Code

### Pure helpers (unit-tested, no `chrome.*`)
- **`src/lib/wslPath.ts`** → `toClaudePath(abs: string): string`
  - Match `^([A-Za-z]):[\\/](.*)$`. On match → `/mnt/` + lowercased drive + `/` + rest with all `\` replaced by `/`.
  - Otherwise return `abs` unchanged (already POSIX, or unrecognized).
  - Also collapse any `\` to `/` only within the matched Windows branch; POSIX paths are untouched.
- **`src/lib/feedback.ts`** → add `buildClaudeCodePrompt({ filePath, pageUrl, generalFeedback, annotations })`
  - Reuses the same comment-formatting shape as `buildExternalLlmPrompt`.
  - First line: `Review this screenshot: <filePath>` followed by the page URL, general feedback, and numbered area comments.
  - `buildExternalLlmPrompt` stays unchanged.

### Editor wiring (`src/editor/main.tsx`)
`copyForClaudeCode()`:
1. Guard `baseDataUrl` present (else error status, no clipboard write).
2. `merged = await exportAnnotatedImage(baseDataUrl, annotations, { generalFeedback })`.
3. Convert `merged` dataURL → `Blob` → `URL.createObjectURL`.
4. `id = await chrome.downloads.download({ url, filename: \`shotback/cap-<stamp>.png\`, conflictAction: "uniquify", saveAs: false })`.
5. Await completion via a `chrome.downloads.onChanged` listener (state → `complete`) with a short timeout, then `chrome.downloads.search({ id })` to read `DownloadItem.filename` (absolute path).
6. `filePath = item?.filename ? toClaudePath(item.filename) : "Downloads/shotback/<name>.png"` (relative fallback).
7. `prompt = buildClaudeCodePrompt({ filePath, pageUrl, generalFeedback, annotations })`; `await navigator.clipboard.writeText(prompt)`.
8. Success status when the absolute path resolved; a softer "path could not be fully resolved" status on fallback. `URL.revokeObjectURL` in `finally`.
9. New button placed alongside the existing two outputs; both existing actions untouched.

### Manifest / security
- Add `"downloads"` to `permissions` in `public/manifest.json`. Record the new permission and its rationale in `SECURITY.md` (manifest-change guard).

## Testing
- `tests/wslPath.test.ts`: Windows drive translation, drive lowercasing, backslash→slash, nested folders, POSIX pass-through, forward-slash Windows variant (`C:/…`).
- `tests/feedback.test.ts`: extend for `buildClaudeCodePrompt` — path line present, comments rendered, empty annotations/feedback.
- Background `onClicked` + editor auto-capture effect live at the `chrome.*` boundary → manual verification when loaded unpacked (consistent with repo's no-runner-for-live-extension note). `npm run check` gates typecheck/lint/test/build.

## Delivery
Two sequential PRs (independent logical units), each merged before the next branches off `main`:
1. `feat: one-click capture` (Change A).
2. `feat: copy for Claude Code handoff` (Change B).
