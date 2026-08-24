# Tasks: JSON sidecar and a shotback skill

- [x] **1. The pure builder (RED -> GREEN)**
  - [x] 1.1 `tests/sidecar.test.ts`: version/metadata, numbering by `createdAt`,
        `noteText` comments, box rect + `normalizedRect`, 4dp rounding, arrow
        bounding box, text bounds, the zero-sized-image guard, context
        passthrough, omitted optional keys, environment/diagnostics passthrough.
  - [x] 1.2 RED: `Cannot find module '../src/lib/sidecar'`.
  - [x] 1.3 `src/lib/sidecar.ts`; GREEN.
  - [x] 1.4 `annotationBounds` moved `src/editor/annotation-geometry.ts` ->
        `src/lib/numbering.ts` (with its tests) so `src/lib` never imports
        `src/editor`. Importers updated: `annotation-canvas.tsx`.
- [x] **2. The prompt line (RED -> GREEN)**
  - [x] 2.1 `tests/feedback.test.ts`: the sidecar line is the second line; no
        line at all when no sidecar was written.
  - [x] 2.2 RED: `1 failed | 28 passed`, the second line is `""`.
  - [x] 2.3 `buildClaudeCodePrompt` gains the optional `sidecarPath`; GREEN.
- [x] **3. The chrome boundary**
  - [x] 3.1 `downloadBlob(blob, relativeName)` in `use-exports.ts` - saves and
        resolves an absolute path, revoking the object URL in a `finally`. Both
        downloads go through it (the PNG path lost its hand-rolled copy).
  - [x] 3.2 `saveSidecar(state, stamp, imagePath)` - same `<ts>` as the PNG,
        `JSON.stringify(..., null, 2)`, `conflictAction: "uniquify"`, returns
        `""` on any failure.
  - [x] 3.3 Honest status: success only when both paths resolved, otherwise
        `Prompt copied, but <what went wrong>.`
- [x] **4. e2e**
  - [x] 4.1 `inner` test: click **Copy for Claude Code**, assert the two prompt
        lines, poll `chrome.downloads.search` through the service worker, read
        the file with `fs.readFile`, parse and assert.
  - [x] 4.2 RED against pre-change `src/` (`git stash push -- src`, `dist/`
        rebuilt): the prompt has no machine-readable line.
  - [x] 4.3 GREEN, 6/6.
- [x] **5. The skill**
  - [x] 5.1 `skills/shotback/SKILL.md` - 59 lines, YAML frontmatter, a sample
        sidecar and the five rules for using it.
- [x] **6. Gate + docs**
  - [x] 6.1 `npm run check` - typecheck, lint, 137 unit tests, build: green.
  - [x] 6.2 `npm run format:check` - green.
  - [x] 6.3 `npm run test:e2e` - 6/6.
  - [x] 6.4 Colour-literal grep and em-dash grep on added lines - zero hits.
  - [x] 6.5 `CLAUDE.md` (outputs paragraph, `sidecar.ts` + `numbering.ts` +
        `feedback.ts` helper entries, the stale `annotationBounds` path, the
        e2e description), `README.md` (feature bullet, usage bullet, a
        "Use with Claude Code" section), `SECURITY.md` (`downloads` rationale,
        data handling).
- [x] **7. Commit and PR**
