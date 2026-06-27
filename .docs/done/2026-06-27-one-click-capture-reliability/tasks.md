# Tasks: One-Click Capture Reliability + On-Page Notice

- [x] 1. `sendToContentScript` + `isNoReceiverError`; retry the metrics call (PR #11).
- [x] 2. `activateTab` + `isTabsBusyError`; use for target activation + best-effort restore (PR #12).
- [x] 3. On-page notice in `content.ts` + lifecycle in `capture.ts` (PR #13).
- [x] 4. Fix notice leaking into frames via double-rAF + settle (PR #14).
- [x] 5. Unit tests for all four helpers/guards (`tests/capture.test.ts`, 54 passing).
- [x] 6. Docs updated (CLAUDE.md architecture, README features, todo QA list).
- [ ] 7. Manual QA after reload: one-click auto-captures; notice visible while scrolling and absent from the saved PNG.
