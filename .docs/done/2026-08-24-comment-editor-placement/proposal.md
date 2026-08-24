# Proposal: Comment Editor Beside the Shape, Focused Before the First Keystroke

## Why

Three defects in the annotation canvas, all reported in the product review:

- The inline comment editor was anchored at the selected shape's own corner plus 14px, so it sat **on top of** the thing being commented on - it covered a box's top-left corner and handles, or an arrow's tail.
- The textarea was focused from a plain `useEffect` that runs after the pointer-up handler returns. A keystroke arriving in that gap landed on the window instead of the textarea, so typing "Chart" straight after drawing a box could record "hart".
- Pre-existing, same file: the SVG arrowhead was a `<marker>` in `<defs>` filled with `currentColor`. Marker content inherits from the `<marker>`'s own ancestors, not from the referencing `<line>`, so setting `style={{ color }}` on the line never reached it and every arrowhead rendered in the page's dark text colour instead of the annotation colour.

## Goal

The comment editor never covers the shape it describes, the first character typed after drawing always lands in it, and an arrow's head is the arrow's colour.

## Scope

- New `src/lib/editor-placement.ts`: `placeInlineEditor(bounds, image, editor)` - below the shape and left-aligned, flipped above when it would overflow the bottom, clamped horizontally into the image. Pure, unit-tested.
- `src/editor/annotation-geometry.ts` - `annotationCommentAnchor` (a point) replaced by `annotationBounds` (a rectangle: box as-is, arrow spanning both endpoints, text estimated from its length).
- `src/editor/annotation-canvas.tsx` - `inlineEditorPosition` from `placeInlineEditor(annotationBounds(...))`; the focus effect becomes `useLayoutEffect` and the three state updates that create an annotation move into one `commitNewAnnotation` helper wrapped in `flushSync`, so the textarea is mounted and focused before the pointer event returns; the `<defs>` arrow marker is replaced by an explicit `<polygon>` per arrow.
- `src/lib/annotate.ts` - the export's arrowhead geometry extracted as `arrowHeadPoints` and shared with the canvas, so on-screen and exported arrowheads cannot drift.

## Out of Scope

- Any other editor UI change (toolbar, timeline, sidebar untouched).
- Collision avoidance between the editor and other annotations; it is placed relative to the selected shape only.
- Measuring real text width for text annotations; the bounds estimate (10px per character) is enough to place an editor.
