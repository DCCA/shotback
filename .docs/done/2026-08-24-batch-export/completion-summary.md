# Completion Summary: Batch export of saved shares

## What changed

- `src/lib/sidecar.ts` - `BatchSidecar { version: 1; captures: Sidecar[] }` and
  `buildBatchSidecar(captures)`. The captures are already whole sidecars, so the
  function only stamps the version; it stays pure and needs no new logic.
- `src/lib/feedback.ts` - `buildBatchPrompt(entries, sidecarPath)`. The JSON
  path is line two, before any capture; each capture then gets one numbered
  line, `<pageUrl> - <n> annotation(s) - <imagePath>`, with `(unknown)` for a
  share saved without a page URL. Per-capture detail is deliberately absent:
  it is in the JSON, and a ten-capture prompt would otherwise be unreadable.
- `src/editor/use-exports.ts`
  - `copyBatchForClaudeCode(ids)` - one `shotback/batch-<ts>/` folder holding
    `cap-<i>.png` per share plus one `batch.json`, then the prompt on the
    clipboard. The loop is sequential and throws on the first share that cannot
    be read or written, so no prompt is copied for a partial batch; the error
    status names the reason and the folder that may hold leftovers.
  - Each capture's `Sidecar` comes from the same `buildSidecar` used by the
    single-capture handoff, fed from the **stored share**: its annotations,
    environment, general feedback and page URL, `capturedAt` from
    `environment.capturedAt` or the share's `createdAt`, `imagePath` the
    batch-relative `cap-<i>.png`, `imageFormat: "png"` (a share always is), and
    no `diagnostics` (shares never persisted them).
  - `decodeImageSize(dataUrl)` - the only reason a stored image is decoded at
    all. Shares predate crop and carry no dimensions, and `normalizedRect`
    needs the real ones. Nothing re-renders the image: it is already annotated
    and is uploaded byte for byte.
  - `EditorExports` grows `copyBatchForClaudeCode`.
- `src/editor/saved-shares.tsx` - a native `<input type="checkbox">` per row
  (`accent-primary`, so no new component and no colour literal), a
  `Set<string>` of ticked ids, and a full-width
  **"Copy batch for Claude Code (N)"** button under the list once at least one
  is ticked. The ids handed to the callback are derived by filtering the live
  `shares` list, so a share deleted while ticked cannot linger in a batch; the
  grid gains a leading `auto` column. The button takes the same `isBusy` guard
  every sidebar action already uses, so a second click cannot start a second
  batch folder while one is being written.
- `src/editor/main.tsx` - `onBatchExport` wired to `copyBatchForClaudeCode`.
- `README.md` - a Features bullet and a "Several captures at once" section
  under Use with Claude Code, with the real folder layout and prompt.
- `CLAUDE.md` - a batch-handoff paragraph, mentions on the `feedback.ts` and
  `sidecar.ts` helper bullets, and the e2e list.
- `skills/shotback/SKILL.md` - a "A batch of captures" section and a
  `batch.json` trigger in the description.

## Design notes

- **The prompt is an index, the JSON is the payload.** Repeating each capture's
  comments in the prompt would duplicate what `batch.json` already holds and
  scale badly. The prompt carries just enough to decide which capture to look at.
- **`imagePath` is batch-relative** (`cap-0.png`, not `shotback/batch-.../cap-0.png`),
  so the folder can be moved or copied without breaking the links. The absolute
  paths a WSL session needs are in the prompt, translated by `toClaudePath`.
- **All-or-nothing, unlike the single-capture sidecar.** There, a missing
  sidecar costs the prompt one line and the status says so. Here a missing PNG
  would mean a prompt pointing at a file that is not there, which is worse than
  no prompt; and the `batch.json` is the lead line, so it is essential too.
  Files already written are not deleted - `chrome.downloads` has no clean way to
  do that, and quietly removing a user's downloads is worse than saying which
  folder to look in.
- **Native checkbox, no new component.** `src/components/ui/` has no checkbox,
  and a WAI-ARIA rebuild was justified for `Select` only because the native
  option popup is unstylable. A checkbox is not: `accent-primary` tints it from
  the same token everything else uses, in both themes.

## RED/GREEN evidence

### Group 1: pure builders (`tests/sidecar.test.ts`, `tests/feedback.test.ts`)

RED (`npx vitest run tests/sidecar.test.ts tests/feedback.test.ts`):

```text
FAIL  tests/sidecar.test.ts > buildBatchSidecar > has no captures for an empty batch
TypeError: buildBatchSidecar is not a function

 Test Files  2 failed (2)
      Tests  7 failed | 57 passed (64)
```

GREEN, after `buildBatchSidecar` and `buildBatchPrompt`:

```text
Test Files  2 passed (2)
     Tests  64 passed (64)
```

### Group 2: e2e (`tests/e2e/extension.spec.ts`, `inner` branch)

