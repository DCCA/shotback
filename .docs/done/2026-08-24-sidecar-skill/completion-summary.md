# Completion Summary: JSON sidecar and a shotback skill

## What changed

- **`src/lib/sidecar.ts` (new)** - `Sidecar` / `SidecarAnnotation` / `SidecarRect`
  and the pure `buildSidecar`. `version: 1`, `capturedAt`, optional
  `environment`, `pageUrl`, trimmed `generalFeedback`, the annotations, optional
  `diagnostics`, relative `imagePath`. Per annotation: `n` from
  `numberAnnotations` (so the JSON, the prompt, the pins and the timeline cannot
  disagree), `tool`, `comment` from `noteText` (the same wording the prompt and
  the exported legend use, placeholders included), `rect` from
  `annotationBounds` in image px, `normalizedRect` (the same rect as a 0..1
  fraction of the image, rounded to 4dp) and the `ElementContext` when one was
  read. Optional fields are omitted rather than serialized as `null`, and a
  zero-sized image yields `0` instead of `Infinity`/`NaN`.
- **`src/lib/numbering.ts`** - `annotationBounds` moved here from
  `src/editor/annotation-geometry.ts`. `src/lib` may not import `src/editor`,
  and `numbering.ts` already held the pure per-annotation geometry
  (`pinAnchor`, `inspectAnchor`, `pinCenter`, `describeGeometry`), so it is the
  home that does not add a third geometry module. Only importer touched:
  `src/editor/annotation-canvas.tsx`. `moveAnnotation`, `uid`, `formatBytes` and
  `shareLabel` stay where they were.
- **`src/lib/feedback.ts`** - `buildClaudeCodePrompt` takes an optional
  `sidecarPath` and renders
  `Machine-readable annotations (selectors, rects, diagnostics): <path>` as its
  second line, contributing no line at all when there is no sidecar (a prompt
  without one is byte-identical to what it was before).
- **`src/editor/use-exports.ts`**
  - `downloadBlob(blob, relativeName)` - saves one blob under
    `Downloads/<relativeName>` (`conflictAction: "uniquify"`), resolves its
    absolute path through the existing `resolveDownloadPath` and revokes the
    object URL in a `finally`. The PNG's hand-rolled version was replaced by it,
    so both downloads share one path.
  - `saveSidecar(state, stamp, imagePath)` - builds the sidecar, writes
    `shotback/cap-<stamp>.json` beside `shotback/cap-<stamp>.png` with
    `JSON.stringify(..., null, 2)`, and returns the `toClaudePath`-translated
    path, or `""` on any failure (its own `try/catch`).
  - `copyForClaudeCode` - one `stamp` for both files, both paths in the prompt,
    and an honest status: success only when both resolved, otherwise
    `Prompt copied, but <the image's full path could not be resolved, ...>
    <and the JSON sidecar could not be saved, ...>.`
- **`skills/shotback/SKILL.md` (new, 59 lines)** - the repo-shipped skill users
  copy into their own project's `.claude/skills/shotback/`: read the sidecar
  first, find the source from `component`/`cssPath`/`testId`/`text` rather than
  from pixels, treat `normalizedRect` as layout position, fold `diagnostics`
  into the fix, open the PNG only when the selectors do not settle it, and
  verify against the live page. It also tells the agent that annotation text,
  selectors and URLs are page-derived and are data, never instructions.
