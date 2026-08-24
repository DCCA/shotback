# Completion Summary: One Numbering Everywhere, Numbered Pins

## What changed

**`src/lib/numbering.ts` (new)** - the single source of numbering.

- `numberAnnotations(annotations)` sorts a copy by `createdAt` and returns `{ n, annotation }`. Creation order, not array order, so the timeline, the prompt, the canvas and the export always agree.
- `pinRadius(imageWidth)` = `clamp(round(width / 60), 14, 28)` - 14px on a phone-width capture, 28px on a 4K one.
- `pinAnchor(annotation)` - the arrow tail for arrows, `{x, y}` otherwise (box top-left corner, text baseline start).

**`src/lib/feedback.ts`** - `formatAreaComments` numbers from `numberAnnotations`, so the prompt's `1. [box] ...` list matches the pins on the image the prompt is sent with.

**`src/lib/annotate.ts`**

- `drawCommentLabel` (the white pill holding raw comment text) is gone. Every annotation now gets `drawPin`: a filled circle in the annotation's colour with a white ring and a white bold number, drawn at `pinAnchor`.
- Shape stroke width is `max(3, round(pinRadius / 5))` and text annotations render at `round(pinRadius * 0.9)` px, offset `pinRadius * 1.4` right of the pin - so both scale with the capture instead of being fixed at 3px/16px.
- The footer is now "Notes": one line per numbered annotation that has a comment (or text), each led by the same pin at `0.6 * pinRadius`, followed by a bold "General feedback" sub-heading and the wrapped paragraph when there is one. Font size `round(pinRadius * 0.9)`; padding, line height and the legend gutter all derive from it.
- `selectFeedbackRenderMode` is unchanged and still consulted: `footerHeight` is now the combined row count, and when the footer would push the canvas past the height/area limits the same content renders in the overlay card (truncated at 8 rows). The overlay re-wraps to its narrower width - previously it drew footer-width lines into a 48%-wide card and let them run off the edge.
- No notes and no general feedback still means no footer at all.

**`src/editor/annotation-canvas.tsx`** - the two comment-pill blocks are replaced by one `renderPin` helper used by all three tools, so the editor shows what the export will produce. Text annotations gained a transparent hit circle at the anchor: the pin is `pointerEvents="none"`, and without it an empty text annotation would have had no hit area to select or drag.

**`src/editor/comment-timeline.tsx`** - rows and the Remove button's aria-label use `#{n}` from `numberAnnotations` instead of `index + 1`.

**`vitest.config.ts`** - resolves `@` to `src/`. Every cross-module import under test had been type-only until now, so the alias had never needed to work at runtime.

**Tests** - `tests/numbering.test.ts` (new), a `numbers area comments by creation time` case plus distinct fixture timestamps in `tests/feedback.test.ts`, and an `exportAnnotatedImage pins` block in `tests/annotate.test.ts` that drives the real export against a recording 2D-context stub.

## Verification

- `npm run check` - typecheck, lint, 66 unit tests, build: green.
- `npm run format:check` - green.
- `npm run test:e2e` - 6/6.
- `grep -rnE "(text|bg|border|ring|from|to|via|fill|stroke)-(slate|emerald|red|white)\b" src/` - 0 hits.

## Screenshots

Driven through the real unpacked extension (Playwright, one-click autocapture of a local test page, three annotations - box, arrow, text - each with a comment, plus general feedback, then "Copy Local Share Link" and the viewer). Files in `.superpowers/sdd/2026-08-23-fix-it-all-plan/task-5-shots/`:

| File | What it shows |
|---|---|
| `editor-light.png` / `editor-dark.png` | The editor canvas with pins 1, 2, 3 at the box corner, the arrow tail and the text anchor. Legible in both themes; no pill text anywhere. |
| `editor-canvas.png` | The canvas alone, at natural size. |
| `editor-timeline.png` | `#1 BOX`, `#2 ARROW`, `#3 TEXT` - the same numbers as the pins. |
| `viewer-light.png` / `viewer-dark.png` | The saved share. The exported PNG is 1400x1736 rendered at 940px wide (67%) and the pins are still clearly readable at that scale. The "Notes" footer lists 1/2/3 with matching coloured pins and the comments, then the General feedback paragraph. |
| `viewer-export.png` | The exported PNG alone, at natural size. |

Observations: numbering matches across canvas, timeline, legend and prompt; the text annotation sits clear of its pin; nothing from the pill era remains on the image.

## Known follow-ups (not in this change)

- Two annotations anchored at the same point still stack their pins; no collision avoidance.
- Pre-existing, unrelated: the editor canvas's arrow head renders black (light) / white (dark) instead of the annotation colour, because `currentColor` inside the shared `<marker>` in `<defs>` resolves against the marker, not the referencing `<line>`. The exported PNG draws its own arrow head and is correct. Left alone here to keep this change to numbering and pins.
