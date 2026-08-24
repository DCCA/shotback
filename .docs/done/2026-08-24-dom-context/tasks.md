# Tasks: Per-annotation DOM context

- [x] **1. Unit tests RED**
  - [x] 1.1 `tests/dom-context.test.ts`: `cssPath` (id anchors and stops the
        walk, first two classes per segment, `nth-of-type` only with same-tag
        siblings, five levels max). The fiber-walk cases moved to
        `readFiberComponents` in `tests/capture.test.ts` once the walk had to
        run in the page's own world.
  - [x] 1.2 `tests/feedback.test.ts`: both builders append
        ` -> <cssPath>` and ` in <A > B>`; full-string `toBe` for the external
        builder, with and without an image size.
  - [x] 1.3 `tests/numbering.test.ts`: `inspectAnchor` (box centre, arrow tail).
  - [x] 1.4 RED: `Cannot find module '../src/lib/dom-context'` plus 3 failing
        feedback assertions (the context suffix missing from every line).
- [x] **2. Implement the pure helpers, the type and the prompt; GREEN**
  - [x] 2.1 `src/lib/dom-context.ts` - `ElementLike` + `cssPath`. No DOM types.
  - [x] 2.2 `src/types/annotation.ts` - `ElementContext` + optional `context`.
  - [x] 2.3 `src/lib/feedback.ts` - `describeContext` appended per line.
  - [x] 2.4 `src/lib/numbering.ts` - `inspectAnchor`.
  - [x] 2.5 GREEN: the unit suite green at every step (114 tests at the end).
- [x] **3. The chrome boundary**
  - [x] 3.1 `src/content.ts` - `SB_INSPECT_POINTS`: re-resolve the scroller,
        centre each point in the viewport, `elementsFromPoint`, skip
        `[data-shotback-overlay]` and `STYLE`, describe, restore scroll in a
        `finally`, and refuse to run while a capture owns the scroll position.
  - [x] 3.2 `src/lib/capture.ts` - `CaptureResult.scale`/`.scrollerTop`, the
        best-effort `inspectPoints(tabId, points)` and `readFiberComponents`
        injected with `world: "MAIN"` (a content script cannot see the page's
        `__reactFiber$...` expando - probed against real Chromium, see
        `proposal.md`), merged in by point index.
- [x] **4. Editor wiring**
  - [x] 4.1 `EditorState.getAnnotations()` (the ref, not the render value).
  - [x] 4.2 `main.tsx` keeps the capture scale in a ref, and `refreshContexts`
        runs on every canvas commit: one round trip with all the points, merged
        back by annotation id through `setAnnotations` (no history entry).
- [x] **5. e2e**
  - [x] 5.1 The `inner` fixture gains an absolutely positioned
        `#app > section.hero > button.cta` over a colour block (page height and
        the sampled columns untouched), with a React-shaped fiber hung off it
        by a page script.
  - [x] 5.2 RED against pre-change `src/` (`git stash push -- src/`, rebuilt
        `dist/`): three annotations are listed, none of them names an element.
  - [x] 5.3 GREEN: the copied prompt contains
        `-> #app > section.hero > button.cta in <PricingCard > Page>`, and still
        contains `button.cta` after the box is moved (the context survives a
        move commit). Flipping the injection to `world: "ISOLATED"` drops the
        component chain and fails the assertion - the RED for that half.
- [x] **6. Gate + docs**
  - [x] 6.1 `npm run check` - typecheck, lint, 114 unit tests, build: green.
  - [x] 6.2 `npm run format:check` - green.
  - [x] 6.3 `npm run test:e2e` - 6/6.
  - [x] 6.4 Colour-literal grep and em-dash grep - zero hits.
  - [x] 6.5 CLAUDE.md (content.ts message list, `dom-context.ts` and
        `inspectAnchor`/`inspectPoints` helper entries, a "Per-annotation DOM
        context" section) and README (outputs paragraph).
- [x] **7. Commit and PR**
