# Completion summary: PRD reframed around the agent handoff

## What changed

- **`.docs/PRD.md`** rewritten from scratch: Problem / Goal / Target user /
  Scope (shipped truth) / Non-goals / Success criteria / Constraints, 78
  lines, RFC-2119 keywords (`MUST`, `MUST NOT`) for every requirement, no em
  dashes. The old file described the February MVP ("generate a local share
  URL," box/arrow/text annotations, a single cloud-LLM fallback); the new one
  states the actual differentiator - an agent-consumable handoff (selectors,
  geometry, diagnostics, a JSON sidecar), not a screenshot - as the Goal, and
  lists the fourteen shipped capabilities from `main` (numbered pins,
  undo/redo, dark theme, fit-to-width, `Alt+Shift+S`, copy-to-clipboard,
  environment block, per-annotation DOM context, diagnostics, prompt
  verbosity, sidecar + skill) as Scope.
- **`.docs/done/2026-08-24-prd-rewrite/`** (this folder): `proposal.md` and
  this `completion-summary.md`. No `spec.md`/`design.md`/`tasks.md` - the PRD
  itself is the spec, per the task decision.

## Claims verified against code/docs, not just the review

- Verbosity gating for per-annotation geometry, selector/component, and the
  Diagnostics block: read `src/lib/feedback.ts` (`formatAreaComments`,
  `diagnosticsBlock`) directly rather than trusting the review's summary.
  Confirmed geometry and the CSS selector/component chain render only at
  `standard` and `detailed` (not `compact`), and the Diagnostics block only
  at `detailed` and only when non-empty - corrected an early draft that
  implied geometry was always present.
- Manifest permissions and the `Alt+Shift+S` shortcut: read
  `public/manifest.json` directly (`activeTab`, `tabs`, `scripting`,
  `storage`, `unlimitedStorage`, `downloads`, `<all_urls>` host permission,
  `commands._execute_action`).
- CORS-gated diagnostics and the console-error non-collection posture: cross-
  checked `SECURITY.md`'s "Deliberate non-collection: page console errors"
  section and the matching paragraph in `CLAUDE.md`.
- Sidecar/skill claim ("Copy for Claude Code" writes a PNG + JSON sidecar,
  ships `skills/shotback/SKILL.md`): cross-checked `README.md`'s "Use with
  Claude Code" section and `git log` (PR #34, `feat(handoff): JSON sidecar
  beside the PNG and a shotback skill`).
- Shipped-feature list overall: cross-checked against `git log --oneline`
  (14 merged PRs since the 2026-08-23 review landed) rather than only the
  review's own summary, since the review predates some of the later PRs
  (verbosity levels, sidecar+skill) it recommended.

## Gate output

```text
npm run format:check
  All matched files use Prettier code style!

npm run check
  typecheck: clean
  lint: clean
  test: 14 files, 152 tests passed
  build: succeeded
```

No source files changed, so the gate output is unchanged from `main` - this
run exists to confirm the docs-only change did not somehow regress it.

## Concerns / follow-ups

- **README tagline drift.** The README's tagline ("A Chrome extension for
  AI-assisted screenshot reviews: capture a full page, annotate specific
  areas, keep a timeline of comments, and prepare feedback for humans or
  LLMs") undersells the new PRD's Goal - it reads as a general annotation
  tool with an LLM option, not a product built around handing an agent a
  selector-and-geometry-bearing sidecar. Per the task decision, `README.md`
  was left untouched to avoid overlap with in-flight work; flagging it here
  instead of editing it. A follow-up should retitle the tagline around the
  agent handoff once README ownership is clear.
- **Non-goals list is slightly broader than the brief's three items**
  (cloud accounts, public URLs, team features). Added two more grounded in
  the 2026-08-23 review's own roadmap split: console-error collection
  (a documented posture decision, not a gap) and the Phase 3 backlog
  (area/visible/delayed capture, blur/redact, batch queue, diff mode) so the
  PRD does not imply those are near-term scope. Easy to trim if the two
  extra bullets are unwanted.
