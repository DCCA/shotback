# Proposal: Keyboard shortcut for one-click capture

## Why

Users can already trigger capture by clicking the toolbar icon. Adding a keyboard shortcut (`Alt+Shift+S`) enables faster, hands-free capture without reaching for the mouse, improving the workflow especially for rapid feedback sessions.

## Scope

Add keyboard shortcut support via Chrome manifest `commands` entry:
- Manifest: add `_execute_action` command bound to `Alt+Shift+S`
- No code changes needed (reuses existing `chrome.action.onClicked` handler)
- Documentation: update README, SECURITY.md, CLAUDE.md
- Test: verify shortcut appears in the manifest
