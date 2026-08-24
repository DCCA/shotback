# Proposal: PRD reframed around the agent handoff

## Why

`.docs/PRD.md` still described the February MVP: full-page capture, box/arrow/
text annotations, and "generate a local share URL," with the cloud-LLM export
as a fallback. Fourteen merged PRs since (numbered pins, undo/redo, dark
theme, fit-to-width, the `Alt+Shift+S` shortcut, copy-PNG-to-clipboard,
environment block, per-annotation geometry and DOM context, failed-request
diagnostics, prompt verbosity, and a JSON sidecar plus `skills/shotback/
SKILL.md`) turned the product into an agent-handoff tool, and the PRD never
caught up. The 2026-08-23 product review (`.docs/reviews/
2026-08-23-product-review.md`) named this directly: "the PRD still describes
the Feb MVP... the actual differentiator (agent handoff) is a footnote."

## Goal

Rewrite `.docs/PRD.md` so it states the product's actual differentiator (a
screenshot with a machine-readable handoff, not a share link) as the Goal, and
lists shipped scope as RFC-2119 requirements traceable to what is on `main`
today - not aspirational.

## Scope

- `.docs/PRD.md`: full rewrite. Problem / Goal / Target user / Scope (shipped
  truth) / Non-goals / Success criteria / Constraints, under 80 lines,
  RFC-2119 keywords for requirements, no em dashes.
- This change folder (`proposal.md` + `completion-summary.md`; the PRD itself
  is the spec, so no separate `spec.md`/`design.md`/`tasks.md`).

## Out of scope

- `README.md` - left untouched per instruction, to avoid overlap with
  in-flight work. Its tagline undersells the agent-handoff differentiator
  relative to the new PRD; flagged in the completion summary rather than
  edited.
- No code changes. This is a docs-only change.

## Verification

Every claim in the new PRD was checked against `CLAUDE.md`, `SECURITY.md`,
`README.md`, `public/manifest.json`, and `src/lib/feedback.ts` (verbosity
gating for geometry/selector/Diagnostics) rather than taken from the review
or the task brief alone.
