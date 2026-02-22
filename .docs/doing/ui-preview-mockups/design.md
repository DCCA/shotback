# Design: UI Preview Mockups Before Refactor

## Approach
- Add static HTML/CSS mockups under `.docs/tmp/ui-preview/`.
- Use a shared tokenized stylesheet with shadcn-inspired primitives:
  - cards, buttons, muted text, badges, section headers, and list rows.
- Model the current product structure:
  - Popup: launch action card.
  - Editor: left control panel + canvas workspace shell.
  - Viewer: metadata summary + shared image card.

## Constraints
- No changes to `src/` runtime files.
- Keep artifacts lightweight and easy to remove after sign-off.
