# Proposal: Frictionless Capture → Claude Code Handoff

## Why
Two recurring friction points when feeding a screenshot to a Claude Code session:

1. **Wrong artifact.** The "Copy Local Share Link" output produces a `chrome-extension://…/viewer.html?share=…` URL. That URL is profile-scoped and unreadable by an LLM. When Claude Code runs in **WSL** and the browser runs in **Windows**, the only thing Claude can actually read is a file on disk — and the Windows Downloads folder is visible from WSL at `/mnt/c/…`. Today the user must manually hunt down that path.
2. **Too many clicks.** Capturing takes: click toolbar icon → popup → "Open Capture Editor" → editor → "Capture". The popup adds a step whose only job is to open the editor.

## Scope
- **Change A — One-click capture.** Remove the popup. Clicking the toolbar icon opens the editor and immediately starts full-page capture of the originating tab.
- **Change B — Copy for Claude Code.** A new editor output that saves the annotated PNG to `Downloads/shotback/`, resolves its absolute on-disk path, translates a Windows path (`C:\…`) to a WSL path (`/mnt/c/…`), and copies a ready-to-paste Claude Code prompt (path + page URL + comments) to the clipboard.

## Out of Scope
- Native-messaging hosts or local HTTP servers (no new processes; extension keeps making no network requests of its own).
- Configurable WSL mount root / settings UI (hardcode `/mnt`, auto-detect drive; non-Windows paths pass through unchanged).
- Changing the two existing outputs (Copy Local Share Link, Prepare for Cloud LLM) — both stay as-is.
- A keyboard command for capture.
