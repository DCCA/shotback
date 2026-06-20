# Proposal: World-Class Hardening Sweep

## Why
A full review found the product logic is sound and tested, but the engineering
baseline has gaps that block a "world-class" grade: type-checking is broken and
unenforced, there is no linter/formatter, the dependency tree carries 10 known
vulnerabilities, extension permissions are broader than needed, the popup ships
with no icon, and a few small correctness/UX issues remain.

## Scope
Four workstreams, ordered by risk:

1. **Dependency security** — upgrade the build/test toolchain (Vite, Vitest,
   plugin-react, TypeScript, type packages) to clear all `npm audit` findings.
2. **Foundational hardening** — restore and enforce `tsc` type-checking, add
   ESLint (flat config) + Prettier, wire both into CI, fix the arrow-head color
   bug, harden `download()` error handling, and add tests for previously
   untested pure logic.
3. **Permission tightening** — narrow `web_accessible_resources` and document
   the rationale for the remaining permissions in `SECURITY.md` / `README.md`.
   Conservative: capture cannot be re-verified in a real browser from CI.
4. **Polish & features** — add real extension icons, keyboard shortcuts (Esc to
   deselect, Delete to remove selected), a local-share management surface, and
   clean up documentation/process drift.

## Out of Scope
- React 18 → 19 and Tailwind 3 → 4 migrations (not vulnerability-driven; high
  churn for no security benefit).
- Decomposing the editor component into smaller modules (large refactor; deferred
  to a follow-up change).
- Cloud/hosted sharing (explicit non-goal in the PRD).

## Risks
- Major toolchain bumps (Vite 5→8, Vitest 2→4) can break the build/tests;
  mitigated by running `test` + `build` + `typecheck` after each step.
- Permission changes affect runtime capture behavior that cannot be verified
  here; mitigated by keeping `activeTab`/`scripting`-based capture intact and
  only tightening clearly-safe surfaces.
