# Completion Summary: Copy annotated PNG to the clipboard

## What changed

- `src/editor/use-exports.ts` - new `copyImage` export: builds the annotated
  PNG with `exportAnnotatedImage`, converts it to a `Blob` via `fetch`, and
  calls `navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])`.
  Follows the same guard (`!state.baseDataUrl` -> error status) and
  try/catch-to-status pattern as `download`/`prepareExternalLlmPackage`.
- `src/editor/sidebar.tsx` - `Copy Image` secondary button between
  `Download Image (PNG)` and `Prepare for Cloud LLM`, disabled under
  `!baseDataUrl || isBusy` like its neighbours.
- `tests/e2e/extension.spec.ts` - `ctx.grantPermissions(["clipboard-read",
"clipboard-write"])` in `beforeAll`; the `smooth` capture test now clicks
  `Copy Image`, waits for the success status (the copy is async and can race
  a bare clipboard read straight after the click), and asserts
  `navigator.clipboard.read()`'s first item carries `image/png`.
- `README.md` - Features bullet and a "Copy Image" line under Usage outputs.
- `CLAUDE.md` - "Three outputs" -> "Four outputs", documenting `copyImage`.

## Permission decision

No manifest change. `navigator.clipboard.write` succeeded on the extension
page using only the Playwright context's granted `clipboard-write`
permission plus the user-gesture click - Chromium extension pages did not
need `clipboardWrite` in `public/manifest.json`. `SECURITY.md` is unchanged.

## Evidence

RED (before implementation):

```
Error: locator.click: Target page, context or browser has been closed
Call log:
  - waiting for getByRole('button', { name: 'Copy Image' })
```

GREEN, full suite, run twice for flakiness:

```
Running 6 tests using 1 worker
  6 passed (6.3s)
  6 passed (6.1s)
```

`npm run check` (typecheck, lint, 82 unit tests, build) - all green.
`npm run format:check` - all matched files use Prettier code style.
`grep -rnE "(text|bg|border|ring|from|to|via|fill|stroke)-(slate|emerald|red|white)\b" src/` -
zero hits.

## One thing worth noting

The first pass at the e2e assertion read the clipboard immediately after the
click and was flaky in the full suite (`type: undefined` - the read raced the
async write). Fixed by waiting for the sidebar's success status text
("... copied ...") before reading the clipboard, matching the wait pattern
already used for "Copy Local Share Link" elsewhere in the same test.
