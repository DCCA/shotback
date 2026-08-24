# Proposal: Per-annotation geometry in the prompt

## Why

The prompt's `Area comments:` list ties each note to a number that maps back
to a pin on the exported image (`.docs/done/2026-08-24-numbered-pins/`), but
an agent working from the text alone still has to open the image and hunt for
pin `n.` to know where on the page the note applies. The pixel position and
page-relative location are already known at export time - they are just not
in the text.

## Goal

Each numbered line in the prompt's area-comment list carries the
annotation's geometry (image px plus % of page) when the caller has an image
size to hand, and stays exactly as it was today when it does not.

## Scope

- `src/lib/numbering.ts` - pure `describeGeometry(annotation, image)`:
  box -> `at (x, y) size WxH px [X%, Y% of page]`; arrow -> `from (x1, y1) to
(x2, y2) px`; text -> `at (x, y) px`. Px rounded to integers, percentages
  rounded to whole numbers.
- `src/lib/feedback.ts` - `formatAreaComments` (and both `buildExternalLlmPrompt`
  / `buildClaudeCodePrompt`) gain an optional `image: { width: number; height:
number }`. When present, each line becomes `${n}. [${tool}] ${note} -
${geometry}`. When absent, output is byte-identical to before this change.
- `src/editor/use-exports.ts` - both prompt builders receive `image:
state.imageSize`, guarded so the placeholder `{ width: 1, height: 1 }` (before
  a capture lands) never turns into a geometry line.
- e2e: the `smooth` capture test's clipboard assertion after `Prepare for
Cloud LLM` now also matches the drawn box's geometry line.

## Out of Scope

- Geometry for the exported PNG's own legend footer (still just the note text
  and the pin) - this is a prompt-only change.
- Any change to how the pin is drawn or numbered.
- DOM/element context (a later handoff-v2 task).
