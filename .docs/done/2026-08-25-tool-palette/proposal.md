# Proposal: canvas tool palette

## Why

Picking a tool meant two sidebar dropdowns, twelve inches from the canvas and
three clicks from the shape you wanted to draw:

- **Interaction** (Draw New / Move Existing) and **Tool** (Box / Arrow / Text /
  Redact / Crop) were two controls for one decision, and the pair could be put
  into states that do nothing (Move Existing + Crop). `setTool` patched that by
  forcing draw mode for Crop and Redact only - the other three still could.
- `commitNewAnnotation` flipped the canvas to move mode after every shape, so
  drawing five boxes was five drags plus five trips back to the Tool dropdown.
- There were no keyboard shortcuts for any of it, and the colour control was a
  native `<input type="color">` - the one native control the design system had
  not replaced.
- The two dropdowns, the Zoom row and the colour row pushed the actual outputs
  (the five export buttons) below the fold in the sidebar.

## Scope

**In:**

- A slim toolbar docked inside the canvas card, above `#capture-viewport`:
  a segmented control (Select / Box / Arrow / Text / Redact / Crop with `kbd`
  hotkey suffixes), six stroke swatches plus a custom-colour disc, and the Zoom
  select moved over from the sidebar.
- One-key shortcuts `V B A T R C`, bound in the canvas's existing keydown
  listener behind its `isTyping` guard.
- Drawing tools stay active after a commit (the auto-flip is deleted).
- One setter, `setPaletteTool`, replacing `setTool` + the UI's direct
  `setInteractionMode` writes.
- Default annotation colour becomes `#ef4444` (the first swatch). The old
  `#ff3333` is retired.
- Sidebar loses its Interaction, Tool, Zoom and Color rows; the help hint drops
  the "Draw mode / Move mode" sentence the toolbar now carries.

**Out:**

- Icons on the segments. Text labels plus hotkey hints for now; icons are a
  later pass.
- Persisting the chosen tool or colour across sessions (`src/lib/prefs.ts`
  holds export settings, not per-session drawing state).
- Any change to what an annotation is, how it is exported, or the crop model.
