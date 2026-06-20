# Spec: Box Resize After Creation

### Requirement: Resizable Box Annotations
The editor SHALL allow users to resize an existing box annotation after it is created.

#### Scenario: Resize from a corner or edge
- GIVEN a captured image with at least one box annotation
- WHEN the user selects the box in move mode and drags a resize handle
- THEN the box dimensions update live based on pointer movement
- AND the selected box remains selected during the resize

### Requirement: Opposite-Side Crossing
The resize interaction MUST continue when a dragged handle crosses the opposite side of the box.

#### Scenario: Horizontal crossing
- GIVEN a selected box and an active west or east handle drag
- WHEN the pointer crosses the opposite horizontal edge
- THEN the box continues resizing without interruption
- AND box coordinates remain normalized (non-negative width)

#### Scenario: Vertical crossing
- GIVEN a selected box and an active north or south handle drag
- WHEN the pointer crosses the opposite vertical edge
- THEN the box continues resizing without interruption
- AND box coordinates remain normalized (non-negative height)

### Requirement: Resize Constraints
The editor MUST enforce a minimum box size and SHOULD keep resized boxes within image bounds.

#### Scenario: Minimum size
- GIVEN a selected box being resized
- WHEN the drag would shrink width or height below the minimum
- THEN the resulting dimension is clamped at the minimum

#### Scenario: Bounds
- GIVEN a selected box being resized
- WHEN the drag would move box edges outside the image canvas
- THEN the resized box is clamped to the image bounds

### Requirement: Existing Behaviors Preserved
The editor SHALL preserve existing move behavior for box body drags and SHALL keep annotation comment editing functional.

#### Scenario: Move vs resize
- GIVEN a selected box in move mode
- WHEN the user drags inside the box body
- THEN the box moves (not resizes)
- AND resize starts only when a handle is dragged