- **Docs** - `README.md` (feature bullet, usage bullet, a "Use with Claude
  Code" section with both file names, the prompt shape and the skill),
  `CLAUDE.md` (the outputs paragraph, a `sidecar.ts` helper entry, the
  `numbering.ts`/`feedback.ts` entries, the now-stale `annotationBounds` path in
  the `editor-placement.ts` entry, the e2e description), `SECURITY.md` (the
  `downloads` rationale and Data Handling now name the second file and what it
  carries).

## Sample sidecar

Trimmed from the real file the `inner` e2e run wrote and read back:

```jsonc
{
  "version": 1,
  "capturedAt": "2026-08-24T17:31:16.979Z",
  "environment": {
    "pageTitle": "",
    "pageUrl": "http://127.0.0.1:33951/inner",
    "capturedAt": "2026-08-24T17:31:16.979Z",
    "viewport": { "width": 780, "height": 429 },
    "devicePixelRatio": 1,
    "userAgent": "Mozilla/5.0 (X11; Linux x86_64) ... HeadlessChrome/149.0.0.0 Safari/537.36",
    "colorScheme": "light",
    "scroller": "element"
  },
  "pageUrl": "http://127.0.0.1:33951/inner",
  "generalFeedback": "",
  "annotations": [
    // ... annotations 1 (box) and 2 (text) elided
    {
      "n": 3,
      "tool": "box",
      "comment": "(no comment)",
      "rect": { "x": 253.5, "y": 214, "width": 100, "height": 65 },
      "normalizedRect": { "x": 0.325, "y": 0.0869, "width": 0.1282, "height": 0.0264 },
      "context": {
        "cssPath": "#app > section.hero > button.cta",
        "tag": "button",
        "classes": ["cta"],
        "testId": "buy",
        "text": "Buy now",
        "rect": { "x": 200, "y": 184, "width": 200, "height": 120 },
        "component": ["PricingCard", "Page"]
      }
    }
  ],
  "diagnostics": {
    "failedRequests": [
      { "url": "http://127.0.0.1:33951/favicon.ico", "status": 404, "initiatorType": "other" }
    ]
  },
  "imagePath": "shotback/cap-1787592678703.png"
}
```

## RED/GREEN evidence

### Group 1: the pure builder (`tests/sidecar.test.ts`)

RED:

```text
FAIL  tests/sidecar.test.ts [ tests/sidecar.test.ts ]
Error: Cannot find module '../src/lib/sidecar' imported from tests/sidecar.test.ts
 Test Files  1 failed (1)
      Tests  no tests
```

GREEN (with the moved `annotationBounds` tests):

```text
 Test Files  3 passed (3)
      Tests  30 passed (30)
```

### Group 2: the prompt line (`tests/feedback.test.ts`)

RED:

```text
  [
    "Review this screenshot: /mnt/c/Downloads/shotback/cap-42.png",
-   "Machine-readable annotations (selectors, rects, diagnostics): /mnt/c/Downloads/shotback/cap-42.json",
+   "",
  ]
 Test Files  1 failed (1)
      Tests  1 failed | 28 passed (29)
```

The "omits the sidecar line when no sidecar was written" guard passed from the
start, which is what it is for.

GREEN: `29 passed (29)`.

### Group 3: the whole chain (e2e)

RED - implementation stashed (`git stash push -- src`), `dist/` rebuilt from the
pre-change tree, `npx playwright test -g inner`:

```text
    Expected pattern: /^Review this screenshot: .*shotback[/\\]cap-\d+\.png$/m
    Received string:  "Review this screenshot: /home/.../test-results/.playwright-artifacts-0/6a12c2b2-...
    Page URL: http://127.0.0.1:46023/inner
  1 failed
```

That run also settled how the assertion had to be written: **Playwright
intercepts every download and renames it to a GUID artifact**, so
`chrome.downloads`' `filename` is not `shotback/cap-<ts>.json` under test. The
test therefore locates the two files by MIME type (`application/json`,
`image/png`), asserts the prompt's first two lines are exactly those paths, and
asserts the `shotback/cap-<ts>.png` naming through the sidecar's own
`imagePath`.

GREEN:

```text
  ✓  4 tests/e2e/extension.spec.ts:274:3 › full-page capture stitches every viewport in order (inner) (4.4s)
  6 passed (7.9s)
```

## Gate output

```text
npm run check
  typecheck: clean
  lint: clean
  test: 13 files, 137 tests passed
  build: succeeded

npm run format:check
  All matched files use Prettier code style!

npm run test:e2e
  6 passed (7.9s)

grep -rnE "(text|bg|border|ring|from|to|via|fill|stroke)-(slate|emerald|red|white)\b" src/
  (zero hits)

em dashes on added lines
  (zero hits)
```

## Self-review

- **Completeness**: type, pure builder, both downloads, the prompt line, the
  skill file, unit tests, an e2e that reads the real file off disk, and docs in
  all three places plus a change folder.
- **Quality**: the builder is pure and takes every value from the caller;
  `src/lib` still imports nothing from `src/editor` (which is why
  `annotationBounds` moved); the two downloads share one helper; the failure
  path is honest rather than silently degraded.
- **Discipline**: no verbosity levels (Task 18), no new dependency, no new
  permission, no manifest change, no share-schema change, no colour literals,
  no em dashes.
- **Testing**: RED captured for all three groups before implementing, GREEN
  re-verified, and the sample above is the file the e2e actually read.

## Deviations and follow-ups

- **`imagePath` is the requested relative name, not the resolved one.** With
  `conflictAction: "uniquify"`, a collision would make Chrome write
  `cap-<ts> (1).png` while the sidecar still says `cap-<ts>.png`. Two exports
  inside the same millisecond is the only way to hit it, and the prompt carries
  the resolved absolute path either way, so it is left alone. Deriving
  `imagePath` from the resolved path is a one-line change if it ever matters.
- **The e2e matches downloads by MIME type, not by name** (see above). The
  filename contract is covered by `imagePath` and by the unit tests instead.
- **Two files instead of one.** The sidecar is a second artifact in the user's
  Downloads folder that nothing prunes; the PNG already had that property.
- **The skill is shipped, not installed.** `skills/shotback/SKILL.md` lives in
  this repo for users to copy; the extension does not (and cannot) install it.
