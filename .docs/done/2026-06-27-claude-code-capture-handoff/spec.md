# Spec: Frictionless Capture → Claude Code Handoff

## Change A — One-Click Capture

### Requirement: Toolbar Icon Opens Editor And Auto-Captures
Clicking the extension toolbar icon SHALL open the editor for the active tab and SHALL start full-page capture automatically, with no intermediate popup.

#### Scenario: Single click captures
- GIVEN a normal web page in the active tab
- WHEN the user clicks the Shotback toolbar icon
- THEN the editor opens in a new tab targeting that page
- AND full-page capture begins automatically without a further click

#### Scenario: Non-injectable page
- GIVEN the active tab is a restricted page (e.g. `chrome://`) capture cannot inject into
- WHEN the user clicks the toolbar icon and the editor auto-capture runs
- THEN the editor surfaces the existing capture error status
- AND no unhandled error is thrown

### Requirement: Auto-Capture Fires Once
The editor SHALL trigger auto-capture at most once per editor load and SHALL keep the manual capture control for re-capture.

#### Scenario: Re-capture still manual
- GIVEN the editor has auto-captured on load
- WHEN the user wants a fresh capture
- THEN they use the existing Capture button
- AND auto-capture does not re-fire on its own

## Change B — Copy For Claude Code

### Requirement: Copy For Claude Code Output
The editor SHALL provide a "Copy for Claude Code" action, in addition to the two existing outputs, that saves the annotated image and copies a Claude-ready prompt referencing the saved file's path.

#### Scenario: Copy after capture
- GIVEN a captured image (with or without annotations)
- WHEN the user clicks "Copy for Claude Code"
- THEN the annotated PNG is saved under `Downloads/shotback/`
- AND the clipboard contains a prompt that references the saved file by path
- AND the prompt includes the page URL and any area comments / general feedback

#### Scenario: No capture yet
- GIVEN no screenshot has been captured
- WHEN the user clicks "Copy for Claude Code"
- THEN an error status explains a capture is required first
- AND nothing is written to the clipboard

### Requirement: Windows-To-WSL Path Translation
The saved file's absolute path MUST be translated from a Windows drive path to its WSL mount equivalent; non-Windows (already-POSIX) paths MUST be passed through unchanged.

#### Scenario: Windows drive path
- GIVEN the saved file resolves to `C:\Users\dcca\Downloads\shotback\cap-….png`
- WHEN the path is prepared for the prompt
- THEN it becomes `/mnt/c/Users/dcca/Downloads/shotback/cap-….png`
- AND the drive letter is lowercased and backslashes become forward slashes

#### Scenario: POSIX path
- GIVEN the saved file resolves to `/home/dcca/Downloads/shotback/cap-….png`
- WHEN the path is prepared for the prompt
- THEN it is used unchanged

### Requirement: Resilient Path Resolution
If the saved file's absolute path cannot be resolved, the action MUST still copy a usable prompt referencing the relative `Downloads/shotback/<name>.png` location and MUST signal a non-success status rather than report success.

#### Scenario: Path unresolved
- GIVEN the download completes but its absolute path cannot be read within a short timeout
- WHEN the action finishes
- THEN the clipboard prompt references the relative `Downloads/shotback/<name>.png`
- AND the status indicates the path could not be fully resolved
