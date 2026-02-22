# TODO: Monday, February 23, 2026

## 1. Security and Permissions (Highest Priority)
- [ ] Reduce extension scope in `public/manifest.json`:
  - limit `host_permissions` from `"<all_urls>"` to explicit domains or runtime-justified patterns
  - review whether static `content_scripts` on all URLs can be replaced with on-demand injection
- [ ] Document permission rationale in `SECURITY.md` and `README.md`.

## 2. Dependency Security Upgrades
- [ ] Address `npm audit` findings (currently 5 moderate):
  - evaluate upgrade path for `vite` and `vitest` major versions
  - run full regression checks after upgrades (`npm run test`, `npm run build`, manual extension smoke test)
- [ ] Add a follow-up note in `.docs/done` with final vulnerability status.

## 3. UI Refinement Follow-ups
- [ ] Run manual QA pass across popup/editor/viewer after the Tailwind refresh:
  - popup sizing on different Chrome zoom levels
  - editor timeline readability and button hierarchy
  - viewer metadata readability on narrow widths
- [ ] Tweak spacing/typography only where visual regressions are observed.

## 4. Test Coverage Improvements
- [ ] Add integration-style tests for:
  - annotation timeline item selection/delete flow
  - cloud LLM export action path
  - local share retrieval path in viewer

## 5. Process Cleanup
- [ ] Decide whether `.docs/doing/firehose-compliance-alignment/` should be archived to `.docs/done/`.
- [ ] Keep `.docs/todo/next-improvements.md` in sync with decisions made tomorrow.
