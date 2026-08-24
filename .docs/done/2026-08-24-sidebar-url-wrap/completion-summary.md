# Completion Summary: Stop the Sidebar Scrolling Sideways

## What changed

**`src/editor/main.tsx`** - the share-link anchor's className gains
`break-all` so the unbroken `chrome-extension://<id>/viewer.html?share=<id>`
string can break mid-word instead of forcing the sidebar Card to scroll
horizontally.

**`tests/e2e/extension.spec.ts`** - the `inner` variant of
`full-page capture stitches every viewport in order` now also generates a
share link and asserts zero horizontal overflow on the sidebar Card
(`main > div`).

## File-location deviation from the brief

The brief names `src/editor/sidebar.tsx` as the file to modify. Since the
Task 1 module split, the share-link anchor's JSX lives in
`src/editor/main.tsx` and is passed into `Sidebar` as `children` -
`sidebar.tsx` only owns the Card shell and the fixed controls (capture
button, tool/interaction selects, feedback textarea, action buttons). The
fix was applied where the anchor actually is. `sidebar.tsx` is untouched.

## Test-environment note

The brief's assertion is correct, but making it fail for the right reason
needed one addition not in the brief: the Playwright harness launches with
`viewport: null` (a deliberate choice - the capture math needs the real
window size), and the actual window this produces is narrower than
Tailwind's `lg` breakpoint (1024px). Below that breakpoint the layout is
single-column and the sidebar takes the full window width, so the URL never
overflows regardless of the bug - the assertion passed against a build that
did not yet have `break-all`. Added
`await editor.setViewportSize({ width: 1280, height: 900 })` on the
**editor** tab only, right before the click, so the sidebar sits in its
fixed 360px column. This does not touch the capture page/tab, so it cannot
affect the `captureVisibleTab` math the rest of the test verifies.

## RED evidence

```
$ npm run test:e2e -- -g "inner"
...
PAGE: DEBUG 410 343 chrome-extension://.../viewer.html?share=...
  ✘  full-page capture stitches every viewport in order (inner)
    Error: expect(received).toBe(expected) // Object.is equality
    Expected: 0
    Received: 67
```

(debug `console.log` of scrollWidth/clientWidth was added temporarily to
confirm the failure was real overflow and not a selector miss, then
removed before the fix)

## GREEN evidence

```
$ npm run test:e2e -- -g "inner"
  ✓  full-page capture stitches every viewport in order (inner) (2.6s)
  1 passed (3.2s)

$ npm run test:e2e
  ✓ 1 extension loads with no popup and the downloads permission
  ✓ 2 capture notice shows, hides for the frame, and is removed
  ✓ 3 full-page capture stitches every viewport in order (smooth)
  ✓ 4 full-page capture stitches every viewport in order (inner)
  ✓ 5 editor page renders the capture UI
  ✓ 6 dark theme keeps every control legible
  6 passed (5.3s)
```

## Gate

- `npm run check` (typecheck, lint, 59 unit tests, build) - green.
- `npm run format:check` - green.
- `npm run test:e2e` - 6/6 green.
- `grep -rnE "(text|bg|border|ring|from|to|via|fill|stroke)-(slate|emerald|red|white)\b" src/` - zero hits (unchanged, no new literals introduced).

## min-w-0

Not needed. `break-all` reduces the anchor's min-content width to a single
character, and the sidebar's fixed 360px grid column already accommodates
that - confirmed by running the GREEN test without adding `min-w-0`
anywhere.

## Risks / follow-ups

None. This is a one-line CSS fix plus a regression test; no behavior change
outside the sidebar's rendering of an already-generated share URL.
