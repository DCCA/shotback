# Proposal: make the README and docs more appealing

## Why

The README is accurate but reads as walls of text: a 25-bullet feature list with
paragraph-length bullets, no screenshots, and an opening that buries the pitch.
A first-time visitor cannot see what the product looks like or why it exists
without reading several screens. The user asked for a review of the docs and
README for appeal; per the working agreement, review means review and fix.

## Scope

- Rewrite README.md: sharper pitch, hero screenshots (light + dark, generated
  from the real built extension), features grouped into scannable sections,
  stale content corrected (project structure, keyboard behaviour after the
  Escape-discard change, missing e2e/keyboard-access mentions).
- Add the screenshots under docs/media/.
- Light accuracy touch-ups to CONTRIBUTING.md (e2e command, current gate).
- SECURITY.md, PRIVACY.md, AGENTS.md, FIREHOSE.md unchanged: their value is
  precision, not appeal, and they read well.

## Non-goals

No behaviour or code changes; no restructuring of .docs/.
