# Tasks: Copy annotated PNG to the clipboard

- [x] **1. Write the failing e2e test**
  - [x] 1.1 `ctx.grantPermissions(["clipboard-read", "clipboard-write"])` in `beforeAll`.
  - [x] 1.2 In the `smooth` capture test: click `Copy Image`, wait for the success status, then read `navigator.clipboard.read()` and assert `types[0] === "image/png"`.
- [x] **2. Run it to verify it fails**
  - [x] 2.1 RED: `locator.click: ... waiting for getByRole('button', { name: 'Copy Image' })` - no such button yet.
- [x] **3. Implement**
  - [x] 3.1 `copyImage` in `src/editor/use-exports.ts`: `exportAnnotatedImage` → `fetch` → `blob` → `navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])`, mirroring the guard/status pattern of the other exports.
  - [x] 3.2 `Copy Image` secondary button in `src/editor/sidebar.tsx`, next to `Download Image (PNG)`, same `disabled={!baseDataUrl || isBusy}`.
- [x] **4. Run e2e + gate**
  - [x] 4.1 GREEN, both in isolation and in the full 6-test suite, run twice for flakiness.
  - [x] 4.2 `navigator.clipboard.write` succeeded on the extension page with only the granted context permissions - no `clipboardWrite` manifest permission was needed.
  - [x] 4.3 `npm run check`, `npm run format:check` - green.
  - [x] 4.4 `grep -rnE "(text|bg|border|ring|from|to|via|fill|stroke)-(slate|emerald|red|white)\b" src/` - zero hits.
- [x] **5. Docs**
  - [x] 5.1 README: Features bullet + Usage outputs line.
  - [x] 5.2 CLAUDE.md: "Three outputs" → "Four outputs", added Copy Image.
- [x] **6. Commit and PR**