RED - `git stash push -- src/editor/saved-shares.tsx src/editor/main.tsx src/editor/use-exports.ts`
(tests untouched), `npm run build`, `npx playwright test -g inner`:

```text
Expect "toHaveCount" with timeout 10000ms
  - waiting for getByRole('checkbox')
    24 x locator resolved to 0 elements
> 736 |       await expect(checkboxes).toHaveCount(2);
1 failed
```

`git stash pop`, `npm run build`, reran - GREEN first time, then the full suite:

```text
Running 7 tests using 1 worker
  ✓ extension loads with no popup and the downloads permission
  ✓ capture notice shows, hides for the frame, and is removed
  ✓ full-page capture stitches every viewport in order (smooth)
  ✓ full-page capture stitches every viewport in order (inner) (7.0s)
  ✓ a redaction is pixelated in the export and in the saved share
  ✓ editor page renders the capture UI
  ✓ dark theme keeps every control legible
7 passed (13.1s)
```

Sample output from that run (paths are Playwright's GUID artifacts, because it
intercepts every download - in a real profile they are the batch folder):

```text
Review these 2 screenshots together.
Machine-readable annotations for every capture (selectors, rects, environment): /.../ceb3188e-...

1. http://127.0.0.1:34807/inner - 1 annotation - /.../b52b46c4-...
2. http://127.0.0.1:34807/inner - 0 annotations - /.../a7aff2d0-...
```

```jsonc
{
  "version": 1,
  "captures": [
    {
      "version": 1,
      "capturedAt": "2026-08-24T20:14:12.305Z",
      "environment": { "colorScheme": "light", "scroller": "element", ... },
      "pageUrl": "http://127.0.0.1:34807/inner",
      "generalFeedback": "",
      "annotations": [
        {
          "n": 1,
          "tool": "box",
          "comment": "(no comment)",
          "rect": { "x": 40.5, "y": 30, "width": 100, "height": 65 },
          "normalizedRect": { "x": 0.166, "y": 0.1003, "width": 0.4098, "height": 0.2174 },
          "context": {
            "cssPath": "#app > section.hero > button.cta",
            "component": ["PricingCard", "Page"],
            "text": "Buy now"
          }
        }
      ],
      "imageFormat": "png",
      "imagePath": "cap-0.png"
    },
    { "version": 1, "annotations": [], "imageFormat": "png", "imagePath": "cap-1.png", ... }
  ]
}
```

The first capture is the cropped share (`rect.x` 40.5, measured from the crop,
and the context survives the crop); the second is the earlier share, saved
before any annotation was drawn.

### Group 3: visual

Screenshots of the saved-shares panel with both shares ticked, light and dark
(temporary `locator.screenshot` in the e2e, removed before commit): the checkbox
sits on the title row, tinted with the primary token, and the full-width batch
button reads correctly in both themes.

## Gate output

```text
npm run check
  typecheck: clean
  lint: clean
  test: 15 files, 213 tests passed
  build: succeeded

npm run format:check
  All matched files use Prettier code style!

npm run test:e2e
  7 passed (13.1s)

git diff --cached -U0 | grep '^+' | grep -cP '\x{2014}'
  0

git diff --cached -U0 -- src | grep '^+' | grep -cE "(text|bg|border|ring|from|to|via|fill|stroke)-(slate|emerald|red|white)\b"
  0
```

## Self-review

- **Completeness**: checkbox per share, button gated on at least one tick, one
  PNG per share and exactly one `batch.json` in one folder, prompt led by the
  JSON path, and abort-on-failure verified by reading the code path (throw
  before the clipboard write) and by the status wording naming the folder.
- **Quality**: both builders are pure and live in `src/lib` with no `chrome.*`;
  the batch folder is stamped once (`batch-<ts>`) and every path in the run is
  derived from it; the per-capture sidecar is the existing `buildSidecar`, not a
  parallel implementation.
- **Discipline**: a stored share is exported exactly as saved - no
  re-annotation, no re-render, no re-numbering. The only decode is for the
  pixel dimensions `normalizedRect` needs. `localStore.ts` was not touched.
- **Testing**: RED captured for both groups before the code existed (the e2e
  RED via a real `git stash` of the three editor files against the new test);
  GREEN re-verified after each; the full e2e suite and `npm run check` green as
  the final gate.

## Deviations and follow-ups

- The e2e asserts the two PNGs by checking that both paths the prompt names
  exist on disk, rather than by polling `chrome.downloads` for a count. Playwright
  renames every intercepted download to a GUID artifact, so the batch folder
  name is not observable on disk; the folder-relative naming is asserted through
  `batch.json`'s own `imagePath` values instead, exactly as the single-capture
  test already does for `cap-<ts>.png`.
- No select-all/none affordance and no batch cloud-LLM prompt. Neither was
  asked for, and both are cheap to add later if a real batch turns out to be
  more than a handful of shares.
