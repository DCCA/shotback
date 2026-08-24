# Tasks: JPEG export and size readout

- [x] **1. Unit tests RED**
  - [x] 1.1 `tests/annotate.test.ts` - a `toDataURL` stub that records its own
        args, a PNG default, JPEG at quality 0.9 by default, an explicit
        quality, and the white-fill call order (colour set, then filled, then
        the base image drawn) for JPEG only.
  - [x] 1.2 `tests/sidecar.test.ts` - `imageFormat` carried when given, omitted
        (not just falsy) when not.
  - [x] 1.3 `tests/prefs.test.ts` - `exportFormat` round-trips and merges onto
        an existing `promptVerbosity` pref.
  - [x] 1.4 RED: `4 failed | 44 passed (48)` - the three `annotate.ts` format
        tests and the sidecar `imageFormat` test.
- [x] **2. The pure logic; GREEN**
  - [x] 2.1 `src/lib/annotate.ts` - `format`/`quality` options,
        `DEFAULT_JPEG_QUALITY` (0.9), the white fill before the base image
        draw when `format === "jpeg"`, `dataUrlByteLength`.
  - [x] 2.2 `src/lib/prefs.ts` - `exportFormat?: "png" | "jpeg"`.
  - [x] 2.3 `src/lib/sidecar.ts` - optional `imageFormat`, spread-if-present
        like `environment`/`diagnostics`/`redactions`.
  - [x] 2.4 GREEN: `48 passed (48)`.
- [x] **3. Editor wiring**
  - [x] 3.1 `use-editor-state.ts` - `exportFormat`/`setExportFormat` (prefs
        load/persist, race guard, same shape as `promptVerbosity`),
        `lastExportSize`/`setLastExportSize`.
  - [x] 3.2 `use-exports.ts` - `download`, `prepareExternalLlmPackage` and
        `copyForClaudeCode` pass `format: state.exportFormat` and swap the
        filename extension (`extFor`); `copyImage` and `createShareUrl` never
        pass `format`, each with a comment saying why; every export sets
        `lastExportSize` from `dataUrlByteLength(merged)`; the sidecar gets
        `imageFormat: state.exportFormat`.
  - [x] 3.3 `sidebar.tsx` - "Export format" Select next to Prompt detail, the
        Download button's label following the format, the "Last export: N KB"
        line.
  - [x] 3.4 `main.tsx` - `setLastExportSize(null)` alongside the rest of a new
        capture's reset.
  - [x] 3.5 `npm run typecheck` / `npm run lint` clean.
- [x] **4. e2e**
  - [x] 4.1 Extended the `inner` branch: switch to JPEG, assert the Download
        button's label, Copy for Claude Code, the downloaded image's MIME
        (`image/jpeg`), the prompt's image line, the sidecar's `imageFormat`
        and `imagePath` extension, the "Last export" line, and a real decode
        of the downloaded bytes back through an `<img>` (`naturalWidth > 0`) -
        then reset to PNG for the rest of the suite.
  - [x] 4.2 RED: `git stash push` on the seven production files (tests kept),
        rebuilt `dist/`, ran `-g inner` - timed out waiting for the
        `Export format` combobox, which does not exist on that tree.
  - [x] 4.3 `git stash pop`, rebuilt, reran - GREEN, after fixing one test bug
        of my own (`downloadedFile` returns Playwright's GUID artifact path,
        not the extension's own filename, so the `.jpg` assertion has to run
        against the sidecar's `imagePath` instead - the file's own comment
        already says this, and now the new assertion actually follows it).
  - [x] 4.4 Full suite: `npx playwright test` - `7 passed`.
- [x] **5. Gate + docs**
  - [x] 5.1 `npm run check` - typecheck, lint, 206 unit tests, build: green.
  - [x] 5.2 `npm run format:check` - green.
  - [x] 5.3 `npm run test:e2e` - `7 passed`.
  - [x] 5.4 Colour-literal grep and em-dash grep on added lines - zero hits.
  - [x] 5.5 `CLAUDE.md` (a JPEG-export paragraph after the Prompt-detail one),
        `README.md` (a Features bullet).
- [x] **6. Commit and PR**
