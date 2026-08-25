# Spec: README and docs appeal pass

### Requirement: The README leads with what the product looks like

The README MUST show a real screenshot of the editor above the fold, generated
from the actual built extension, in both light and dark themes.

#### Scenario: First visit

- GIVEN a visitor opens the repository page
- WHEN the README renders
- THEN a hero screenshot of the editor with real annotations is visible before
  any feature list
- AND the tagline states the product's job in one sentence

### Requirement: Features are scannable

Feature documentation MUST be grouped under a small number of headed sections
(capture, annotate, protect, hand off) with one line per feature, and MAY link
deeper detail to the Usage section rather than inlining it.

#### Scenario: Skimming

- GIVEN a visitor skims the features
- WHEN they read only bullet first-lines
- THEN every major capability is discoverable without reading a paragraph

### Requirement: Docs stay accurate

Every statement kept or added MUST match current behaviour (Escape discards a
note draft; keyboard annotation creation exists; the e2e suite exists; the
project structure lists the real directories).

#### Scenario: Keyboard section

- GIVEN the Usage section's keyboard notes
- WHEN compared with the shipped editor
- THEN Escape's discard behaviour and Enter placement are described correctly
