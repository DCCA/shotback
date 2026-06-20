# Spec: World-Class Hardening Sweep

### Requirement: Enforced type-checking

The build pipeline SHALL fail when TypeScript reports type errors.

#### Scenario: Type error is introduced

- GIVEN a change that introduces a TypeScript type error
- WHEN CI runs
- THEN `npm run typecheck` fails and the pipeline is red

### Requirement: Clean dependency audit

The project SHALL carry no known high or critical dependency vulnerabilities.

#### Scenario: Audit gate

- GIVEN the installed dependency tree
- WHEN `npm audit --audit-level=high` runs in CI
- THEN it reports no high or critical advisories

### Requirement: Minimal web-exposed surface

The extension SHALL NOT expose resources to web origins that it does not need.

#### Scenario: No web-accessible resources

- GIVEN the built `dist/manifest.json`
- WHEN it is inspected
- THEN `web_accessible_resources` is absent
- AND the editor/viewer/popup still load their own assets

### Requirement: Editor keyboard shortcuts

The editor SHALL let users deselect and delete annotations via the keyboard,
without interfering with text entry.

#### Scenario: Delete selected annotation

- GIVEN an annotation is selected and focus is not in a text field
- WHEN the user presses Delete or Backspace
- THEN the selected annotation is removed

#### Scenario: Typing a comment is unaffected

- GIVEN the comment editor is focused
- WHEN the user presses Backspace
- THEN the character is deleted from the comment, not the annotation
