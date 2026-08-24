# Spec: a11y audit fixes

### Requirement: Light-mode muted text clears WCAG AA contrast

`--muted-foreground` in the light `:root` block SHALL have a contrast ratio
of at least 4.5:1 against `--muted`, `--background` and `--card`. Dark-theme
tokens (`.dark` and the mirrored `@media (prefers-color-scheme: dark)`
block) SHALL be unchanged.

#### Scenario: Muted help text in the sidebar

- GIVEN the editor in light mode
- WHEN a `text-muted-foreground` element is painted on `bg-muted`,
  `bg-background` or `bg-card`
- THEN the rendered contrast is at least 4.5:1

#### Scenario: Dark theme untouched

- GIVEN `tests/theme-tokens.test.ts`'s equality check between `.dark` and
  the media-query block
- WHEN the light-mode fix lands
- THEN that test still passes unmodified

### Requirement: Reduced motion is honoured, without hiding state changes

The editor UI SHALL suppress the button press-scale effect and the select
chevron's rotation animation under `prefers-reduced-motion: reduce`, and
SHALL shorten colour/box-shadow transitions to 0ms rather than removing the
underlying state change. The on-page capture notice's spinner SHALL render
as a static ring (no `animation`) under the same media query.

#### Scenario: Button press effect removed

- GIVEN `prefers-reduced-motion: reduce` is emulated
- WHEN a button is inspected via `getComputedStyle`
- THEN its transition duration is `0s` and no `transform: scale(...)` is
  applied on `:active`

#### Scenario: Select chevron rotation removed

- GIVEN `prefers-reduced-motion: reduce`
- WHEN the select trigger's chevron `<svg>` is inspected
- THEN its `transition-property` is `none`

#### Scenario: Capture notice spinner is static

- GIVEN a page under capture with `prefers-reduced-motion: reduce`
  emulated and `SB_CAPTURE_BEGIN` sent
- WHEN the spinner element (`[data-shotback-spinner]`) is inspected
- THEN its computed `animationName` is `none`

### Requirement: Saved-share checkbox meets the 24x24 target size

Every saved-share row's checkbox SHALL have an effective clickable/tappable
area of at least 24x24 CSS px (WCAG 2.5.8), without growing the visible tick
control itself, and SHALL keep its existing `aria-label`.

#### Scenario: Checkbox bounding box

- GIVEN the saved-shares panel is open with at least one saved share
- WHEN the checkbox's wrapping `<label>` bounding box is measured
- THEN its width and height are each at least 24px

### Requirement: Annotation canvas has an accessible name and async image decoding

The interactive `<svg>` annotation surface SHALL carry `role="group"` and an
`aria-label` describing that drawing requires a pointer and annotations are
manageable from the comment timeline. The captured-page `<img>` SHALL set
`decoding="async"`.

#### Scenario: Canvas accessible name

- GIVEN a capture is loaded in the editor
- WHEN the annotation `<svg>` is inspected
- THEN it has `role="group"` and a non-empty `aria-label`
