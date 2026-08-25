# Spec: dogfood wave (keyboard access, export trace, toast, saved shares)

Condensed from the eleven wave items (E1-E11). Every requirement below is
covered by a unit test, an e2e assertion, or both - see `completion-summary.md`
for which.

### Requirement: Escape discards a comment draft

Escape while typing in the inline comment editor SHALL restore the note as it
stood when the textarea took focus, SHALL write no undo entry, and SHALL return
focus to the canvas with the annotation still selected. Every other leave path
(blur, Tab, selecting another annotation) SHALL keep committing.

#### Scenario: A note typed and then abandoned

- GIVEN a box was drawn and "broken here" typed into its comment editor
- WHEN Escape is pressed
- THEN the annotation's comment is empty again
- AND the canvas has focus with that annotation still selected
- AND the very next arrow key nudges it

#### Scenario: A text annotation that was never typed into

- GIVEN the Text tool is armed and Enter places a text annotation
- WHEN Escape is pressed without typing anything
- THEN the annotation is removed
- AND no numbered pin, timeline row, prompt line or sidecar entry remains

### Requirement: The canvas is drawable from the keyboard

The SVG overlay SHALL be focusable and its accessible name SHALL say what the
keys do. With it focused and a drawing tool armed, Enter SHALL place that
tool's default shape at the centre of the visible part of the capture, through
the same commit path a pointer drag uses. Arrow keys SHALL move the selection
by 8 image px and Shift+arrow SHALL resize the rectangle tools by the same,
committing once per key-up rather than once per repeat.

#### Scenario: Placing a box with no pointer

- GIVEN the canvas has focus and the Box tool is armed
- WHEN Enter is pressed
- THEN a 160x100 image-px box is placed at the centre of the visible capture
- AND it is selected, its comment editor focused, one undo entry written and its
  DOM context read

#### Scenario: A held arrow key is one undo entry

- GIVEN an annotation is selected and the canvas has focus
- WHEN ArrowRight is held so keydown repeats and one keyup follows
- THEN the annotation has moved once per repeat
- AND exactly one entry was written to the undo history

#### Scenario: The comment editor keeps its own keys

- GIVEN the inline comment editor has focus
- WHEN Enter, an arrow key or a tool letter is pressed
- THEN it is a newline, a caret move and a letter respectively
- AND no annotation is placed, moved or re-tooled

### Requirement: Pen is pointer-only

Keyboard placement SHALL NOT apply to the pen tool: a default stroke would be a
shape the user never drew.

### Requirement: The status toast does not cover the palette

The toast SHALL render inside the canvas pane, below the tool palette's swatch
row, and SHALL NOT intercept pointer events aimed at a swatch.

#### Scenario: A success toast over the palette

- GIVEN an export has just succeeded and its toast is up
- WHEN `elementFromPoint` is asked what is over a colour swatch
- THEN it answers the swatch

### Requirement: Saved shares follow the store

The saved-shares list SHALL refresh when another editor tab writes or deletes a
`share:` key, without a page reload. This tab's own writes SHALL NOT list twice.
The collapsed panel SHALL show the count.

#### Scenario: Two editor tabs

- GIVEN editor tab A is open with the list showing one share
- WHEN editor tab B saves a share
- THEN tab A lists both, with its own capture and annotations untouched

### Requirement: Copy for Claude Code leaves a trace

_Copy for Claude Code_ SHALL record the capture in Saved Shares through the same
`saveLocalShare` path _Copy Local Share Link_ uses, `environment` and
`previousShareId` included. It is best effort: a failed save SHALL NOT fail the
export, SHALL be named in the status, and SHALL NOT put the share URL on the
clipboard, which holds the prompt.

#### Scenario: An export that also saves

- GIVEN a capture with one annotation
- WHEN _Copy for Claude Code_ succeeds
- THEN the PNG and JSON are in `Downloads/shotback`
- AND Saved Shares holds a row for that capture
- AND the clipboard holds the prompt, not the share URL

### Requirement: The timeline names the element under each annotation

When an annotation carries a `context`, its timeline row SHALL show one muted,
truncated line naming that element, with the full `cssPath` on hover.

#### Scenario: A box over a real target

- GIVEN a box drawn over a button whose selector resolved
- WHEN the inspection round trip lands
- THEN the row names that element before any export is made

### Requirement: Leaving a comment does not strand focus

When the inline comment editor unmounts and focus has fallen to
`document.body`, focus SHALL move to that annotation's comment-timeline row,
falling back to the canvas. It SHALL NOT move focus that the user has already
placed somewhere else.

### Requirement: Non-visual confirmation for silent actions

Delete, undo and redo SHALL announce in one `sr-only` `role="status"` region.
The visible toast SHALL remain the only visible status surface.

#### Scenario: Three undos in a row

- GIVEN three undos are performed in sequence
- WHEN each completes
- THEN the region announces each one (a repeated string still being a change)

### Requirement: Printed geometry describes the attached image

`describeGeometry`'s printed coordinates SHALL be clamped to the image bounds
by the same helper the sidecar clamps its reported rect with, so the prompt and
the JSON beside it describe the same annotation. Stored geometry is unchanged.

#### Scenario: A pen stroke crossing a crop edge

- GIVEN a pen stroke with points outside an applied crop
- WHEN the prompt and the sidecar are produced
- THEN both report the same clamped from/to points
- AND the stored annotation still holds its unclamped points
