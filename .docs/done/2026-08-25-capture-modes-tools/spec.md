# Spec: capture modes, highlight and pen tools

### Requirement: Visible-area capture

`captureFullPage` with `mode: "visible"` SHALL capture exactly the frame that
is on screen and MUST NOT scroll the target page.

#### Scenario: A tall page captured in visible mode

- GIVEN a page whose document is 2400 px tall in an 800 px viewport
- WHEN the editor captures it with `mode: "visible"`
- THEN the stitched image is 800 px tall
- AND no `SB_SCROLL_TO` message is sent to the page

#### Scenario: No notice for an instant grab

- GIVEN a visible-mode capture with no delay
- WHEN it runs
- THEN no capture notice is shown on the page
- AND the page's scrollbars are still hidden for the frame and restored after

### Requirement: Delayed capture

A capture with `delaySeconds > 0` SHALL count the delay down in the on-page
notice, one whole second per text update, before taking any frame. The
countdown MUST NOT animate.

#### Scenario: Three-second delay

- GIVEN the chooser is on "Full page after 3s"
- WHEN Capture Page is pressed
- THEN the page's notice reads "Capturing in 3...", then "2...", then "1..."
- AND the full-page frames are taken only after that
- AND the notice is removed when the capture finishes

### Requirement: Capture modes are editor-side only

The toolbar icon and its keyboard shortcut SHALL always run a full-page
capture.

#### Scenario: One-click capture

- GIVEN the editor is opened with `autocapture=1`
- WHEN the auto-capture fires
- THEN it runs in full-page mode with no delay, whatever the chooser shows

### Requirement: Highlight annotations

A highlight SHALL be a rectangle filled with the annotation colour at 35%
opacity composited `multiply`, plus a full-opacity edge, and SHALL behave as a
note-carrying annotation: numbered, commentable, inspectable, resizable and
draggable.

#### Scenario: Legible over dark page content

- GIVEN a highlight drawn over a near-black section of the capture
- WHEN it renders on the canvas and in the export
- THEN the multiply wash leaves that region near-black
- AND the region is still marked, by its full-opacity edge

#### Scenario: In the outputs

- GIVEN a highlight with the comment "read this"
- WHEN a prompt is built at `standard` verbosity
- THEN it carries `N. [highlight] read this - at (x, y) size WxH px [..% of page]`
- AND the sidecar lists it with the same number and that rect

### Requirement: Pen annotations

A pen stroke SHALL store the pointer path, thinned to a point roughly every 3
px, and SHALL be pinned, cropped and described from the bounds of those points.

#### Scenario: Drawing one

- GIVEN the Pen tool is active
- WHEN the pointer is dragged across the canvas and released
- THEN one pen annotation is added, with more than two points
- AND its inline comment editor opens focused, like a box's

#### Scenario: A click that never moved

- GIVEN the Pen tool is active
- WHEN the pointer is pressed and released without moving
- THEN no annotation is added

#### Scenario: Cropped

- GIVEN a pen stroke with one point inside a crop and one outside
- WHEN the crop is applied
- THEN the stroke survives, with every point shifted by the crop origin
- AND the point outside is NOT clamped onto the crop edge

#### Scenario: In the prompt

- GIVEN a pen stroke of 2 points with the comment "scribble"
- WHEN a prompt is built at `standard` verbosity
- THEN it carries
  `N. [pen] scribble - pen path of 2 points from (x1, y1) to (x2, y2) px [..% of page]`

### Requirement: Palette segments

The palette SHALL offer `Highlight` (`H`) and `Pen` (`P`) between Text and
Redact, under the same guards as every other segment.

#### Scenario: Hotkeys behave like the rest

- GIVEN a capture is on the canvas and focus is in the inline comment box
- WHEN "h" and "p" are typed
- THEN they are text, not tool switches

#### Scenario: The palette never widens the canvas

- GIVEN a canvas pane narrower than the palette's eight segments
- WHEN the editor renders
- THEN the palette wraps onto further rows
- AND the canvas card's `scrollWidth` does not exceed its `clientWidth`
