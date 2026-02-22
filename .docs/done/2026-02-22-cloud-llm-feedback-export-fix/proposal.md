# Proposal: Cloud LLM Feedback Export Fix

## Why
For very tall screenshots, exported images from "Prepare for Cloud LLM" can miss the general feedback block.

## Scope
- Ensure general feedback is always rendered in exported annotated images.
- Add a fallback rendering mode when appending a footer would exceed safe canvas limits.
- Add tests for render-mode selection logic.

## Out of Scope
- Editor UI changes.
- Annotation tool behavior changes.
