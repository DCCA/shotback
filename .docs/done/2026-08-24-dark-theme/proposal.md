# Proposal: Finish the Dark Theme

## Why

`src/styles/globals.css` has carried a `.dark` token block since the UI system refresh, but nothing ever applied it: no code sets `class="dark"` and there was no `prefers-color-scheme` rule, so the extension was light-only regardless of the user's OS setting. Worse, the editor and viewer still used literal Tailwind palette classes (`text-slate-*`, `border-slate-*`, `bg-white`, `emerald-*`, `red-*`) instead of the semantic tokens, so even when the dark tokens were forced on, four action buttons rendered with near-invisible labels and the helper/status text disappeared. The screenshots in `.docs/reviews/2026-08-23-product-review.md` show it.

## Goal

Dark mode works, automatically, with every control legible - and stays that way.

## Scope

- Apply the dark tokens from `@media (prefers-color-scheme: dark)` as well as from `class="dark"`; let `class="light"` force light back on.
- Make the decorative body gradients token-driven (`--glow-1`/`--glow-2` + alpha) so they do not glare in dark.
- Replace every literal colour class in `src/editor/*.tsx` and `src/viewer/main.tsx` with the matching semantic token.
- Correct the dark values of `--primary` and `--destructive`, which were too dark to read as text on a dark card.
- Tokenise the card elevation colours (`--card-highlight`, `--card-shadow`), which were hardcoded white/near-black in `card.tsx`.
- Add an e2e regression test that fails on any illegible control in dark.

## Out of Scope

- A user-facing theme toggle (the OS preference and the `dark`/`light` classes are the whole mechanism).
- Any layout, spacing or component-structure change.
- The annotation colours drawn onto the screenshot itself (they belong to the captured page, not the app chrome).
