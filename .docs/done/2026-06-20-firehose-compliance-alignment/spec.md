# Spec: FIREHOSE Compliance Alignment

### Requirement: Doing Folder Structure
The project SHALL track each active change in a dedicated folder under `.docs/doing/<change-name>/`.

#### Scenario: Active change folder exists
- GIVEN an active non-trivial change
- WHEN documentation is prepared
- THEN a folder under `.docs/doing/` exists for that change
- AND it contains `proposal.md`, `spec.md`, `design.md`, and `tasks.md`

### Requirement: Requirements Format
The active change spec MUST use RFC 2119 requirement language and include Given/When/Then scenarios.

#### Scenario: Spec document validation
- GIVEN a `spec.md` file in an active change folder
- WHEN the file is reviewed
- THEN it contains at least one requirement with `MUST` or `SHALL`
- AND each requirement includes at least one Given/When/Then scenario

### Requirement: Legacy Tracker Removal
The system SHOULD remove or replace legacy single-file `.docs/doing` trackers to avoid process drift.

#### Scenario: Legacy format found
- GIVEN a legacy file like `.docs/doing/current-task.md`
- WHEN compliance alignment is applied
- THEN the legacy file is removed or deprecated in favor of folder-based tracking
