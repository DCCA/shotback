# Tasks: Batch export of saved shares

- [x] **1. Unit tests RED**
  - [x] 1.1 `tests/sidecar.test.ts` - `buildBatchSidecar` stamps `version: 1`,
        carries the captures untouched and keeps each one's batch-relative
        `imagePath`; an empty batch is `{ version: 1, captures: [] }`.
  - [x] 1.2 `tests/feedback.test.ts` - `buildBatchPrompt` leads with the JSON
        path before any capture line, numbers one line per capture
        (page, count, image path), carries no per-annotation detail, and says
        "1 annotation" / "(unknown)" in the singular/empty cases.
  - [x] 1.3 RED: `7 failed | 57 passed (64)` -
        `buildBatchSidecar is not a function`,
        `buildBatchPrompt is not a function`.
- [x] **2. The pure builders; GREEN**
  - [x] 2.1 `src/lib/sidecar.ts` - `BatchSidecar` + `buildBatchSidecar`.
  - [x] 2.2 `src/lib/feedback.ts` - `buildBatchPrompt`.
  - [x] 2.3 GREEN: `64 passed (64)`.
- [x] **3. Editor wiring**
  - [x] 3.1 `use-exports.ts` - `copyBatchForClaudeCode(ids)`: sequential
        per-share `getLocalShare` -> `downloadBlob` to
        `shotback/batch-<ts>/cap-<i>.png` -> `buildSidecar` from the stored
        share (`decodeImageSize` for `normalizedRect`), then one
        `batch.json` and the prompt; any failure throws before the clipboard
        write and the status names the folder.
  - [x] 3.2 `saved-shares.tsx` - a native checkbox per share (`accent-primary`,
        no new component), selection state derived against the live list, and
        the "Copy batch for Claude Code (N)" button under the list.
  - [x] 3.3 `main.tsx` - `onBatchExport` wired to the new export.
  - [x] 3.4 `npm run typecheck` / `npm run lint` clean.
- [x] **4. e2e**
  - [x] 4.1 Extended the `inner` branch after the crop section (two shares are
        already saved by then): Show, tick both, click the batch button, then
        assert the status, the prompt's first two lines, two numbered lines
        whose PNG paths both exist on disk, and the parsed `batch.json`
        (`version`, two captures, `cap-0.png`/`cap-1.png`, page URLs, and the
        prompt's count matching the sidecar's own).
  - [x] 4.2 RED: `git stash push` on the three editor files (tests kept), rebuilt
        `dist/`, ran `-g inner` - `getByRole('checkbox')` resolved to 0 elements
        for 10s.
  - [x] 4.3 `git stash pop`, rebuilt, reran - GREEN first time.
  - [x] 4.4 Full suite: `npm run test:e2e` - `7 passed (13.1s)`.
- [x] **5. Visual check**
  - [x] 5.1 Screenshot of the saved-shares panel with two shares ticked, light
        and dark (temporary `page.screenshot` in the e2e, removed afterward):
        checkbox aligned with the title row, primary-token accent, button full
        width under the list, legible in both themes.
- [x] **6. Gate + docs**
  - [x] 6.1 `npm run check` green.
  - [x] 6.2 `npm run format:check` green.
  - [x] 6.3 `npm run test:e2e` green.
  - [x] 6.4 Em-dash and colour-literal greps on added lines - zero hits.
  - [x] 6.5 `README.md` (Features bullet + a "Several captures at once" section),
        `CLAUDE.md` (batch-handoff paragraph, helper mentions, e2e list),
        `skills/shotback/SKILL.md` (a batch section + description trigger).
- [x] **7. Commit and PR**
