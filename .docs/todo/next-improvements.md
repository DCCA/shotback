# Backlog: Next Improvements

## Open

- Improve comment badge placement to avoid overlap for long comments.
- Add import/export JSON for annotations and feedback.
- Add optional cloud-share mode behind explicit user opt-in.
- Add integration-style tests for the editor (annotation edit, timeline delete,
  single-editor mode) — current coverage is unit-level on pure helpers.
- Show a total local-storage usage indicator (per-share size is shown today).
- Evaluate moving the content script fully to on-demand injection (drop the
  static `<all_urls>` registration). See `SECURITY.md` → Known follow-up.
- **Protect `main`** (repo-settings action, needs admin): require the `validate`
  status check to pass and require a PR before merging, so changes can't land on
  `main` while CI is red. This gate is what would have blocked the unformatted
  UI PRs (#3–#5) that broke `main`. Configure under **Settings → Branches →
  Branch protection rules** (or a Ruleset) for `main`.

## Done (see `.docs/done/2026-06-20-world-class-hardening/`)

- Keyboard shortcuts for select/delete in the editor (Esc / Delete).
- Local-share management UI (list / open / delete).
