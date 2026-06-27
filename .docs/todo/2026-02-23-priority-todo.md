# TODO: Monday, February 23, 2026

> **Status (updated 2026-06-20):** Most items were resolved by the world-class
> hardening sweep (`.docs/done/2026-06-20-world-class-hardening/`). Remaining
> open work is manual QA and editor integration tests. See per-item notes.

## 1. Security and Permissions (Highest Priority)

- [~] Reduce extension scope in `public/manifest.json`:
  - host_permissions kept at `<all_urls>` **by design** — a general screenshot
    tool has no fixed site allowlist; rationale documented in `SECURITY.md`.
  - removed the unused `web_accessible_resources` (fingerprinting vector).
  - on-demand-only content-script injection tracked in `next-improvements.md`.
- [x] Document permission rationale in `SECURITY.md` and `README.md`.

## 2. Dependency Security Upgrades

- [x] Address `npm audit` findings — upgraded Vite 5→8, Vitest 2→4, plugin-react
      4→6, TypeScript 5.9; now **0 vulnerabilities**.
- [x] Final vulnerability status recorded in the world-class-hardening
      completion summary.

## 3. UI Refinement Follow-ups

- [ ] Run manual QA pass across editor/viewer (not runnable in CI; the popup was
      removed in favor of one-click capture):
  - one-click capture: toolbar icon opens the editor and auto-captures
  - on-page capture notice is visible while scrolling and absent from the saved PNG
  - editor timeline readability and button hierarchy
  - viewer metadata readability on narrow widths

## 4. Test Coverage Improvements

- [~] Added unit tests for pure logic (LLM prompt, base64 round-trip, handle
      geometry). Editor integration-style tests (timeline select/delete, cloud
      export, viewer retrieval) remain open — see `next-improvements.md`.

## 5. Process Cleanup

- [x] Archived `firehose-compliance-alignment` and `box-resize` to `.docs/done/`.
- [x] Kept `.docs/todo/next-improvements.md` in sync.
