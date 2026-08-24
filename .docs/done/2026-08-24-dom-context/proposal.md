# Proposal: Per-annotation DOM context

## Why

A prompt line today says _where_ an annotation is (`at (234, 210) size 100x70 px
[30%, 9% of page]`, Task 14) but not _what_ it is on. An agent still has to open
the image, find the pin and guess which element the box frames. The tab that was
captured is usually still open in the same browser, so the element under each
annotation can simply be read back from the live page.

## Goal

Each annotation carries an `ElementContext` describing the element it points at,
and each prompt line names that element: `-> #app > section.hero > button.cta`,
plus ` in <PricingCard > Page>` when the page is React.

## Scope

- `src/types/annotation.ts` - `ElementContext` (cssPath, tag, id, classes, role,
  testId, text, component chain, page-px rect) and an optional `context` on
  `AnnotationBase`.
- `src/lib/dom-context.ts` (new, pure) - `cssPath(ElementLike)` over a
  structural interface, so it unit tests in plain Node with no DOM types.
- `src/content.ts` - `SB_INSPECT_POINTS { points }` -> `{ contexts }`: scroll the
  capture scroller quietly to each stitched-page point, `elementsFromPoint`,
  describe the first element that is not shotback's own overlay/style, restore
  the original scroll in a `finally`.
- `src/lib/capture.ts` - `CaptureResult` gains `scale` (stitched image px per
  page CSS px) and `scrollerTop`; new best-effort `inspectPoints(tabId, points)`
  and `readFiberComponents`, injected into the page's own JavaScript world to
  read the React fiber (see "React fibers" below).
- `src/lib/numbering.ts` - `inspectAnchor`: the point an annotation means (box
  centre, arrow tail, text start).
- `src/editor/*` - `EditorState.getAnnotations()`; `main.tsx` refreshes every
  annotation's context on each canvas commit, best effort.
- `src/lib/feedback.ts` - each area-comment line appends the context summary.

## Out of Scope

- Verbosity levels or a fuller context block in the prompt (Task 17/18): this
  change adds exactly the selector and the component chain to the existing line.
- A separate sidecar file or any new export.
- Persisting or migrating contexts on saved shares: `context` rides along as an
  optional annotation field, no `schemaVersion` bump.
- Re-inspecting when the page changes on its own (contexts refresh on the next
  annotation commit).

## React fibers (design change during implementation)

The brief had `content.ts` read the fiber with
`Object.keys(el).find((k) => k.startsWith("__reactFiber$"))`. That cannot work:
a content script runs in an isolated world, which does not see expando
properties the page set on a DOM node. Probed against real Chromium with the
built extension (`chrome.scripting.executeScript` into each world, same tab):

```text
ISOLATED: {"bodyKeys":[],"ctaKeys":[],"probe":"undefined"}
MAIN:     {"bodyKeys":["__probe"],"ctaKeys":["__reactFiber$abc"],"probe":"42"}
```

So the component chain is read in a second pass: the content script marks the
element it hit with `data-shotback-hit="<index>"` (attributes _are_ shared
between worlds), and `capture.ts` injects `readFiberComponents` with
`world: "MAIN"` to walk the fiber and clear the mark. The fiber walk therefore
lives in that injected function - it must reference nothing outside itself,
because Chrome serializes its source - and `reactComponentChain` is not part of
`dom-context.ts`.

## History interaction (decision)

Context updates go through `setAnnotations` **only**, never `commitAnnotations`.
A context is derived data, so making it a history entry would double every undo
(undo the context, then undo the edit). The accepted trade-off: a snapshot taken
before an inspection resolves keeps the older context until the next commit.
