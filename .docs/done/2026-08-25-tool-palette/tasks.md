# Tasks: canvas tool palette

## 1. Pure module

- [x] 1.1 `src/lib/tool-palette.ts`: `EditorTool`, `PaletteTool`,
      `TOOL_SEGMENTS`, `activeSegment`, `hotkeyTool`, `SWATCHES`,
      `DEFAULT_ANNOTATION_COLOR`, `isCustomColor`
- [x] 1.2 `tests/tool-palette.test.ts` (10 cases)

## 2. State

- [x] 2.1 Replace `setTool` with `setPaletteTool`; drop the crop/redact
      special case (folded into "every drawing segment implies draw mode")
- [x] 2.2 Default colour `#ff3333` -> `DEFAULT_ANNOTATION_COLOR` (`#ef4444`)
- [x] 2.3 Move `EditorTool` to `src/lib/tool-palette.ts`, re-export it

## 3. Toolbar

- [x] 3.1 `src/editor/tool-palette.tsx`: segmented control, swatches, custom
      colour disc, Zoom select
- [x] 3.2 Render it inside the canvas `Card`, above `#capture-viewport`
- [x] 3.3 Focus rings on every segment, both themes

## 4. Canvas

- [x] 4.1 Delete the `setInteractionMode("move")` flip in
      `commitNewAnnotation`
- [x] 4.2 Bind `V B A T R C` in the existing keydown, behind `isTyping` and
      with no Ctrl/Meta/Alt

## 5. Sidebar

- [x] 5.1 Remove the Interaction, Tool, Zoom and Color rows and their now
      unused imports
- [x] 5.2 Shorten the help hint (the toolbar carries the tool keys)

## 6. Tests

- [x] 6.1 Migrate all six `Interaction`/`Tool` combobox call sites in the e2e
- [x] 6.2 Add the explicit `Select` switches the removed auto-flip used to
      provide (box drag, CTA-box move)
- [x] 6.3 Point the reduced-motion chevron check at the `Zoom` select
- [x] 6.4 New e2e: two boxes back to back, `V` + click selects, swatch changes
      the next annotation, hotkeys ignored while typing

## 7. Docs and gates

- [x] 7.1 `npm run check` green (typecheck, lint, 247 unit tests, build)
- [x] 7.2 `npm run format:check` green
- [x] 7.3 `npm run test:e2e` green (11 tests)
- [x] 7.4 Colour-literal grep zero
- [x] 7.5 Light + dark screenshots read and verified
- [x] 7.6 CLAUDE.md and README updated
