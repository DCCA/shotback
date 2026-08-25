# Requirements

### Requirement: Status is announced over the canvas

The editor SHALL render status and progress in a single `aria-live="polite"`
toast anchored to the top-right of the canvas pane, and SHALL NOT render them
in the sidebar. A success message SHALL clear itself after 4 seconds. An error
message SHALL persist until dismissed and SHALL offer a dismiss control with a
visible focus ring. Capture progress SHALL be cleared when the capture ends,
whether it succeeded or failed.

#### Scenario: A successful copy is visible where the user is looking

- GIVEN a capture is loaded at a desktop width
- WHEN _Copy Image_ succeeds
- THEN a toast reporting it is inside the canvas pane's bounding box
- AND it is gone within 10 seconds without any interaction

#### Scenario: A capture leaves no stale progress behind

- GIVEN a full-page capture has just completed
- WHEN the editor settles
- THEN no text matching "Capturing" remains anywhere on the page

#### Scenario: The answer stays on screen below the desktop breakpoint

- GIVEN a narrow window, where the sidebar sits below the canvas and the window
  scrolls
- WHEN an export button near the bottom of the sidebar is pressed
- THEN the toast is pinned to the window rather than to the scrolled-away canvas

#### Scenario: An error waits to be read

- GIVEN an export has failed
- WHEN 4 seconds pass
- THEN the error is still shown
- AND it disappears only when its dismiss button is pressed

### Requirement: The canvas shows the crop that is in force

Once a crop is applied the canvas SHALL display only the cropped region, and
SHALL NOT dim or outline it. The SVG annotation overlay SHALL keep covering the
full capture image exactly, so annotation coordinates and pointer hit-testing
are unchanged by a crop.

#### Scenario: Apply changes what is on screen

- GIVEN a marquee drawn over part of the capture
- WHEN _Apply crop_ is pressed
- THEN the visible fraction of the capture equals the crop's fraction of it on
  both axes
- AND no marquee, dimming or resize handle remains
- AND the overlay still matches the image's box exactly

#### Scenario: Clearing restores the whole capture

- GIVEN an applied crop
- WHEN _Clear_ is pressed
- THEN the canvas shows the whole capture again
- AND the overlay still matches the image's box exactly

### Requirement: The crop's own controls live on the canvas

A marquee awaiting Apply SHALL carry eight resize handles driven by
`applyBoxResizeDelta`, and SHALL offer Apply/Cancel as floating controls at its
own corner. An applied crop SHALL be stated by a chip over the canvas. Neither
SHALL occupy a row in the sidebar.

#### Scenario: Drawing a crop does not move the sidebar

- GIVEN the Crop tool in draw mode
- WHEN a marquee is dragged out
- THEN eight handles appear on the marquee
- AND Apply/Cancel appear at the marquee's corner
- AND no control in the sidebar changes position

### Requirement: One scroller

At the `lg` breakpoint and above the editor SHALL fill the window without
scrolling it; the sidebar column and the capture's scrollport SHALL each scroll
their own contents. Below `lg` the canvas SHALL come first visually, the
sidebar after it, and the window SHALL scroll normally.

#### Scenario: The window does not scroll at 1280x900

- GIVEN a capture taller than the pane, at 1280x900
- WHEN the editor is measured
- THEN `document.documentElement.scrollHeight` is no greater than
  `window.innerHeight`
- AND `#capture-viewport` has more scroll height than client height

#### Scenario: DOM order is unchanged

- GIVEN the visual order flips below `lg`
- WHEN the DOM is inspected
- THEN the sidebar is still the first child of `main`
- AND the tab and screen-reader order is unchanged
