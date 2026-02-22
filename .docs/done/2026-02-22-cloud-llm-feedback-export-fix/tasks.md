# Tasks: Cloud LLM Feedback Export Fix

## 1. Documentation
- [x] 1.1 Add change folder and `proposal.md`
- [x] 1.2 Add `spec.md` with RFC 2119 requirements + scenarios
- [x] 1.3 Add `design.md`
- [x] 1.4 Add `tasks.md`

## 2. Implementation
- [x] 2.1 Add render-mode selector (`footer` vs `overlay`) with safe canvas limits
- [x] 2.2 Keep footer rendering for normal images
- [x] 2.3 Add overlay feedback rendering fallback for limit-exceeding images
- [x] 2.4 Keep export API unchanged

## 3. Tests
- [x] 3.1 Add unit tests for render-mode selection logic

## 4. Validation
- [x] 4.1 Run `npm run test`
- [x] 4.2 Run `npm run build`
- [x] 4.3 Manual verify: "Prepare for Cloud LLM" contains general feedback on tall pages
