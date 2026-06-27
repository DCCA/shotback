# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Required reading before edits

Read `FIREHOSE.md` before making any change — it is the project's operating contract (OpenSpec-lite: fluid, iterative, brownfield-first, one logical unit of work per change). If `FIREHOSE.md` conflicts with another local guideline, `FIREHOSE.md` wins unless the user overrides it. `AGENTS.md` and `CONTRIBUTING.md` restate the same workflow.

Non-trivial work is tracked as a change folder under `.docs/`: `proposal.md` (why/scope), `spec.md` (RFC-2119 requirements with Given/When/Then scenarios), `design.md` (how), `tasks.md` (checklist). Move `todo/ → doing/ → done/` and add a `completion-summary.md` when finishing. `.docs/PRD.md` is the product entry point. `.docs/` is source-of-truth — never gitignore it.

## Commands

- `npm run check` — the gate: `typecheck && lint && test && build`. Run before any PR.
- `npm run dev` / `npm run build` — Vite dev server / production build into `dist/`.
- `npm run test` — Vitest unit tests (`vitest run`, scoped to `tests/**/*.test.ts` by `vitest.config.ts`). Single file: `npx vitest run tests/capture.test.ts`. Single test: `npx vitest run -t "name substring"`. Watch: `npx vitest`.
- `npm run test:e2e` — Playwright end-to-end smoke test (`tests/e2e/extension.spec.ts`, config `playwright.config.ts`). Builds `dist/`, then launches **real Chromium in new-headless with the unpacked extension loaded** (`--load-extension`) and asserts: the extension/service worker loads (no popup, `downloads` permission), the on-page capture notice shows → hides cleanly → is removed (driven through the real content script via `SB_CAPTURE_*` messages), and the editor page renders. Requires a one-time `npx playwright install chromium`. **Deliberately excluded from `npm run check`/CI** (needs downloaded browsers + new-headless) — run it locally on demand.
- `npm run typecheck`, `npm run lint` (`lint:fix`), `npm run format` (`format:check`).
- `npm run gen:icons` — regenerate `public/icons/*` from `scripts/generate-icons.mjs`.

To run the extension: `npm run build`, then load the `dist/` folder via `chrome://extensions` (Developer mode → Load unpacked). `npm run test:e2e` automates the page-side flows; the parts it can't (clicking the toolbar icon, real `captureVisibleTab`) are still verified manually (capture, annotate/comment, timeline select/remove, viewer, cloud-LLM fallback).

## Architecture

A Manifest V3 Chrome extension (TypeScript + React 18 + Vite + Tailwind). Two HTML entry points (editor, viewer) plus two extension scripts, all bundled by `vite.config.ts` (which fixes `background.js`/`content.js` output names so the manifest can reference them). `@/*` aliases `src/*`.

**Three surfaces:**

- The toolbar icon has **no popup**: `src/background.ts`'s `chrome.action.onClicked` handler opens the editor in a new tab with `?tabId=&windowId=&autocapture=1` of the active tab, and the editor auto-captures once on load (one-click capture).
- `src/editor/main.tsx` — the heart of the app (~1000 lines). Drives capture, hosts the annotation canvas, the comment timeline, general feedback, and the three output actions.
- `src/viewer/` — renders a saved share from `?share=<id>` (local-only page).
- `src/background.ts` — service worker; logs on install and hosts the `chrome.action.onClicked` handler (one-click capture). `src/content.ts` — injected on `<all_urls>`; responds to `SB_GET_PAGE_METRICS` / `SB_SCROLL_TO` / `SB_RESTORE_SCROLL`, and to the capture-notice messages `SB_CAPTURE_BEGIN` / `SB_SET_OVERLAY` / `SB_CAPTURE_END`.

**Full-page capture flow** (`src/lib/capture.ts`, called from the editor — _not_ from the background): `activateTab` brings the target tab forward → `ensureInjectable` re-injects `content.js` → reads page metrics → `buildScrollSteps` computes viewport-sized scroll offsets → for each step, scrolls the page (via content-script message) and calls `chrome.tabs.captureVisibleTab` → stitches the PNG segments onto a single canvas scaled by `devicePixelRatio`. Restores scroll and the previously-active tab in `finally` blocks.

**One-click auto-capture races two transient Chrome errors** (it fires the instant the editor opens, before the tab strip/content script have settled), handled by retry helpers in `capture.ts`: `activateTab` retries `chrome.tabs.update` past `isTabsBusyError` ("Tabs cannot be edited right now"), and `sendToContentScript` re-injects + retries past `isNoReceiverError` ("Receiving end does not exist"). All four are exported and unit-tested in `tests/capture.test.ts`.

