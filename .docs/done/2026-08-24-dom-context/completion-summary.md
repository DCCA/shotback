# Completion Summary: Per-annotation DOM context

## What changed

- `src/types/annotation.ts` - new `ElementContext` (`cssPath`, `tag`, optional
  `id`/`role`/`testId`/`text`/`component`, `classes`, page-px `rect`) and an
  optional `context?: ElementContext` on `AnnotationBase`, so every annotation
  kind carries it.
- `src/lib/dom-context.ts` (new, pure, no DOM lib types) - `cssPath(el:
ElementLike)`: segments joined with ` > `, an `#id` segment ends the walk,
  otherwise `tag` + the first two classes + `:nth-of-type(n)` only when
  `siblingsOfTypeCount > 1`, at most five levels (nearest kept).
- `src/content.ts` - `SB_INSPECT_POINTS { points }` -> `{ contexts }`:
  - re-resolves the scroller with `findScroller()` (module state is cleared when
    a capture ends and by re-injection);
  - per point, scrolls the capture scroller so the point is **centred** in the
    viewport, reads the achieved `scrollTop` back and hit-tests at
    `point.y - scrollTop`;
  - `document.elementsFromPoint`, skipping `STYLE` nodes and anything inside
    `[data-shotback-overlay]`;
  - marks the hit element `data-shotback-hit="<index>"` (marks are cleared at
    the start of every inspection) and describes it via
    `cssPath(toElementLike(el))`, `innerText` collapsed to 80 chars, and a
    `rect` in stitched-page CSS px (`rect.top + scrollTop`);
  - restores the original scroll in a `finally`, and refuses to run at all while
    the capture notice exists (a capture owns the scroll position).
  - No notice, no scrollbar hiding, no `originalScrollY` write: the inspection
    path shares nothing mutable with the capture path.
- `src/lib/capture.ts`:
  - `CaptureResult` gains `scale` (stitched image px per page CSS px, already
    computed for the stitch) and `scrollerTop`;
  - `readFiberComponents()` - injected into the page's **own** JavaScript world
    (`chrome.scripting.executeScript({ world: "MAIN" })`), it reads the React
    fiber off every `[data-shotback-hit]` element, collects `displayName ?? name`
    for object/function fiber types (host strings and anonymous types skipped),
    nearest first, three deep with a 60-step cap, and clears the marks;
  - `inspectPoints(tabId, points)` - sends `SB_INSPECT_POINTS` through the
    existing `sendToContentScript` retry/re-inject helper, then merges the
    main-world component chains in by index. Returns `[]` on any failure.
- `src/lib/numbering.ts` - `inspectAnchor(annotation)`: box centre, else
  `pinAnchor` (arrow tail, text start).
- `src/editor/use-editor-state.ts` - `getAnnotations()` exposes
  `annotationsRef.current`, because a commit handler runs a render ahead of the
  state value.
- `src/editor/main.tsx` - `captureScaleRef` (cleared when a capture starts, set
  from `result.scale`), and `refreshContexts()` called after
  `state.commitAnnotations()` on every canvas commit: one `inspectPoints` round
  trip with every annotation's point (`inspectAnchor / scale`), merged back by
  annotation id through `setAnnotations`.
- `src/lib/feedback.ts` - `describeContext` appends ` -> ${cssPath}` and, when a
  component chain was found, ` in <${component.join(" > ")}>` to each
  area-comment line, independently of whether an image size was given.

## Message protocol as shipped

```text
editor -> tab:  { type: "SB_INSPECT_POINTS", points: Array<{ x: number; y: number }> }
tab -> editor:  { contexts: Array<ElementContext | null> }

editor -> page (world: MAIN, chrome.scripting.executeScript):
                readFiberComponents() -> Record<pointIndex, string[]>
```

`points` are in **page CSS px** in the stitched capture's coordinate space
(image px / `CaptureResult.scale`), so `y` includes the `scrollerTop` band above
an inner scroller. `contexts` is index-aligned with `points`; an entry is `null`
when nothing was hit. The editor keeps whatever context an annotation already
had when the array length does not match (the failure shape). The main-world
pass is keyed by the same index, carried across worlds on the
`data-shotback-hit` attribute.

## Why a second, main-world pass

The brief had `content.ts` read the fiber with
`Object.keys(el).find((k) => k.startsWith("__reactFiber$"))`. A content script
runs in an isolated world, which cannot see expando properties the page set on a
DOM node. Probed against real Chromium with the built extension loaded, same tab,
`chrome.scripting.executeScript` into each world:

```text
ISOLATED: {"bodyKeys":[],"ctaKeys":[],"probe":"undefined"}
MAIN:     {"bodyKeys":["__probe"],"ctaKeys":["__reactFiber$abc"],"probe":"42"}
```

The e2e proves the same thing at the feature level: flipping the injection to
`world: "ISOLATED"` keeps the selector but drops the component chain

```text
Expected substring: "-> #app > section.hero > button.cta in <PricingCard > Page>"
Received string:    "... -> #app > section.hero > button.cta"
1 failed
```

and flipping it back to `"MAIN"` passes. The fiber walk therefore lives inside
the injected function (Chrome serializes its source, so it may not reference
imports or module constants), which is why `dom-context.ts` exports `cssPath`
only.

## Sample prompt line

Real clipboard output from the `inner` e2e run (a box drawn over the fixture's
CTA, which carries a React-shaped fiber; two earlier annotations sit on plain
colour blocks):

