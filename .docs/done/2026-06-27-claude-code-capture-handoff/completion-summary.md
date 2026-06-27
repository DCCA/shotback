# Completion Summary: Frictionless Capture → Claude Code Handoff

Shipped as two sequential PRs off `main`.

## Change A — One-click capture (PR #8)

- Removed the popup. The toolbar icon now fires `chrome.action.onClicked`
  (`src/background.ts`), opening the editor with `?tabId=&windowId=&autocapture=1`.
- The editor runs a one-shot, ref-guarded auto-capture effect on load; the manual
  Capture button remains for re-capture.
- Dropped the `popup` entry from `vite.config.ts` and the Tailwind content glob;
  deleted `popup.html` + `src/popup/`. Synced `CLAUDE.md`, `AGENTS.md`, `README.md`.

## Change B — Copy for Claude Code (PR #9)

- New third editor output saves the annotated PNG to `Downloads/shotback/` via
  `chrome.downloads`, reads back its absolute path, and copies a Claude-ready
  prompt referencing the file.
- `src/lib/wslPath.ts` `toClaudePath()` translates a Windows drive path to its WSL
  `/mnt/<drive>/…` mount (lowercased drive, `\`→`/`); POSIX paths pass through.
- `src/lib/feedback.ts` `buildClaudeCodePrompt()` shares comment formatting with
  `buildExternalLlmPrompt`.
- Added the `downloads` permission (rationale in `SECURITY.md`).
- If the absolute path can't be resolved, falls back to the relative
  `Downloads/shotback/<name>.png` and reports a non-success status.

## Validation

- `npm run check` + `format:check` green on both PRs; CI green before each merge.
- Tests: 34 → 42 passing (`tests/wslPath.test.ts` + extended `tests/feedback.test.ts`).
- Dogfooded the `dist/` build: manifest reflects no popup / added `downloads`
  permission; bundles contain `onClicked`, `autocapture`, `chrome.downloads`,
  `/mnt/`, and the new prompt text.

## Deferred

- Live in-browser smoke test (load unpacked → click icon → editor auto-captures →
  annotate → Copy for Claude Code → paste path into a WSL Claude Code session and
  confirm the file reads). Not runnable in CI; track in the next manual QA pass.
