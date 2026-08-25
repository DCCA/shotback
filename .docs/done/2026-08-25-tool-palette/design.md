# Design: canvas tool palette

## Where the state lives

`tool` (`EditorTool = AnnotationTool | "crop"`) and `interactionMode`
(`"draw" | "move"`) stay exactly as they were - the canvas reads both on every
pointer path, and rewriting that model would have touched drawing, dragging,
resizing, the marquee and hit-testing for no behavioural gain.

What changed is the **write** side. `setTool` (which forced draw mode for Crop
and Redact, and only those) is replaced by a single setter:

```ts
const setPaletteTool = (segment: PaletteTool): void => {
  if (segment === "select") {
    setInteractionMode("move");
    return;
  }
  setToolState(segment);
  setInteractionMode("draw");
};
```

That folds the old special case in: it existed because a tool could be picked
into a mode that could not draw it, which was only ever a bug. Now every
non-`select` segment implies draw mode, so the exception disappears rather than
being generalised.

The **read** side is a pure function so the palette cannot drift from the
canvas:

```ts
activeSegment(tool, interactionMode) === interactionMode === "move" ? "select" : tool;
```

Move mode is `Select` whatever tool was last drawn with, and that tool comes
back the moment Select is left - so the palette holds the user's last drawing
choice without a second piece of state to keep in sync.

## The pure module

`src/lib/tool-palette.ts` holds everything testable: `EditorTool`,
`PaletteTool`, `TOOL_SEGMENTS` (order, labels, hotkeys - the one statement of
the palette's shape), `activeSegment`, `hotkeyTool`, `SWATCHES`,
`DEFAULT_ANNOTATION_COLOR` and `isCustomColor`. `EditorTool` moved here from
`use-editor-state.ts`, which now re-exports it, so `src/lib` never has to
import from `src/editor`.

`SWATCHES` is the **one** place the hex colours live. They are data - written
into every annotation, the exported PNG, the JSON sidecar and the saved share -
so they are deliberately not tokens and not Tailwind classes: an annotation
drawn in red must stay red in a share opened under the other theme. The discs
therefore take an inline `backgroundColor`, and the custom disc an inline
conic-gradient. That is the reason the project's "no colour literals in `src/`"
grep still returns zero: it looks for Tailwind colour utilities, and there are
none here.

## Hotkeys

Bound in the canvas's existing window `keydown` listener rather than a second
one, so there is one keymap with one `isTyping` guard. `hotkeyTool` only
answers for single characters, which is what keeps `Escape`, `Enter` and
`Delete` from ever colliding with a tool letter, and the call site additionally
requires no Ctrl/Meta/Alt - `Ctrl+C` is a copy, not the crop tool - and a
capture to act on, so the keyboard is not a way around the disabled palette.

The `isTyping` guard is load-bearing here in a way it was not before: the
inline comment editor is a `<textarea>` inside the SVG, focused automatically
the instant a shape is committed, so an unguarded `b` would eat every letter of
a note.

It is **not sufficient on its own**, though. `Select` is a WAI-ARIA listbox
built on a `<button>` with its own typeahead reading plain keydowns off the
window - not an INPUT, TEXTAREA or contenteditable, so `isTyping` never sees
it. Typing `a` to reach "Actual size" in Zoom would have picked the Arrow tool
and `c` for "Compact" in Prompt detail would have picked Crop. The branch
therefore also rejects a target inside
`[role="combobox"],[role="listbox"]`; Escape and Delete keep their existing
semantics, which the listbox needs.

## Craft

- One writer for `interactionMode`. `setInteractionMode` is not exposed on
  `EditorState` at all, so "the palette is the only way in" is a compile error
  rather than a code-review note; the comment timeline's row click (which does
  enter Select, deliberately) goes through `setPaletteTool("select")`.
- One bordered group, `overflow-hidden` so the filled active segment takes the
  group's corners, `border-l` hairlines between segments (never on the first).
  Focus rings are `ring-inset` with `focus-visible:relative z-10` so a ring on
  an interior segment is not clipped by its neighbour.
- `kbd` suffixes at 10px: `text-muted-foreground` normally,
  `text-primary-foreground/70` on the filled segment. A real `<kbd>` element,
  which also keeps them out of the e2e's dark-theme contrast sweep (it walks
  `button, p, span, h1, h2, label`) while the button they sit in is still swept.
- Swatches are 24px discs with a 2px `ring-ring` at `ring-offset-2
ring-offset-card` when active. Every disc carries an inset hairline in
  `hsl(var(--foreground)/0.3)` **and** a 6px `bg-foreground/40` core. Both are
  the same trick: `--foreground` is by definition the opposite end of the theme
  from `--card`, so the rim and the dot are faint on a mid-tone swatch and
  unmistakable on the one disc whose fill is close to the card. The rim alone
  was not enough - `#111827` on the dark card still read as an empty ring.
  Caught in the dark screenshots, not by a test.
- The bar wraps below `lg` (`flex-wrap h-auto min-h-12` -> `lg:h-12
lg:flex-nowrap`) rather than scrolling horizontally: the sub-`lg` page
  scrolls vertically anyway, and a segment hidden off the right edge is worse
  than a second row.
- With no capture the segments and swatches are `disabled`, faded by one
  `opacity-50` per group (a per-control fade leaves the dividers and the border
  at full strength and reads as a rendering bug; `color` itself is untouched,
  so the e2e contrast sweep still measures the real token). Zoom stays live.
- The custom control is the native `<input type="color">` at `opacity-0` over
  the wheel disc, so the browser owns the picker dialog and the keyboard
  behaviour while the control still looks like the six beside it. `peer` /
  `peer-focus-visible` puts the focus ring on the visible disc.
- The bar is `min-h-12 shrink-0 border-b border-border bg-card` with `gap-2`
  throughout.

## Test strategy

- `tests/tool-palette.test.ts` covers the pure module: `activeSegment` over
  every tool x mode, `hotkeyTool`'s single-character rule and its uniqueness,
  and the swatch invariants (six distinct hexes, default is the first,
  `isCustomColor` is case-insensitive).
- The e2e suite drove the two old comboboxes in six places. Every one is
  migrated to the toolbar (`pickTool(editor, "Box")`) with the same assertions
  intact - including the two comments that asserted "picking Crop/Redact must
  put the canvas back into draw mode by itself", which still hold and are still
  exercised. The `Zoom` combobox calls are untouched: it moved, but its
  accessible name did not.
- Two migrated call sites needed a real behavioural edit, not a rename: the box
  drag and the CTA-box move both relied on the auto-flip putting the canvas in
  move mode. They now press `Select` explicitly, which is the point of the
  change.
- One new e2e (`the tool palette keeps a drawing tool active...`) does a real
  capture and then covers the four behaviours the brief named: two boxes drawn
  back to back with no click between them, `V` + click selecting an existing
  box, a swatch changing the next annotation's stroke and not the drawn ones,
  and tool letters typed into the inline comment box landing as text.