**On-page capture notice:** because capture activates and scrolls the _target_ tab (the user is looking at the page, not the editor), `content.ts` injects a fixed top-of-viewport notice ("Capturing full page… don't switch tabs or scroll"). The orchestrator shows it (`SB_CAPTURE_BEGIN`), hides it for each `captureVisibleTab` frame (`SB_SET_OVERLAY`, acked only **after the next paint** via double-rAF so it never leaks into a frame), re-shows it on each `SB_SCROLL_TO`, and removes it on `SB_RESTORE_SCROLL` / `SB_CAPTURE_END`. Notice messages go through `notify` — best-effort, never abort a capture.

**Storage (two-tier, see `src/lib/localStore.ts` + `src/lib/shareDb.ts`):** share _metadata_ (annotations, feedback, page URL, blob key) lives in `chrome.storage.local` under `share:<id>` keys; the large PNG _blob_ lives in IndexedDB (`shotback`/`shareImages`) keyed by `share-image:<id>`. `localStore` is the only module that touches both; it converts dataURL↔Blob, enforces `schemaVersion: 2`, transparently migrates legacy v1 records (inline `imageDataUrl`) on read, and prunes via `DEFAULT_RETENTION_POLICY` (50 shares / 30 days) after each save. A share link is `chrome.runtime.getURL("viewer.html?share=<id>")` — intentionally profile-scoped, never a public URL.

**Pure, unit-tested helpers** (these are where the real logic and the tests live — `tests/*.test.ts` mirror them):

- `src/lib/annotate.ts` — `exportAnnotatedImage` rasterizes annotations onto the screenshot; `selectFeedbackRenderMode` picks footer vs. overlay so the export canvas never exceeds `MAX_EXPORT_CANVAS_HEIGHT`/`AREA` limits.
- `src/lib/feedback.ts` — `buildExternalLlmPrompt` / `buildClaudeCodePrompt` (the structured prompts copied for the cloud-LLM and Claude Code exports) and `annotationSummary`.
- `src/lib/capture.ts` — `buildScrollSteps` (scroll offsets) plus the retry helpers/guards `activateTab`, `sendToContentScript`, `isTabsBusyError`, `isNoReceiverError`.
- `src/lib/wslPath.ts` — `toClaudePath` translates a Windows path to its WSL `/mnt/<drive>/…` mount for the Claude Code export.
- `src/lib/boxResize.ts` — box drag/resize geometry.
- `src/lib/selectNavigation.ts` — `getNextIndex`/`matchTypeahead` keyboard-navigation rules for the custom `Select` listbox (so the interaction logic is testable apart from the DOM).
- `src/types/annotation.ts` — the `Annotation` discriminated union (`box` | `arrow` | `text`).

**Design system (`src/components/ui/*` + `src/styles/globals.css` + `tailwind.config.js`):** components are driven by semantic HSL **CSS-variable tokens** (`--primary`, `--secondary`, `--muted`, `--accent`, `--destructive` + `-hover`, `--border`, `--input`, `--ring`) mapped to Tailwind color utilities — use `bg-primary`/`border-input`/`ring-ring` etc., never hardcoded `emerald-*`/`slate-*` literals, in the primitives. A `.dark` token block exists (opt-in via `class="dark"`; light is the default) and is kept **outside `@layer base`** so Tailwind does not tree-shake the unreferenced selector. `Select` is a **custom WAI-ARIA listbox** (not a native `<select>`): pass `value` + `onValueChange` + `options`, not `<option>` children — the native option popup is unstylable, which is why it was replaced.

**Three outputs from the editor:** (1) _Copy Local Share Link_ → `saveLocalShare` + viewer URL; (2) _Prepare for Cloud LLM_ → downloads the annotated PNG and copies `buildExternalLlmPrompt` output to the clipboard; (3) _Copy for Claude Code_ → saves the PNG to `Downloads/shotback/` via `chrome.downloads`, reads back its absolute path, and copies `buildClaudeCodePrompt` output with the path translated by `toClaudePath` (`src/lib/wslPath.ts`, `C:\… → /mnt/c/…`) so a WSL Claude Code session can read the file directly. The extension makes **no network requests of its own**; data leaves the device only via these explicit manual exports.

## Conventions

- TypeScript `strict` with `noUnusedLocals`/`noUnusedParameters`; explicit over clever.
- `kebab-case` file names; small, low-blast-radius diffs over broad refactors.
- Keep pure logic in `src/lib/*` (testable, no `chrome.*`); confine `chrome.*` calls to the editor/viewer/background/content boundaries.
- Conventional-commit style messages (`feat:`, `fix:`, `chore:`, `security:`); one logical change per commit.
- Permissions are deliberately minimal (`activeTab`, `tabs`, `scripting`, `storage`, `unlimitedStorage`, `<all_urls>` host access) — see `SECURITY.md` before touching `public/manifest.json`.
