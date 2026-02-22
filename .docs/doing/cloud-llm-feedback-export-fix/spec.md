# Spec: Cloud LLM Feedback Export Fix

### Requirement: General Feedback Presence
The system SHALL include general feedback text in exported annotated images when feedback is non-empty.

#### Scenario: Standard sized image
- GIVEN a captured image where footer append is within safe canvas limits
- WHEN export is generated
- THEN general feedback appears in a footer section below the screenshot

### Requirement: Canvas Limit Fallback
The system MUST preserve general feedback visibility when footer append would exceed safe canvas limits.

#### Scenario: Very tall image
- GIVEN a captured image where image height plus footer height exceeds configured safe limits
- WHEN export is generated
- THEN general feedback is rendered as an in-image overlay card
- AND export succeeds without dropping feedback text

### Requirement: Export Path Consistency
The system SHOULD apply the same feedback rendering behavior for both local share export and cloud LLM export.

#### Scenario: Shared export logic
- GIVEN both export actions call the same annotation export helper
- WHEN rendering mode is selected
- THEN the same footer/overlay rule is used for both actions
