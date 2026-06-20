# Proposal: Box Resize After Creation

## Why
Users can draw a box annotation, but cannot resize it after creation. This makes corrections slower and forces delete/recreate loops.

## Scope
- Add post-creation resize for box annotations in move mode.
- Support edge/corner handles and drag interaction.
- Support crossing over opposite edges while resizing.
- Preserve existing move, comment, and export/share flows.

## Out of Scope
- Resizing arrows or text annotations.
- Keyboard resize shortcuts.
- Non-box transform features (rotate/scale all).
