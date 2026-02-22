# Design: UI System Refresh (Tailwind + shadcn-style components)

## Approach
1. Add Tailwind + PostCSS configuration and a shared global stylesheet with design tokens.
2. Add shadcn-style utility + primitives:
   - `Button`, `Card`, `Input`, `Textarea`, `Select`, `Badge`, `Separator`.
3. Refactor:
   - `src/popup/main.tsx`
   - `src/editor/main.tsx`
   - `src/viewer/main.tsx`
4. Keep existing app state and action handlers unchanged.

## Visual Direction
- Light, neutral surfaces with clear hierarchy.
- Strong primary accent (`emerald` family) for key calls-to-action.
- Consistent spacing, rounded corners, and focus rings.

## Compatibility
- Tailwind utility classes are applied directly in TSX.
- Existing CSS files for popup/editor/viewer are removed or no longer imported.
