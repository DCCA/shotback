# Design: Cloud LLM Feedback Export Fix

## Approach
Add render-mode selection in `src/lib/annotate.ts`:
- `footer` mode (existing behavior): append white footer and render feedback lines.
- `overlay` mode (fallback): keep original image size and render feedback in a bounded overlay card.

## Limits
- `MAX_EXPORT_CANVAS_HEIGHT = 16384`
- `MAX_EXPORT_CANVAS_AREA = 268000000`

If `img.height + footerHeight` violates either limit, use `overlay`.

## Notes
- Keep annotation rendering unchanged.
- Keep API signature of `exportAnnotatedImage(...)` unchanged.
- Export render-mode selector as a pure helper for unit testing.
