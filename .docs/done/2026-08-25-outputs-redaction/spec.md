# Spec: output hierarchy, live redaction, UX minors

### Requirement: One recommended output

The editor's actions column SHALL present exactly one filled (primary) button,
`Copy for Claude Code`, and SHALL carry a one-line muted caption under it
naming what it writes. Every other action in the column SHALL be secondary or
destructive. `Capture Page` MAY be primary only while no capture exists.

#### Scenario: A fresh editor with no capture

- GIVEN `editor.html` is opened with no capture
- WHEN the actions column is inspected
- THEN exactly one button in `#editor-actions` carries `bg-primary`
- AND its accessible name is `Copy for Claude Code`
- AND the caption `Saves PNG + JSON to Downloads/shotback and copies the prompt.` is visible

#### Scenario: The column's reading order

- GIVEN the actions column
- WHEN its buttons are read top to bottom
- THEN they are Undo, Redo, Delete Selected Item, Copy for Claude Code, Prepare
  for Cloud LLM, Copy Local Share Link, Download Image, Copy Image
- AND a `Separator` sits between the edit group and the send group, and between
  the send group and the file group

### Requirement: Redactions are pixelated on the canvas

The canvas SHALL render every redaction pixelated with the same helper and the
same block size the export uses, aligned with the capture at both fit-width and
1:1 zoom, below the annotation SVG and inert to the pointer.

#### Scenario: A region is drawn

- GIVEN a capture with readable text
- WHEN a redaction is drawn over that text
- THEN the overlay canvas is opaque inside the region
- AND the region's fine detail there is under a quarter of what it was
- AND the overlay is fully transparent outside the region

#### Scenario: The region is removed

- GIVEN a redaction drawn on the canvas
- WHEN it is deleted or undone
- THEN the overlay no longer paints anything there

### Requirement: Alt reveals a selected redaction

Holding `Alt` while a redaction is selected SHALL clear that one region from
the overlay, and releasing `Alt` SHALL restore it. No other region SHALL be
revealed, and the reveal SHALL end if the window loses focus.

#### Scenario: Peeking under a region

- GIVEN a redaction is selected
- WHEN `Alt` is held down
- THEN the overlay is transparent inside that region
- AND WHEN `Alt` is released
- THEN the overlay is opaque there again

### Requirement: Counts read correctly and are stated once

Every rendered count SHALL agree with its noun in number, through one shared
`plural` helper. The annotation count SHALL appear once in the sidebar (the
header badge); the standalone `Annotations: N` line SHALL NOT exist.

#### Scenario: A single note

- GIVEN one annotation
- WHEN the sidebar header is read
- THEN it says `1 note`, not `1 notes`

### Requirement: The share link is offered, not printed

Creating a local share link SHALL put the URL on the clipboard and show a chip
saying so with an `Open` link, and SHALL NOT render the URL as text. The chip
SHALL clear when any other export runs.

#### Scenario: After another export

- GIVEN a share link has just been created
- WHEN `Copy Image` is used
- THEN the chip is gone

### Requirement: Saved shares are identifiable

Each saved-share row SHALL show the stored `environment.pageTitle` (falling
back to the page's hostname) and a lazily loaded 40px thumbnail of the stored
image.

#### Scenario: A share of a titled page

- GIVEN a share saved from a page titled "Acme Dashboard"
- WHEN the saved-shares list is shown
- THEN the row reads `Acme Dashboard` beside a thumbnail of the capture

### Requirement: Destructive actions confirm in place

`Capture Page` with at least one annotation, and a saved share's `Delete`,
SHALL each require a second, explicit confirming click on an inline control -
never a `window.confirm` - and the armed state SHALL revert on its own (5s and
3s respectively).

#### Scenario: Cancelling a replace

- GIVEN an annotated capture
- WHEN `Capture Page` is clicked and then `Cancel`
- THEN no capture starts and the annotations are untouched

#### Scenario: Deleting a saved share

- GIVEN a saved share row
- WHEN `Delete` is clicked once
- THEN the share is still listed
- AND WHEN `Confirm` is clicked
- THEN the share is gone
