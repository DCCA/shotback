# Spec: canvas tool palette

### Requirement: One control for the tool decision

The editor SHALL present the five drawing tools and the select/move mode as one
segmented control on the canvas toolbar, and SHALL NOT offer a separate
interaction-mode control. Picking any drawing segment SHALL put the canvas in
draw mode; picking `Select` SHALL put it in move mode.

#### Scenario: A drawing tool is always drawable

- GIVEN the canvas is in move mode
- WHEN the user picks `Box`, `Arrow`, `Text`, `Redact` or `Crop`
- THEN the canvas is in draw mode with that tool
- AND a drag on the capture draws that shape

#### Scenario: Select is the old move mode

- GIVEN the `Box` segment is active
- WHEN the user picks `Select`
- THEN the canvas is in move mode
- AND a click on an existing annotation selects it rather than starting a shape

#### Scenario: The palette never disagrees with the canvas

- GIVEN any combination of `tool` and `interactionMode`
- WHEN the toolbar renders
- THEN exactly one segment is marked `aria-pressed="true"`
- AND it is `Select` when the mode is move, and the tool otherwise

### Requirement: A drawing tool stays active after a commit

Committing a newly drawn annotation SHALL NOT change the active tool or the
interaction mode. It SHALL still select the new annotation and, for anything
but a redaction, focus its inline comment editor.

#### Scenario: Two shapes, two drags

- GIVEN the `Box` segment is active
- WHEN the user drags out a box and then drags out a second one
- THEN two boxes exist
- AND `Box` is still the active segment
- AND no click on the toolbar was needed between them

#### Scenario: The comment editor still opens on commit

- GIVEN the `Box` segment is active
- WHEN the user drags out a box
- THEN the inline comment editor is mounted and focused for it
- AND typing goes into the comment

#### Scenario: Clicking an existing annotation still selects it

- GIVEN a drawing tool is active and at least one annotation exists
- WHEN the user clicks that annotation
- THEN it becomes the selected annotation
- AND its inline comment editor opens

### Requirement: One-key tool shortcuts

The editor SHALL bind `V`, `B`, `A`, `T`, `R` and `C` (either case, no
modifier) to Select, Box, Arrow, Text, Redact and Crop. It SHALL ignore them
while the user is typing in an input, textarea or contenteditable, and when a
Ctrl/Cmd/Alt modifier is held.

#### Scenario: A bare letter picks a tool

- GIVEN focus is on the editor page, not in a field
- WHEN the user presses `r`
- THEN `Redact` is the active segment

#### Scenario: A tool letter typed into a comment is text

- GIVEN the inline comment editor is focused
- WHEN the user types `vbatrc`
- THEN the comment reads `vbatrc`
- AND the active segment has not changed

#### Scenario: Ctrl+C is still a copy

- GIVEN focus is on the editor page
- WHEN the user presses `Ctrl+C`
- THEN the `Crop` tool is not selected

### Requirement: Stroke swatches

The toolbar SHALL offer six preset stroke colours and a custom-colour control
backed by the native colour input. Picking one SHALL change the colour of
annotations drawn afterwards and SHALL NOT change ones already drawn. The
default colour SHALL be the first swatch, `#ef4444`.

#### Scenario: The next annotation takes the picked colour

- GIVEN a box has been drawn in the default colour
- WHEN the user picks the blue swatch and draws a second box
- THEN the second box's stroke is `#3b82f6`
- AND the first box's stroke is unchanged

#### Scenario: The active swatch is marked

- GIVEN the current colour is one of the six swatches
- THEN that swatch carries a focus-ring-coloured ring and the custom disc does not
- AND when the colour is not one of them, the custom disc carries the ring instead

### Requirement: The sidebar keeps only output controls

The sidebar SHALL NOT contain an interaction, tool, zoom or colour control.

#### Scenario: The dropdowns are gone

- WHEN the editor renders
- THEN no combobox named `Interaction` or `Tool` exists
- AND the `Zoom` combobox is on the canvas toolbar
