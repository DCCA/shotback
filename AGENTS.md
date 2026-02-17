# Repository Guidelines

## Project Structure & Module Organization
This repository contains a Chrome extension built with TypeScript, React, and Vite.

- `src/popup/`: extension popup entry UI.
- `src/editor/`: capture/annotation editor UI.
- `src/viewer/`: local share viewer page.
- `src/lib/`: capture, render, and local storage helpers.
- `src/types/`: shared type definitions.
- `public/manifest.json`: MV3 extension manifest.
- `tests/`: Vitest unit tests.
- `.docs/`: project planning docs (`PRD`, `todo/doing/done`).

## Build, Test, and Development Commands
- `npm install`: install dependencies.
- `npm run dev`: start Vite dev server.
- `npm run build`: build extension output in `dist/`.
- `npm run test`: run unit tests.
- `npm run preview`: preview production build.

To test in Chrome, load unpacked extension from `dist/` via `chrome://extensions`.

## Coding Style & Naming Conventions
- Language: TypeScript with clear, explicit logic.
- Keep modules focused and easy to reason about.
- Use `kebab-case` for file names and descriptive identifiers.
- Prefer small, reviewable changes over broad refactors.

## Testing Guidelines
- Test framework: Vitest.
- Place tests in `tests/` using `*.test.ts` naming.
- Minimum pre-PR checks:
  - `npm run test`
  - `npm run build`
- For UI changes, manually verify:
  - capture flow
  - annotation create/move/delete
  - timeline behavior
  - local share viewer
  - external LLM fallback

## Commit & Pull Request Guidelines
- Use concise, imperative commit messages (for example: `feat: improve timeline actions`).
- Keep each commit scoped to one logical change.
- PRs should include:
  - what changed and why
  - validation steps/results
  - screenshots for UI updates

## Security & Configuration Tips
- Do not commit secrets or personal data.
- Keep `.gitignore` current for local artifacts.
- Local share links (`chrome-extension://...`) are intentionally profile-scoped and not public web links.
