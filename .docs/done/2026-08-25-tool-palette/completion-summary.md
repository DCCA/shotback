# Completion summary: canvas tool palette

## What changed

- **New** `src/lib/tool-palette.ts` (pure) - `TOOL_SEGMENTS`, `activeSegment`,
  `hotkeyTool`, `SWATCHES`, `DEFAULT_ANNOTATION_COLOR`, `isCustomColor`, and
  `EditorTool`/`PaletteTool` (`EditorTool` moved here from
  `use-editor-state.ts`, which re-exports it).
- **New** `src/editor/tool-palette.tsx` - the `h-12` toolbar inside the canvas
  card: a segmented control (Select V / Box B / Arrow A / Text T / Redact R /
  Crop C), six stroke swatches plus a custom-colour disc, and the Zoom select.
- `use-editor-state.ts` - `setTool` -> `setPaletteTool`; the crop/redact
  "force draw mode" special case is gone, folded into "every drawing segment
  implies draw mode". Default colour `#ff3333` -> `#ef4444`.
- `annotation-canvas.tsx` - the `setInteractionMode("move")` flip in
  `commitNewAnnotation` is deleted; the existing keydown listener now also
  binds `V B A T R C` behind its `isTyping` guard and a no-modifier check.
- `sidebar.tsx` - Interaction, Tool, Zoom and Color rows removed; the help hint
  drops the "Draw mode / Move mode" sentence.
- `tests/tool-palette.test.ts` (10 cases) and one new e2e; six migrated e2e
  call sites.
- CLAUDE.md (composition root, a new palette paragraph, redact/crop/undo
  paragraphs, the helper list, the e2e description) and README (feature bullet,
  a hotkey table in Usage, `R`/`C` on the redact/crop bullets).

## Verification

- `npm run check` green: typecheck, lint, **247 unit tests**, build.
- `npm run format:check` green.
- `npm run test:e2e` green: **11/11**, including the new
  `the tool palette keeps a drawing tool active, and its hotkeys stay off the
comment box`.
- Colour-literal grep (`(text|bg|border|ring|from|to|via|fill|stroke)-(slate|emerald|red|white|blue|amber|green|purple|gray|zinc)` over `src/`): zero hits.
- Light and dark screenshots of the toolbar and the whole editor rendered from
  the built extension and read. One defect found and fixed that way: the
  `#111827` "Ink" swatch was invisible against the dark card, so every disc now
  carries an inset hairline in `hsl(var(--foreground)/0.25)`.

## Risks and follow-ups

- **Behavioural change users will notice**: a drawing tool no longer releases
  after a shape. Moving an existing annotation now needs `V` first. This is the
  intended change, but it is the one thing that will feel different.
- The old `#ff3333` default is retired. Existing saved shares keep whatever
  colour they were drawn in - the colour is stored per annotation, so nothing
  migrates.
- Clicking a row in the comment timeline still switches to move mode
  (`selectTimelineItem` in `main.tsx`). Deliberate and unchanged: picking an
  existing annotation from a list is an explicit "I want to edit this one".
- Icons on the segments are a later pass; the palette is text plus `kbd` hints
  today.
- The toolbar scrolls horizontally rather than wrapping below roughly 810px of
  pane width. Fine at every tested size, but a narrower window shows a
  scrollbar under the bar.
