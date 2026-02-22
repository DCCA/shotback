# Spec: UI Preview Mockups Before Refactor

### Requirement: Isolated Visual Preview
The project SHALL provide static, non-production mockups for the popup, editor, and viewer UIs.

#### Scenario: Review before implementation
- GIVEN a reviewer wants to approve visual direction first
- WHEN preview artifacts are opened
- THEN each major extension surface is represented with updated styling
- AND no production runtime code behavior is changed

### Requirement: Reviewability
The project SHOULD provide straightforward review instructions for the mockups.

#### Scenario: Local review
- GIVEN a developer in the repository
- WHEN they follow preview instructions
- THEN they can open and inspect each mockup page locally
