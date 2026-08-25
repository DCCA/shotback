# Tasks

## 1. Output hierarchy

- [x] 1.1 Group the actions into edit / send / file with two `Separator`s
- [x] 1.2 `Copy for Claude Code` becomes the one primary, with its caption
- [x] 1.3 `Capture Page` steps down to secondary once a capture exists
- [x] 1.4 `#editor-actions` id so the e2e can scope the primary assertion

## 2. Live redaction

- [x] 2.1 Export `pixelateRegion`, widen its source to `CanvasImageSource`
- [x] 2.2 Overlay `<canvas>` inside the image wrapper, under the SVG, inert
- [x] 2.3 Redraw effect keyed on annotations / base image / size / reveal
- [x] 2.4 `Alt` reveals the selected redaction; `blur` ends the reveal
- [x] 2.5 Hatch reduced to the draft and the selected outline

## 3. Minors

- [x] 3.1 `plural` helper; sidebar badge, redaction line, batch status
- [x] 3.2 Drop the `Annotations: N` line (header badge is the one count)
- [x] 3.3 Share chip + `Open` link; cleared by every other export
- [x] 3.4 Saved-share rows: stored page title + 40px lazy thumbnail
- [x] 3.5 `useTimedConfirm`; Capture (5s) and share Delete (3s) confirm inline

## 4. Tests and gates

- [x] 4.1 Unit: `plural`, and `pixelateRegion` called directly with a foreign source
- [x] 4.2 E2E: overlay opacity + detail collapse + Alt reveal
- [x] 4.3 E2E: both confirm flows, share chip, primary count and label order
- [x] 4.4 `npm run check`, `format:check`, `npm run test:e2e` green
- [x] 4.5 Colour-utility grep at zero
- [x] 4.6 Light and dark screenshots read

## 5. Docs

- [x] 5.1 CLAUDE.md: outputs order/hierarchy, live redaction, minors, e2e list
- [x] 5.2 README: outputs order, Alt-reveal, inline confirms
- [x] 5.3 This change folder + completion summary
