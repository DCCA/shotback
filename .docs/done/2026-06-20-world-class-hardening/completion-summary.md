# Completion Summary: World-Class Hardening Sweep

## What changed

**Dependency security**

- Upgraded Vite 5→8, Vitest 2→4, @vitejs/plugin-react 4→6, TypeScript→5.9, and
  refreshed `@types/chrome`; added `@types/node`. `npm audit` went from 10
  advisories (1 critical, 3 high, 5 moderate, 1 low) to **0**.

**Foundational hardening**

- Restored type-checking (`tsc --noEmit` was failing and unenforced); fixed the
  tsconfig and the illegal `chrome`-as-type casts in the storage test.
- Added ESLint (flat config: typescript-eslint + react-hooks) and Prettier, with
  a one-time formatting pass.
- CI now runs `typecheck`, `lint`, `format:check`, `test`, `build`, and
  `npm audit --audit-level=high`; CI Node bumped to 22; added `.nvmrc` and an
  `engines` field.
- Fixed the editor arrow-head color bug (markers inherited page text color).
- Hardened `download()` with a guard, try/catch, and status messaging.
- Extracted pure helpers to `src/lib/feedback.ts`; test count 17 → 26 (LLM
  prompt, box-handle geometry, binary base64 round-trip).

**Permission tightening**

- Removed the unused `web_accessible_resources` block (eliminates an
  extension-fingerprinting vector; no functional impact — verified in `dist`).
- Documented every permission's rationale and the local-only data posture in
  `SECURITY.md` and `README.md`.

**Polish & features**

- Added real extension icons (16/32/48/128) via a reproducible, dependency-free
  generator (`scripts/generate-icons.mjs`), wired into the manifest.
- Editor keyboard shortcuts: Esc to deselect, Delete/Backspace to remove the
  selected annotation (ignored while typing).
- Added a "Saved Shares" panel (list / open / delete) over existing storage APIs.
- Doc cleanup: fixed the stale `CONTRIBUTING.md` reference, aligned it with the
  FIREHOSE workflow + new gates, archived two completed change folders, and
  synced the TODO docs.

## Risks / follow-ups

- `host_permissions: <all_urls>` and the static content-script registration were
  kept intentionally (a general screenshot tool needs broad capture access, and
  injection changes can't be verified in CI). On-demand-only injection is tracked
  in `next-improvements.md`.
- Manual in-browser QA (capture/annotate/share across popup/editor/viewer) is not
  runnable in CI and remains the main outstanding verification.

## Validation

- `npm run check` (typecheck + lint + test + build) and `npm run format:check`
  all pass; 26/26 tests; 0 audit advisories.