```text
Area comments:
1. [box] (no comment) - at (44, 60) size 160x120 px [6%, 2% of page] -> html > body > div:nth-of-type(2) > div:nth-of-type(1)
2. [text] (empty) - at (584, 500) px -> html > body > div:nth-of-type(2) > div:nth-of-type(2)
3. [box] (no comment) - at (254, 210) size 100x70 px [33%, 9% of page] -> #app > section.hero > button.cta in <PricingCard > Page>
```

## History-snapshot ruling

Contexts are written with `setAnnotations` **only**; `refreshContexts` never
calls `commitAnnotations`. A context is derived data (re-read on every commit),
and committing it would put a second entry on the undo stack for every edit, so
`Ctrl+Z` would appear to do nothing the first time. The accepted consequence:
a history snapshot taken before an inspection resolves keeps whatever context
the annotation had at snapshot time, and undoing to it can therefore surface a
slightly stale selector until the next commit refreshes it. This is documented
in `CLAUDE.md` (the "Per-annotation DOM context" section) and in `proposal.md`.

## RED/GREEN evidence

### Group 1: pure helpers and the prompt (`dom-context.test.ts`, `feedback.test.ts`)

RED:

```
❯ tests/dom-context.test.ts (0 test)
FAIL  tests/dom-context.test.ts [ tests/dom-context.test.ts ]
Error: Cannot find module '../src/lib/dom-context'

FAIL  tests/feedback.test.ts > buildExternalLlmPrompt > names the element under each annotation when a context was captured
- 1. [box] fix padding - at (0, 0) size 10x10 px [0%, 0% of page] -> #app > section.hero > button.cta
+ 1. [box] fix padding - at (0, 0) size 10x10 px [0%, 0% of page]
FAIL  tests/feedback.test.ts > buildExternalLlmPrompt > names the element even when no image size is given
FAIL  tests/feedback.test.ts > buildClaudeCodePrompt > names the element under each annotation when a context was captured
Tests  3 failed | 18 passed (21)
```

GREEN: the whole unit suite at `114 passed (114)`, including `cssPath`,
`inspectAnchor`, `readFiberComponents` (stubbed DOM) and `inspectPoints`
(stubbed `chrome`, covering the never-throws contract and the component merge).

### Group 2/3: content script, capture wrapper, editor wiring (e2e)

RED - implementation stashed (`git stash push -- src/`), `dist/` rebuilt from
the pre-change tree, `npx playwright test -g inner`: the drawn box exists, no
line names an element.

```
Expected substring: "-> #app > section.hero > button.cta"
Received string: "...
Area comments:
1. [box] (no comment) - at (44, 60) size 160x120 px [6%, 2% of page]
2. [text] (empty) - at (584, 500) px
3. [box] (no comment) - at (234, 210) size 100x70 px [30%, 9% of page]"
- Timeout 15000ms exceeded while waiting on the predicate
1 failed
```

GREEN after `git stash pop` + rebuild:

```
✓  1 tests/e2e/extension.spec.ts:164:3 › full-page capture stitches every viewport in order (inner) (3.8s)
1 passed
```

The same test then moves the box and re-copies the prompt, asserting
`button.cta` is still named: the context survives a move commit. The
`world: "ISOLATED"` experiment above is the RED for the component chain.

## Gate output

```
npm run check
  typecheck: clean
  lint: clean
  test: 12 files, 114 tests passed
  build: succeeded

npm run format:check
  All matched files use Prettier code style!

npm run test:e2e
  6 passed (6.7s)

grep -rnE "(text|bg|border|ring|from|to|via|fill|stroke)-(slate|emerald|red|white)\b" src/
  (zero hits)

em dashes on added lines
  (zero hits)
```

## Self-review

- **Completeness**: type, pure `cssPath`, the message, the main-world fiber
  pass, the capture wrapper, the editor refresh on every commit path (create,
  move, resize - all five `onCommit` call sites route through `main.tsx`), the
  prompt suffix in both builders, and an e2e that drives the whole chain through
  the real content script, a real capture and a real page-world injection.
- **Quality**: `src/lib/dom-context.ts` imports nothing and names no DOM type;
  the adapters in `content.ts` (`toElementLike`, `visibleText`) are thin and
  total; the scroll restore is in a `finally`; the inspection refuses to run
  while a capture holds the scroll position; `inspectPoints` and
  `readComponentChains` swallow every failure by design.
- **Discipline**: no verbosity levels, no sidecar file, no new dependency, no
  new manifest permission (`scripting` + `<all_urls>` already cover the
  main-world injection), no colour literals, no em dashes.
- **Testing**: RED captured for both groups before implementing; GREEN
  re-verified afterwards, plus a world-flip experiment that isolates the
  component chain, plus the full gate.

## Deviations and follow-ups

- **Main-world fiber pass** (see above): the brief's isolated-world fiber read
  cannot work, so the walk moved into an injected `world: "MAIN"` function and
  `reactComponentChain` is not an export of `dom-context.ts`.
- **Point centring**: the brief suggested scrolling to `y - scrollerTop`, which
  parks the inspected point on the scroller's top edge - where a sticky header
  would answer for it. The implementation centres the point in the viewport
  instead and derives the hit-test `y` from the scroll position actually
  achieved, which also handles clamping at the top and bottom of the page.
- `CaptureResult.scrollerTop` is carried as specified but nothing consumes it
  yet: the content script re-measures the live `scrollerTop` at inspection time,
  which is the correct value to hit-test a page that may have changed.
- `ElementLike.attributes` (role, data-testid) is populated but no path rule
  reads it yet; it is the hook for a testid-anchored path in Task 17/18.
- A context is only as fresh as the last commit; a page that re-renders on its
  own is not re-inspected until the next annotation edit.
