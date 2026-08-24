# Proposal: capture the real scroller, instantly

## Why

Reported: "not capturing the full page". Reproduced with the real extension in
Chromium (Playwright, `--load-extension`):

1. **Inner scroll container** (`html,body{overflow:hidden}` + a scrolling
   `<div>` - the standard SPA/dashboard shell): `documentElement.scrollHeight`
   equals `innerHeight`, so `buildScrollSteps` yields one step and only the
   first viewport is captured (493 of 2400 px).
2. **`scroll-behavior: smooth`**: `window.scrollTo(0, y)` animates, and the
   frame is captured before the scroll lands - every frame from the second on
   shows the previous viewport's content.

## Scope

- `src/content.ts`: locate the element that actually scrolls (document or the
  largest scrollable element), report its geometry, and scroll it with
  `behavior: "instant"`.
- `src/lib/capture.ts`: stitch frames relative to the scroller's top so the
  chrome above an inner scroller (headers) is kept once, not repeated.
- e2e coverage for both page shapes using real `captureVisibleTab`.

## Non-goals

- Sticky/fixed elements inside the scrolled region (already duplicated today).
- Lazy-loaded / infinite-scroll content that grows while capturing.
- Horizontal scrolling.
