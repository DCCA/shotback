# Tasks: a11y audit fixes

- [x] 1.1 Add `tests/contrast-tokens.test.ts` (RED against 47% L)
- [x] 1.2 Darken light `--muted-foreground` to `215 16% 42%` (GREEN)
- [x] 1.3 Confirm `tests/theme-tokens.test.ts` (dark equality guard) still passes
- [x] 2.1 Add targeted `@media (prefers-reduced-motion: reduce)` block to `globals.css`
- [x] 2.2 Guard the capture-notice spinner's `animation` in `content.ts`
- [x] 2.3 e2e: button transition-duration/select chevron under reduced motion
- [x] 2.4 e2e: capture-notice spinner `animationName` under reduced motion
- [x] 3.1 Wrap saved-share checkbox in a 24x24 `<label>` target
- [x] 3.2 e2e: assert checkbox target bounding box >= 24x24
- [x] 4.1 `role="group"` + `aria-label` on the annotation `<svg>`
- [x] 4.2 `decoding="async"` on the capture `<img>`
- [x] 5.1 `npm run check` green
- [x] 5.2 `npm run format:check` green
- [x] 5.3 Colour-literal grep guard: zero hits
- [x] 5.4 `npm run test:e2e` green (10/10, was 8/8 plus 2 new)
- [x] 5.5 Visual verify: sidebar screenshot, light + dark
- [x] 6.1 Change folder written, tasks ticked, completion summary added
