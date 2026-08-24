# Completion Summary: Prompt verbosity levels

## What changed

- `src/lib/feedback.ts`
  - New `Verbosity = "compact" | "standard" | "detailed"`.
  - `formatAreaComments(annotations, verbosity, image?)` - `compact` emits
    only `N. [tool] note`; `standard` adds geometry (when `image` is given)
    and the ` -> cssPath in <Chain>` suffix (when a context was mapped);
    `detailed` also appends indented `text`/`classes`/`rect` lines under any
    annotation with a context.
  - `contextLines(verbosity, environment, diagnostics)` - `compact` drops both
    blocks; `standard` carries `Environment:` only; `detailed` adds
    `Diagnostics:` after it. This is the deliberate behaviour change: the
    Diagnostics block used to appear whenever it was non-empty, regardless of
    level - it is now `detailed`-only.
  - Both `buildExternalLlmPrompt` and `buildClaudeCodePrompt` take an optional
    `verbosity`, defaulting to `"standard"` - the default reproduces exactly
    what both builders emitted before this change, byte for byte, for every
    input that has no diagnostics (the common case). An input that *does*
    carry diagnostics now differs at `"standard"` by exactly the missing
    Diagnostics block, which is the point.
- `src/lib/prefs.ts` (new) - `Prefs { promptVerbosity?: Verbosity }`,
  `getPrefs()`/`setPrefs(partial)` over `chrome.storage.local["prefs"]`.
  Thin `chrome.*` wrapper in the style of `localStore.ts`'s storage helpers:
  tolerates a missing or non-object stored value (resolves `{}`), merges a
  partial write onto whatever was already stored.
- `src/editor/use-editor-state.ts` - `promptVerbosity`/`setPromptVerbosity`.
  A mount effect calls `getPrefs()` once and adopts the stored value if one
  exists; `setPromptVerbosity` updates the render state and fires `setPrefs`
  (best effort, not awaited - a failed write costs the next session its
  remembered setting and nothing else).
- `src/editor/sidebar.tsx` - a "Prompt detail" `Select` (Compact/Standard/
  Detailed), placed with the output actions, same `id`+`aria-labelledby`
  pattern as Interaction/Tool/Zoom.
- `src/editor/use-exports.ts` - `verbosity: state.promptVerbosity` added to
  both builder calls. Also: `prepareExternalLlmPackage` now clears `status` to
  `null` up front (see the e2e finding below).

## A real bug found while wiring the e2e test

`prepareExternalLlmPackage` was the only one of the four async export
handlers that never reset `state.setStatus(null)` before starting. Its success
message is worded identically on every call ("Prompt copied. Annotated image
downloaded..."), so two `Prepare for Cloud LLM` clicks in a row left the DOM
text completely unchanged between them. The e2e helper `copyCloudPrompt`
waits for that text to *contain* "Prompt copied" as its signal that the
clipboard write finished - against unchanged text, that wait resolves
instantly, before the second click's async work (including
`navigator.clipboard.writeText`) has actually run, so the test read the
*previous* prompt off the clipboard. Confirmed by isolating the Select
interaction in a throwaway spec (it worked correctly on its own) and then
reproducing the stale-clipboard read with two `copyCloudPrompt()` calls back
to back. Fixed at the source - `state.setStatus(null)` up front, matching
`createShareUrl`/`copyForClaudeCode` - rather than papering over it with a
longer wait in the test.

## Sample outputs (fixed input: environment + geometry + context + diagnostics)

**Compact:**

```text
Please review this screenshot and provide feedback.

Page URL: https://example.test/page
General feedback context: (none)

Area comments:
1. [box] fix padding
2. [arrow] point here
3. [text] Label
```

**Standard (default - today's shape, minus Diagnostics when present):**

```text
Please review this screenshot and provide feedback.

Page URL: https://example.test/page

Environment:
- Page title: Acme Dashboard
- Viewport: 1280x800 @2x
- Color scheme: dark
- Scroller: document
- User agent: Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0.0.0
- Captured at: 2026-08-24T10:11:12.000Z

General feedback context: (none)

Area comments:
1. [box] fix padding - at (0, 0) size 10x10 px [0%, 0% of page] -> #app > section.hero > button.cta
2. [arrow] point here - from (0, 0) to (5, 5) px -> #app > section.hero > button.cta in <PricingCard > Page>
3. [text] Label - at (1, 2) px
```

**Detailed (standard + Diagnostics + per-annotation context detail):**

```text
...
Diagnostics:
- Failed requests:
  1. 404 https://example.test/missing.png
  2. 500 https://example.test/api/user

General feedback context: (none)

Area comments:
1. [box] fix padding - at (0, 0) size 10x10 px [0%, 0% of page] -> #app > section.hero > button.cta
   text: "Buy now"
   classes: [cta]
   rect: 200,184 200x120
2. [arrow] point here - from (0, 0) to (5, 5) px -> #app > section.hero > button.cta in <PricingCard > Page>
   text: "Buy now"
   classes: [cta]
   rect: 200,184 200x120
3. [text] Label - at (1, 2) px
```

## Gate

`npm run check` (typecheck, lint, 152 unit tests, build), `npm run
format:check`, and `npm run test:e2e` (6 passed) all green. Colour-literal
grep: zero hits.
