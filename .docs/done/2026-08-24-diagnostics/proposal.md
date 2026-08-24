# Proposal: Page diagnostics in the prompt

## Why

A screenshot shows a broken image; it does not show that the request behind it
came back `404`, and it never shows a failed `fetch` at all. The agent reading
the prompt has to ask, or guess. The captured tab knows: the browser records
every request the page made, status included, and the content script can read it
at capture time for nothing.

## Goal

Both prompts carry a `Diagnostics:` block, after the `Environment:` block, when
- and only when - the captured page had requests that failed:

```text
Diagnostics:
- Failed requests:
  1. 404 https://example.com/assets/logo.png
  2. 500 https://example.com/api/user
```

A prompt with nothing to report stays byte-identical to what it was before.

## Scope

- `src/lib/capture.ts` - `PageDiagnostics`, `CaptureResult.diagnostics`, and the
  best-effort `getDiagnostics(tabId)` wrapper, called right after the metrics
  read.
- `src/content.ts` - `SB_GET_DIAGNOSTICS`, computed on demand from
  `performance.getEntriesByType("resource")`.
- `src/lib/feedback.ts` - the pure `Diagnostics:` block, and `contextLines`,
  which now composes the environment and diagnostics blocks.
- `src/editor/*` - `diagnostics` state, cleared when a capture starts, passed to
  both builders.
- `tests/feedback.test.ts`, `tests/e2e/extension.spec.ts`.
- `README.md`, `SECURITY.md`, `CLAUDE.md`.

## Out of Scope

- Verbosity levels (Task 18).
- Persisting diagnostics on saved shares: the block is a handoff aid for the
  prompt, and no viewer surface renders it. Adding it later is another optional
  passthrough field, exactly as `environment` was.
- Console errors - see below.

## Console errors: not shipped, and why (design change during implementation)

The brief had a module-level ring buffer in `content.ts`, fed by
`window.addEventListener("error")` and `unhandledrejection`, on the assumption
that an error thrown after the content script loads lands in it. It does not.
Chromium reports an uncaught error only to listeners in the JavaScript world
that threw it, and the content script runs in an isolated world. Probed against
real Chromium with the built extension loaded, one page, an error thrown in the
page's own world, identical listeners installed in each world:

```text
CONTENT SCRIPT DIAGNOSTICS: {"errors":[],"failedRequests":[]}
PROBE WORLDS: {"isolated":[],"main":["Uncaught TypeError: globalThis.boomProbe is not a function"]}
```

The e2e said the same thing at the feature level: with the ring buffer shipped,
a fixture page whose `setTimeout` calls `nonexistentFn()` produced a prompt
carrying the 404 and nothing else.

```text
Diagnostics:
- Failed requests:
  1. 404 http://127.0.0.1:36211/missing.png
...
Expected substring: "nonexistentFn"
```

The only mechanism that works is a second content script declared with
`"world": "MAIN"` at `run_at: "document_start"` on `<all_urls>`: extension code
inside every page's own JavaScript world, on every page load, page-readable and
page-tamperable, and an extension-fingerprinting vector. `SECURITY.md`
deliberately omits `web_accessible_resources` for that last reason and names
"move fully to on-demand injection to avoid running on every page load" as the
intended direction, so this change does not make that trade on its own
authority. The dead listeners were removed rather than shipped as decoration,
the limitation is documented in `README.md` and `SECURITY.md`, and the decision
is left open for the maintainer.
