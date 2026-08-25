# Design

## Output hierarchy (`src/editor/sidebar.tsx`)

The actions live in one `#editor-actions` grid, split by two `Separator`s into
edit / send / file. `Copy for Claude Code` is the only `variant="default"`, and
`Capture Page` becomes `variant={baseDataUrl ? "secondary" : "default"}` - a
one-expression fix for the real problem, which was two filled buttons in one
column. The `#editor-actions` id exists so the e2e can assert "exactly one
`.bg-primary` here" without the header's Capture button muddying the count.

No behaviour moved: every handler is the same `exports.*` call it was.

## Live redaction

`pixelateRegion` in `src/lib/annotate.ts` is exported and its second parameter
widened from `HTMLCanvasElement` to `CanvasImageSource`. That is the whole
extraction - the export path passes its own canvas (which already holds the
base image) exactly as before, and the canvas passes the `<img>`. One helper,
one block size, so the preview cannot drift from the burned-in result.

`annotation-canvas.tsx` renders one `<canvas id="redaction-overlay">` inside the
image wrapper:

- sized in **image px** (`canvas.width = imageSize.width`), stretched
  `absolute inset-0 h-full w-full` - the same sizing the SVG overlay already
  uses, which is what makes it track fit-width and 1:1 without measuring
  anything;
- `pointer-events-none`, so it changes no gesture;
- **before** the `<svg>` in DOM order, so pins, outlines and handles draw over
  it.

One effect redraws it on `[annotations, baseDataUrl, imageSize, revealedId]`.
Assigning `canvas.width` clears the canvas, which is also how a deleted, undone
or moved region stops being painted - no manual `clearRect` bookkeeping. `<img
onLoad>` sets a **fresh** `imageSize` object, so a second capture of identical
dimensions still re-runs the effect.

`revealedId` is `altHeld && selected.tool === "redact" ? selected.id : null` -
one derived value, so Alt is a two-line `keydown`/`keyup` listener and the
effect's dependency list stays small. `blur` clears it: a key released while
the window is unfocused must not leave a region uncovered. Failing that way
round is the safe one (the region stays covered).

The SVG hatch is now only the **selected** region's fill and the draft
marquee's; an unselected region is a transparent rect with its coloured stroke,
because the pixelation underneath already says what it is.

## Minors

- `plural(count, singular, pluralForm?)` in `src/lib/utils.ts`, used by the
  sidebar's badge, the redaction line and the batch status.
- `useTimedConfirm<T>(ms)` in `src/editor/use-confirm.ts`: one nullable armed
  key plus a self-clearing timer. `boolean` in the sidebar, the row id in the
  saved-shares list - so an armed row disarms any other by construction. Both
  confirm buttons `autoFocus`, because the button that was focused just
  unmounted.
- `getLocalShareImageUrl(meta)` added to `localStore.ts` (not called from the
  component directly) keeps `shareDb`/IndexedDB behind the one module that owns
  it. Thumbnails load only while the list is open and are revoked on cleanup.
- Every non-share export starts with `state.setShareUrl("")`, so the "Local
  share link copied" chip can never describe a clipboard that has moved on.

## Alternatives rejected

- **`<foreignObject>` / SVG `<image>` for the pixelation.** SVG content is sized
  in image px; the existing crop-controls comment records why that goes wrong.
  A sibling canvas reuses the mapping the SVG overlay already proved.
- **Re-running `exportAnnotatedImage` for the preview.** It draws pins, a
  legend and a footer, and re-encodes a data URL on every annotation change.
- **`window.confirm`.** Blocks the page, cannot be styled, and reads as a
  browser error to most people.
