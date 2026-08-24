<div align="center">

# 📸 Shotback

### A Chrome extension for AI-assisted screenshot reviews: capture a full page, annotate specific areas, keep a timeline of comments, and prepare feedback for humans or LLMs.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green.svg)](https://developer.chrome.com/docs/extensions/)

</div>

---

## 🎯 Why Shotback

Shotback is optimized for **local-first review workflows**. You can annotate UI issues quickly, preserve context with area-linked comments, and keep feedback organized before sending to a teammate or an LLM.

It is useful when a product/design review needs more context than a plain screenshot but less ceremony than a full ticketing workflow.

## 🧠 Product Workflow

Shotback turns visual feedback into a compact review artifact:

1. capture the real page state;
2. mark the exact UI areas that need attention;
3. attach comments to each annotation;
4. keep a timeline of feedback decisions; and
5. export a structured prompt + image for cloud LLM review when local links are not accessible.

This keeps human feedback and AI review grounded in the same visual evidence.

## ✨ Features

- ⚡ **One-click capture** - clicking the toolbar icon or pressing `Alt+Shift+S` opens the editor and captures immediately (no popup, no second click)
- 📷 **Full-page capture** (`scroll + stitch`) with an on-page "Capturing…" notice so you know not to switch tabs or scroll
- 🔍 **Fit-to-width by default** (shrink to fit, never upscale a narrower capture), with a **1:1 zoom toggle** for pixel-exact inspection - a capture wider than the pane never runs off the edge or scrolls the page; 1:1 mode scrolls its own pane instead
- ✏️ **Area annotations**: box, arrow, text
- 🔗 **Linked comments** tied to selected annotation
- ⏱️ **Comment timeline** with per-item remove
- ↩️ **Undo / redo** for every edit (draw, move, resize, comment, delete) - sidebar buttons or `Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z` (`Ctrl+Y` also redoes)
- 💬 **General feedback** for screenshot-level notes
- 🔐 **Local share links** (`chrome-extension://.../viewer.html?share=...`)
- 🤖 **External LLM fallback**:
  - downloads annotated image
  - copies a structured prompt to clipboard
- 🧑‍💻 **Copy for Claude Code** - saves the PNG to `Downloads/shotback/` and copies a prompt referencing it by path (Windows → WSL `/mnt/c/...` translation) so a Claude Code session can read it directly
- 📋 **Copy Image** - puts the annotated PNG straight on the clipboard for pasting into any chat
- 🧭 **Environment context** - both prompts carry the captured tab's title, viewport, pixel ratio, colour scheme, scroller and user agent, so an agent never has to ask

## 🚀 Quick Start

### 1️⃣ Install dependencies

```bash
npm install
```

### 2️⃣ Build extension

```bash
npm run build
```

### 3️⃣ Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist/` folder

## 📖 Usage

1. **Open** a target webpage.
2. **Click** the Shotback extension icon, or press `Alt+Shift+S` - the editor opens and captures the page automatically. (You can rebind the shortcut at `chrome://extensions/shortcuts`.)
3. **Draw** annotations and add comments. Undo or redo any step with the sidebar buttons or `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z`.
4. **Use** one of the outputs:
   - **Copy Local Share Link** for local profile review
   - **Prepare for Cloud LLM** for external LLMs (prompt + image download)
   - **Copy for Claude Code** saves the PNG to `Downloads/shotback/` and copies a prompt that points to the file by path (a Windows path is translated to its WSL `/mnt/c/...` equivalent), so a Claude Code session can read it directly
   - **Copy Image** puts the annotated PNG on the clipboard - paste it straight into an agent chat

   Both prompt outputs include an **Environment** block describing the captured
   tab (page title, viewport size, device pixel ratio, colour scheme, whether
   the document or an inner element scrolled, user agent and capture time).

## 📁 Project Structure

```text
src/
  editor/      # annotation editor UI (opened by the toolbar icon)
  viewer/      # local share viewer page
  lib/         # capture, rendering, storage helpers
  types/       # shared TS types
public/
  manifest.json
tests/
  capture.test.ts
.docs/
  PRD, todo/doing/done workflow docs
```

## 🛠️ Development Commands

| Command             | Description                                     |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | Run Vite dev server                             |
| `npm run build`     | Production build to `dist/`                     |
| `npm run test`      | Run unit tests (Vitest)                         |
| `npm run typecheck` | Type-check with `tsc --noEmit`                  |
| `npm run lint`      | Lint with ESLint                                |
| `npm run format`    | Format with Prettier (`format:check` to verify) |
| `npm run check`     | Run typecheck + lint + test + build             |
| `npm run preview`   | Preview production build                        |

## ⚠️ Local Link Constraint

Local share links are **intentionally local**. They only work where:

- ✅ the extension is installed
- ✅ the share exists in that browser profile's `chrome.storage.local`

> **Note:** For cloud LLM tools that cannot access local links, use **Prepare for Cloud LLM**.

## 🔐 Permissions & Privacy

Shotback is local-first and makes **no network requests of its own**. Captured
images, annotations, and feedback stay in your browser profile. Data leaves the
device only when you explicitly use **Prepare for Cloud LLM**, which downloads
the annotated image and copies a prompt for you to paste manually.

It requests only the permissions full-page capture needs - `activeTab`, `tabs`,
`scripting`, `storage`/`unlimitedStorage`, and `<all_urls>` host access so it can
capture whatever page you are viewing. Page access is used **only when you start
a capture**. See [`SECURITY.md`](SECURITY.md) for the full per-permission
rationale.

## 🤝 Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## 📄 License

MIT ([`LICENSE`](LICENSE)).
