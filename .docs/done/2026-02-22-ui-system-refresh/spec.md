# Spec: UI System Refresh (Tailwind + shadcn-style components)

### Requirement: Shared UI Foundation
The system SHALL provide a shared utility-first styling foundation and reusable component primitives for extension surfaces.

#### Scenario: Common styling
- GIVEN popup, editor, and viewer UIs
- WHEN UI code is reviewed
- THEN each surface uses shared primitives and tokenized styles
- AND ad hoc surface-specific styling is reduced

### Requirement: Behavior Preservation
The system MUST preserve existing functional behavior while refactoring UI presentation.

#### Scenario: Editor interactions
- GIVEN a user drawing, moving, and editing annotations
- WHEN the UI refresh is applied
- THEN interaction behavior remains functionally equivalent
- AND control actions still trigger existing logic paths

### Requirement: Responsive Layouts
The system SHOULD remain usable on constrained widths and desktop widths.

#### Scenario: Narrow viewport
- GIVEN the editor UI on narrow width
- WHEN layout is rendered
- THEN controls and workspace remain accessible without overlap

### Requirement: Validation
The system SHALL pass existing tests/build checks after UI refactor.

#### Scenario: Verification
- GIVEN updated UI code
- WHEN `npm run test` and `npm run build` are executed
- THEN both commands complete successfully
