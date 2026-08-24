# Tasks: Stop the Sidebar Scrolling Sideways

- [x] **1. Add the failing assertion**
  - [x] 1.1 In the `full-page capture stitches every viewport in order (inner)` e2e test, after the image checks: click `Copy Local Share Link`, wait for `a[href*='viewer.html']`.
  - [x] 1.2 Widen the editor page past the `lg` breakpoint (`setViewportSize({width: 1280, height: 900})`) first - the real capture window used by the test harness defaults under 1024px wide, where the sidebar sits in the single-column (full-width) layout and never overflows regardless of the bug.
  - [x] 1.3 Assert `card.scrollWidth - card.clientWidth === 0` on `main > div` (the sidebar Card).
- [x] **2. Run it to verify it fails**
  - [x] 2.1 RED: `overflow` was `67` (scrollWidth 410 vs clientWidth 343).
- [x] **3. Fix**
  - [x] 3.1 Add `break-all` to the share-link anchor's className in `src/editor/main.tsx` (the anchor lives there post module-split, not in `sidebar.tsx` - see `proposal.md`).
  - [x] 3.2 `min-w-0` on the Card content was not needed; confirmed by re-running GREEN without it.
- [x] **4. Run e2e and gate**
  - [x] 4.1 `npm run test:e2e` - 6/6 green.
  - [x] 4.2 `npm run check` - green.
  - [x] 4.3 `npm run format:check` - green.
  - [x] 4.4 `grep -rnE "(text|bg|border|ring|from|to|via|fill|stroke)-(slate|emerald|red|white)\b" src/` - zero hits.
- [x] **5. Commit, push, PR**
