# Proposal: Final review wave - boundary clamps, doc truth, gate hygiene

## Why

The whole-branch review of the fix-it-all plan turned up sixteen small,
independent findings: none of them is a feature, none of them is worth its own
PR, and all of them are things a reader or an agent would otherwise trip over.
They ship as one wave.

## Findings

### Code

1. `buildEnvironment` (`src/lib/capture.ts`) carried `metrics.title` and
   `metrics.pageUrl` straight into a prompt. Both are page-controlled text, and
   every other page-controlled value on that path is already clamped
   (`diagnosticText`, `cssPath`, component names). A 10k-character title is a
   prompt-flooding vector, and `undefined` is a real runtime shape.
2. `eslint.config.js` ignored `dist/**` only, so a build inside a nested agent
   worktree (`.claude/worktrees/*/dist/`) failed `npm run lint`.
3. The device pixel ratio rendered raw: Chrome reports `1.100000023841858` at
   110% zoom, and both the prompt's Environment line and the viewer's metadata
   line showed it.
4. The arrow tool had no minimum-length guard, unlike box and redact: a stray
   click created a zero-length arrow with a comment editor attached.
5. The re-capture prompt line ("verify the fix against the previous state") gave
   an instruction the agent cannot act on - it has no access to the previous
   state. It should state the fact instead.
6. The single-capture sidecar's `imagePath` was `shotback/cap-<ts>.png`
   (relative to Downloads) while the batch sidecar's is `cap-<i>.png` (relative
   to the JSON). Two shapes, one field name.
7. `saveSidecar` collapsed "the download failed" and "the file was written but
   its absolute path never resolved" into one `""`, so the status said "could
   not be saved" about a file sitting in Downloads.
8. A stranded JSDoc block above `buildBatchPrompt` documented
   `buildClaudeCodePrompt`.
9. `main.tsx` filtered and sorted the annotations for the timeline, which
   `numberAnnotations` does again inside `CommentTimeline`.
10. The dark tokens are deliberately written twice (`.dark` and the
    `prefers-color-scheme` block) with nothing but a comment keeping them in
    sync.
11. The e2e `inner` branch is a ~370-line mega-block on the default timeout, and
    its three state resets (prompt verbosity, export format, batch selection)
    ran on the happy path only - a mid-test failure poisoned every later test
    through the persisted prefs.

### Docs

12. `README.md`: the Diagnostics bullet claimed both prompts carry the block (it
    is Detailed-only, as the Usage section already said); the privacy paragraph
    named one of five export paths and the permission list omitted `downloads`;
    Project Structure omitted `skills/`.
13. `CLAUDE.md`: the `main.tsx` bullet still described the pre-split ~1000-line
    file and "three output actions"; the permission list omitted `downloads`;
    one added line carried an em dash.
14. `PRIVACY.md`: "When data leaves your device" did not list the batch export.
15. `public/manifest.json`: the store description still framed the product as
    share links for LLM feedback, not an agent handoff.
16. The plan's Global Constraints stated "no `chrome.*` in `src/lib/*`" flatly,
    which `localStore.ts`, `prefs.ts` and `capture.ts` all contradict by design.

## Scope

One branch, one PR, sixteen small diffs. No behaviour beyond the listed items,
no restructuring.
