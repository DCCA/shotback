# Done: Editor UX + LLM Fallback (2026-02-17)

## Summary
Aligned editor UX and sharing behavior with local-link architecture while adding a practical fallback for cloud LLM usage.

## Implemented
- Reworked comment entry into a single context-aware editor
  - Selected annotation => edits linked annotation comment/text
  - No selection => edits general feedback
- Added timeline improvements
  - Better visual contrast
  - Per-item delete action
- Added automatic focus behavior after drawing area annotations
- Added external LLM fallback
  - Downloads annotated PNG
  - Copies structured review prompt to clipboard
- Added viewer support for general feedback display

## Validation
- `npm run test` passed
- `npm run build` passed

## Notes
- Local share links remain local-only by design.
- External fallback supports cloud LLM workflows without switching to cloud storage.
