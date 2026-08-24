# Proposal: Copy annotated PNG to the clipboard

## Why

The fastest way to get a screenshot into a Claude Code / Cursor chat is pasting
an image straight from the clipboard. Shotback already has three export paths
(local share link, cloud-LLM download + prompt, Claude Code file + prompt),
but every one of them requires a save-then-attach round trip. There is no way
to put the annotated image directly on the clipboard.

## Goal

A fourth, minimal output: **Copy Image**. One click copies the same annotated
PNG the other exports produce (`exportAnnotatedImage`) to the system
clipboard as `image/png`, ready to paste into any chat.

## Scope

- `copyImage` in `src/editor/use-exports.ts`: build the annotated PNG, `fetch`
  it to a `Blob`, and `navigator.clipboard.write([new ClipboardItem({
"image/png": blob })])`.
- A `Copy Image` secondary button in `src/editor/sidebar.tsx`, next to
  `Download Image (PNG)`, disabled under the same condition
  (`!baseDataUrl || isBusy`).
- e2e coverage: grant `clipboard-read`/`clipboard-write` on the persistent
  test context, click the button, and read the clipboard back to assert
  `image/png` is present.

## Out of Scope

- Copying anything other than the merged/annotated PNG (e.g. the raw
  unannotated capture).
- A toast/undo affordance beyond the existing status line.
