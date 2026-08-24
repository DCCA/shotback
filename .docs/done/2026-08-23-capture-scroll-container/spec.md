# Spec: capture the real scroller

### Requirement: Detect the scrolling element

The content script SHALL scroll the document when it is scrollable, and
otherwise SHALL scroll the largest element whose `overflow-y` is `auto` or
`scroll`, whose `scrollHeight` exceeds its `clientHeight`, and whose
`clientHeight` is at least half the viewport.

#### Scenario: document scrolls

- GIVEN a page whose `documentElement.scrollHeight` exceeds `innerHeight`
- WHEN metrics are requested
- THEN `fullHeight` is the document scroll height, `viewportHeight` is
  `innerHeight`, and `scrollerTop` is 0

#### Scenario: inner scroll container

- GIVEN `html,body{height:100%;overflow:hidden}` and a `<div>` with
  `overflow:auto` holding 2400 px of content in a 493 px viewport
- WHEN a full-page capture runs
- THEN the stitched image is 2400 px tall and every viewport of content is
  present in order

### Requirement: Scroll instantly

Capture scrolls MUST use `behavior: "instant"` so `scroll-behavior: smooth`
on the page does not delay the scroll past the frame capture.

#### Scenario: smooth-scroll page

- GIVEN `html{scroll-behavior:smooth}` and 2400 px of content
- WHEN a full-page capture runs
- THEN each stitched viewport shows the content at its own offset (no
  repeated content from the previous frame)

### Requirement: Keep chrome above an inner scroller once

When the scroller starts below the viewport top, frames after the first MUST
be cropped to the scroller's rows before stitching.

#### Scenario: header above scroller

- GIVEN a scroller whose top is at 64 px with `clientHeight` 436 px
- WHEN the frame at scroll offset 436 is placed
- THEN source rows 64..500 are drawn at destination row 500
