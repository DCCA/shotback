# Tasks: World-Class Hardening Sweep

## 1. Dependency security
- [x] 1.1 Upgrade Vite 5→8, Vitest 2→4, @vitejs/plugin-react 4→6
- [x] 1.2 Upgrade TypeScript to 5.9.x, @types/chrome, add @types/node
- [x] 1.3 Run `npm audit`; resolve remaining findings (0 vulnerabilities)
- [x] 1.4 Verify `npm run test` and `npm run build`

## 2. Foundational hardening
- [x] 2.1 Fix tsconfig so `tsc --noEmit` passes (node types, test/config typing)
- [x] 2.2 Add `typecheck` script
- [x] 2.3 Add ESLint flat config + `lint` script
- [x] 2.4 Add Prettier config + `format`/`format:check` scripts
- [ ] 2.5 Fix arrow-head color bug in editor preview
- [ ] 2.6 Harden `download()` with error handling
- [ ] 2.7 Add tests: external LLM prompt, base64↔blob round-trip, handle geometry
- [x] 2.8 Wire typecheck + lint into CI
- [x] 2.9 Add `engines` field + `.nvmrc`

## 3. Permission tightening
- [ ] 3.1 Narrow `web_accessible_resources` matches
- [ ] 3.2 Document permission rationale in SECURITY.md and README.md

## 4. Polish & features
- [ ] 4.1 Add extension icons (16/32/48/128) + manifest wiring
- [ ] 4.2 Keyboard shortcuts: Esc deselect, Delete/Backspace remove selected
- [ ] 4.3 Local-share management UI (list/open/delete) in editor
- [ ] 4.4 Doc/process cleanup (CONTRIBUTING, archive completed changes, TODO sync)

## 5. Validation
- [ ] 5.1 `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` all pass
- [ ] 5.2 Completion summary added
