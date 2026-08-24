# Completion Summary: Page diagnostics in the prompt

## What changed

- `src/lib/capture.ts`
  - `PageDiagnostics` - `{ failedRequests: Array<{ url, status, initiatorType }> }`.
  - `CaptureResult.diagnostics`.
  - `getDiagnostics(tabId)` - sends `SB_GET_DIAGNOSTICS` through the existing
    `sendToContentScript` retry/re-inject helper and returns
    `{ failedRequests: [] }` on any failure. `captureFullPage` calls it right
    after the metrics read, before the notice goes up.
- `src/content.ts` - `SB_GET_DIAGNOSTICS` answers
  `{ failedRequests }`, computed on demand from
  `performance.getEntriesByType("resource")`: entries whose `responseStatus` is
  a number and is 400 or more, deduped by `"<status> <url>"`, capped at 20, each
  URL through `diagnosticText` (whitespace collapsed, trimmed, 200 chars) because
  a URL is page-controlled text on its way into a prompt.
- `src/lib/feedback.ts`
  - `diagnosticsBlock` - the `Diagnostics:` lines, empty when nothing failed.
  - `environmentLines` became `environmentBlock` (no surrounding blanks) and the
    new `contextLines(environment, diagnostics)` composes whichever blocks exist,
    blank-line separated, contributing **no** lines at all when both are empty.
    That is what keeps the no-context prompts byte-identical.
  - Both builders take an optional `diagnostics`.
- `src/editor/use-editor-state.ts` - `diagnostics` / `setDiagnostics`.
- `src/editor/main.tsx` - cleared when a capture starts, set from
  `result.diagnostics`.
- `src/editor/use-exports.ts` - passed to both prompt builders.

## Message protocol as shipped

```text
editor -> tab:  { type: "SB_GET_DIAGNOSTICS" }
tab -> editor:  { failedRequests: Array<{ url: string; status: number; initiatorType: string }> }
```

## Sample block

Real clipboard output from the `smooth` e2e run (the fixture requests a
`/missing.png` the server answers with 404):

```text
Page URL: http://127.0.0.1:36211/smooth

Environment:
- Page title: (untitled)
- Viewport: 780x493 @1x
- Color scheme: light
- Scroller: document
- User agent: Mozilla/5.0 (X11; Linux x86_64) ... HeadlessChrome/149.0.0.0 Safari/537.36
- Captured at: 2026-08-24T17:01:27.733Z

Diagnostics:
- Failed requests:
  1. 404 http://127.0.0.1:36211/missing.png

General feedback context: (none)
```

## Console errors: measured, not shipped

The briefed ring buffer (`window.addEventListener("error")` +
`unhandledrejection` in `content.ts`) was implemented first and does not work:
Chromium reports an uncaught error only to listeners in the world that threw,
and the content script runs in an isolated world. Two independent measurements,
both against real Chromium with the built extension loaded:

```text
CONTENT SCRIPT DIAGNOSTICS: {"errors":[],"failedRequests":[]}
PROBE WORLDS: {"isolated":[],"main":["Uncaught TypeError: globalThis.boomProbe is not a function"]}
```

```text
Diagnostics:
- Failed requests:
  1. 404 http://127.0.0.1:36211/missing.png
...
Expected substring: "nonexistentFn"
1 failed
```

Collecting them needs a second content script declared `"world": "MAIN"` at
`run_at: "document_start"` on `<all_urls>` - extension code in every page's own
JavaScript world on every page load, page-readable, page-tamperable, and a
fingerprinting vector. `SECURITY.md` omits `web_accessible_resources` for that
last reason and names on-demand injection as the direction of travel, so the
trade was not made here. The dead collector was removed rather than shipped as
decoration; the limitation is documented in `README.md` (Usage, "Known
limitation"), `SECURITY.md` ("Deliberate non-collection: page console errors")
and `CLAUDE.md`. **Open decision for the maintainer**, with two options:

1. Accept the `world: "MAIN"` content script and collect page errors.
2. Leave it as documented, and paste console output by hand when an agent needs
   it.

## RED/GREEN evidence

### Group 1: the pure block (`tests/feedback.test.ts`)

RED:

```text
FAIL  tests/feedback.test.ts > buildClaudeCodePrompt > renders the diagnostics block after the environment block
- Diagnostics:
- - Console errors (since capture tooling loaded):
-   1. Uncaught ReferenceError: nonexistentFn is not defined (https://example.test/app.js:12)
-   2. Script error.
- - Failed requests:
-   1. 404 https://example.test/missing.png
Test Files  1 failed (1)
     Tests  5 failed | 23 passed (28)
```

The two byte-identity guards passed from the start, which is what they are for.

GREEN: `28 passed (28)` with the block in place, then `27 passed (27)` after the
console-error cases were dropped along with the feature.

### Group 2/3: the chrome boundary and the editor (e2e)

RED - implementation stashed (`git stash push -- src`), `dist/` rebuilt from the
pre-change tree, `npx playwright test -g smooth`:

```text
> 344 |       expect(prompt).toContain("Diagnostics:");
1 failed
```

The same run shows the fixture's new markup did not disturb the pixel/height
assertions (the test reached the diagnostics assertion).

GREEN after `git stash pop` + rebuild - the prompt carries
`Diagnostics:`, `- Failed requests:`, `404 ` and `/missing.png`.

## Gate output

```text
npm run check
  typecheck: clean
  lint: clean
  test: 12 files, 123 tests passed
  build: succeeded

npm run format:check
  All matched files use Prettier code style!

npm run test:e2e
  6 passed (7.1s)

grep -rnE "(text|bg|border|ring|from|to|via|fill|stroke)-(slate|emerald|red|white)\b" src/
  (zero hits)

em dashes on added lines
  (zero hits)
```

## Self-review

- **Completeness**: message, content-script computation, capture wrapper,
  `CaptureResult` field, editor state (set and cleared), both prompt builders,
  unit tests, an e2e that drives the whole chain through a real capture, and
  docs in all three places.
- **Quality**: every URL is clamped at the boundary it crosses (one line, 200
  chars, 20 entries, deduped); `responseStatus` is feature-guarded;
  `getDiagnostics` cannot fail a capture; the block is omitted rather than
  rendered empty, and `contextLines` proves that with byte-identity tests.
- **Discipline**: no verbosity levels (Task 18), no new dependency, no new
  permission, no manifest change, no share-schema change, no colour literals, no
  em dashes.
- **Testing**: RED captured for both groups before implementing, GREEN
  re-verified, plus the two-world probe that settled the console-error question
  with evidence rather than assumption.

## Deviations and follow-ups

- **Console errors are not collected** (see above). `PageDiagnostics` therefore
  ships without the briefed `errors` field rather than with a field that is
  always empty; adding it back is additive if option 1 is chosen.
- **Diagnostics are not persisted on shares.** The brief did not ask for it and
  no viewer surface renders it; `SECURITY.md` describes them as reaching the
  prompts, which is what happens.
- `initiatorType` is collected but not printed - it is the hook for a richer
  line ("404 img ...") if Task 18 wants one.
- Only requests that finished with a status are seen. A request that never got a
  response (DNS failure, connection refused, blocked by an extension) has no
  `responseStatus` and is invisible here, as is anything a cross-origin server
  hides via `Timing-Allow-Origin` (`responseStatus` is exposed regardless of
  TAO, but the entry must exist).
