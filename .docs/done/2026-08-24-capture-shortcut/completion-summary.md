# Completion Summary: Keyboard shortcut for one-click capture

## What Changed

Added a keyboard shortcut (`Alt+Shift+S`) to trigger full-page capture, complementing the existing toolbar icon click.

### Files Modified

1. **public/manifest.json** - Added `commands` entry:
   ```json
   "commands": {
     "_execute_action": {
       "suggested_key": { "default": "Alt+Shift+S", "mac": "Alt+Shift+S" },
       "description": "Capture the current page with Shotback"
     }
   }
   ```

2. **tests/e2e/extension.spec.ts** - Extended the "extension loads" test to verify the shortcut is present in the manifest.

3. **README.md**
   - Features: Updated "One-click capture" bullet to mention `Alt+Shift+S`
   - Usage: Added shortcut alongside toolbar icon, with note about rebinding at `chrome://extensions/shortcuts`

4. **SECURITY.md** - Added note that `commands` is not a permission, only binds a shortcut to the existing action.

5. **CLAUDE.md** - Updated "Three surfaces" section to mention the `_execute_action` shortcut binding.

## Test Results

- **Unit tests**: 82 passed
- **E2E tests**: 6/6 passed (including new shortcut assertion)
- **Lint**: passed
- **Typecheck**: passed
- **Format**: passed
- **Build**: successful

## Technical Notes

- No background code changes needed: `_execute_action` in a manifest without a popup automatically triggers `chrome.action.onClicked`
- Shortcut is platform-consistent (`Alt+Shift+S` on all platforms including macOS)
- Users can rebind the shortcut at `chrome://extensions/shortcuts` if desired

## Risks & Follow-ups

- None. This is a low-risk change that adds a platform convention (keyboard shortcut) for an existing action.
