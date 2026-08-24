# Completion Summary: Environment block in prompts, shares and viewer

## What changed

- `src/lib/capture.ts` - `PageMetrics` gains `title`, `colorScheme` and
  `scroller`; new `CaptureEnvironment` interface and the pure
  `buildEnvironment(metrics, userAgent, now)` (`now` injected so the ISO
  timestamp is testable); `CaptureResult` carries `environment`, built in
  `captureFullPage` from `navigator.userAgent` and `new Date()`.
- `src/content.ts` - `SB_GET_PAGE_METRICS` now reports `document.title`,
  `matchMedia("(prefers-color-scheme: dark)")` and `scroller: "document" |
"element"` (the content script knows which branch `findScroller` took, so the
  kind is reported rather than inferred from `scrollerTop`). The shared fields
  moved into one `shared` object used by both branches.
- `src/lib/feedback.ts` - both prompt builders take an optional `environment`
  and render, after the `Page URL:` line:

  ```
  Environment:
  - Page title: <title or "(untitled)">
  - Viewport: <w>x<h> @<dpr>x
  - Color scheme: light|dark
  - Scroller: document|element
  - User agent: <ua>
  - Captured at: <ISO 8601>
  ```

  `environmentLines` returns `[]` when no environment is given, so prompts
  without one are byte-identical to before (asserted with a full-string `toBe`).

- `src/lib/localStore.ts` - optional `environment` on `LocalShare`,
  `LocalShareMeta` and the `saveLocalShare` input, passed straight through
  `toLocalShareMeta` and back out of `getLocalShare`. **No `schemaVersion` bump
  and no migration** - older shares simply read back `undefined`.
- `src/editor/use-editor-state.ts` / `main.tsx` / `use-exports.ts` - the editor
  holds `environment`, clears it when a capture starts (next to
  `resetAnnotations`), sets it from the capture result, and passes it to
  `buildExternalLlmPrompt`, `buildClaudeCodePrompt` and `saveLocalShare`.
- `src/viewer/main.tsx` - metadata card shows
  `Viewport: WxH @Nx - <colorScheme>` under "Saved at", only when the share
  carries an environment.
- Tests: `buildEnvironment` mapping (`tests/capture.test.ts`), block
  present/absent/`(untitled)` for both builders (`tests/feedback.test.ts`),
  environment round-trip plus legacy record (`tests/localStore.test.ts`), and
  the `smooth` e2e now asserts the copied cloud-LLM prompt carries the captured
  tab's real viewport.
- `CLAUDE.md`, `README.md` - capture-flow paragraph, helper bullets, features
  bullet and usage note.

## Design note: whose environment?

Everything except `userAgent` and `capturedAt` describes the **captured tab**,
not the editor page - title, viewport, DPR and colour scheme all come from
`PageMetrics`, i.e. from the content script running in the target tab. Reading
them in the editor would have reported the editor tab's own size and scheme.

## Evidence

Unit RED (before implementation):

```
 FAIL  tests/capture.test.ts > buildEnvironment > maps page metrics onto the capture environment
 FAIL  tests/capture.test.ts > buildEnvironment > carries an inner scroller and a light scheme through unchanged
 FAIL  tests/feedback.test.ts > buildExternalLlmPrompt > renders the environment block after the page URL when one is captured
 FAIL  tests/feedback.test.ts > buildExternalLlmPrompt > falls back to a placeholder title
 FAIL  tests/feedback.test.ts > buildClaudeCodePrompt > renders the environment block after the page URL when one is captured
```

localStore RED:

```
expect((await getLocalShare(withEnv.id))?.environment).toEqual(environment)
+ Received: undefined
```

e2e RED (implementation stashed, `git stash push -- src/`):

```
Expected substring: "Viewport: 780x493"
Received string:    "Please review this screenshot and provide feedback.
Page URL: http://127.0.0.1:41431/smooth
General feedback context: (none)
Area comments:
1. [box] Chart"
```

GREEN - the real prompt copied by `Prepare for Cloud LLM` in the e2e run:

```
Please review this screenshot and provide feedback.

Page URL: http://127.0.0.1:39979/smooth

Environment:
- Page title: (untitled)
- Viewport: 780x493 @1x
- Color scheme: light
- Scroller: document
- User agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.0.0 Safari/537.36
- Captured at: 2026-08-24T15:32:37.312Z

General feedback context: (none)

Area comments:
1. [box] Chart
```

`npm run check` - typecheck, lint, **90 unit tests**, build: green.
`npm run format:check` - all matched files use Prettier code style.
`npm run test:e2e` - **6 passed**.
`grep -rnE "(text|bg|border|ring|from|to|via|fill|stroke)-(slate|emerald|red|white)\b" src/` -
zero hits.

## Follow-ups

- Element geometry and DOM context for the annotated regions (later handoff-v2
  tasks) plug into the same `CaptureEnvironment` handoff path.
- The environment is exported as-is; if a user ever needs to redact the user
  agent or URL before sending it to a cloud LLM, that is a separate change.
