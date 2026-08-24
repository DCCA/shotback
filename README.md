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
- 🕶️ **Redact before sharing** - drag the Redact tool over anything private and it is pixelated into every export _and_ into the saved share, before either is written. It carries no comment and is never numbered; the prompts say only `Redacted regions: N`. The unredacted capture lives only in that editor tab, so closing it is final
- ✂️ **Crop before export** - draw a region with the Crop tool and every output (image, prompts, JSON sidecar, share) covers just that region, with annotation coordinates measured from it; annotations outside it drop out, and **Clear** brings the whole capture back
- 🔗 **Linked comments** tied to selected annotation
- ⏱️ **Comment timeline** with per-item remove
- ↩️ **Undo / redo** for every edit (draw, move, resize, comment, delete) - sidebar buttons or `Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z` (`Ctrl+Y` also redoes)
- 💬 **General feedback** for screenshot-level notes
- 🔐 **Local share links** (`chrome-extension://.../viewer.html?share=...`)
- 🤖 **External LLM fallback**:
  - downloads annotated image
  - copies a structured prompt to clipboard
- 🧑‍💻 **Copy for Claude Code** - saves the PNG **and a JSON sidecar** to `Downloads/shotback/` and copies a prompt referencing both by path (Windows → WSL `/mnt/c/...` translation) so a Claude Code session can read them directly
- 📋 **Copy Image** - puts the annotated PNG straight on the clipboard for pasting into any chat
- 🧭 **Environment context** - both prompts carry the captured tab's title, viewport, pixel ratio, colour scheme, scroller and user agent, so an agent never has to ask
- 🩺 **Diagnostics** - both prompts list the requests the captured page made and did not get (status + URL), so a broken image or a 500 shows up next to the screenshot
- 🎚️ **Prompt detail** - a sidebar setting picks how much of the above actually renders: **Compact** (just the numbered comments and general feedback), **Standard** (the default - environment, geometry and element context) or **Detailed** (standard plus Diagnostics and per-annotation element text/classes/rect)
- 🖼️ **JPEG export** - a sidebar setting switches Download, Prepare for Cloud LLM and Copy for Claude Code to a smaller JPEG (fixed quality 0.9); Copy Image and shared links always stay PNG. A **Last export: N KB** readout shows what the most recent export actually weighed

## 🚀 Quick Start

### Option A: Install from the Chrome Web Store

> Not yet published - the listing link will go here once Shotback is live on
> the Chrome Web Store. Until then, use the from-source steps below.

### Option B: Build from source

#### 1️⃣ Install dependencies

```bash
npm install
```

#### 2️⃣ Build extension

```bash
npm run build
```

#### 3️⃣ Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist/` folder

## 📖 Usage

1. **Open** a target webpage.
2. **Click** the Shotback extension icon, or press `Alt+Shift+S` - the editor opens and captures the page automatically. (You can rebind the shortcut at `chrome://extensions/shortcuts`.)
3. **Draw** annotations and add comments. Undo or redo any step with the sidebar buttons or `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z`.
4. **Crop** (optional) - pick `Crop` in the Tool select, drag the region you
   want to hand over, then **Apply crop**. Everything below is then about that
   region only; **Clear** restores the full capture (nothing is thrown away -
   annotations are kept in capture coordinates and only shifted on export).
5. **Use** one of the outputs:
   - **Copy Local Share Link** for local profile review
   - **Prepare for Cloud LLM** for external LLMs (prompt + image download)
   - **Copy for Claude Code** saves the PNG and a JSON sidecar to `Downloads/shotback/` and copies a prompt that points to both by path (a Windows path is translated to its WSL `/mnt/c/...` equivalent), so a Claude Code session can read them directly - see [Use with Claude Code](#-use-with-claude-code)
   - **Copy Image** puts the annotated PNG on the clipboard - paste it straight into an agent chat

   How much of that a prompt carries is set by the sidebar's **Prompt detail**
   dropdown, which persists across sessions. At **Compact** a prompt is just the
   numbered comments, general feedback and the page URL. At **Standard** (the
   default) it also includes an **Environment** block describing the captured
   tab (page title, viewport size, device pixel ratio, colour scheme, whether
   the document or an inner element scrolled, user agent and capture time), and
   each area comment names the element it covers - a CSS selector such as
   `#pricing > div.card:nth-of-type(2) > button.cta`, plus the React component
   chain when the page is React - read back from the live tab as you annotate.
   At **Detailed** each annotated element also gets its visible text, classes
   and page-px rect on their own indented lines, and - when the captured page
   asked for something and did not get it - the prompt carries a
   **Diagnostics** block listing those requests (status and URL), read from the
   page's own resource timing at capture time:

   ```text
   Diagnostics:
   - Failed requests:
     1. 404 https://example.com/assets/logo.png
     2. 500 https://example.com/api/user
   ```

   **What the block can miss:** a status is only readable for same-origin
   responses and for cross-origin ones that opt in with
   `Access-Control-Allow-Origin`, so a failing third-party request (a CDN image,
   an analytics call) is invisible here - as is a request that never got a
   response at all. The browser also keeps only about 250 resource entries, so
   on a long-lived single-page app an early failure can be evicted before you
   capture. An absent Diagnostics block means "nothing readable failed", not
   "nothing failed".

   **Known limitation:** uncaught JavaScript errors from the page are _not_
   collected. Chromium delivers an error only to listeners in the JavaScript
   world that threw, and Shotback's content script runs in an isolated world, so
   it never sees the page's own errors. Collecting them would need extension
   code running in every page's own world on every page load, which is a
   deliberate trade Shotback has not made - see [`SECURITY.md`](SECURITY.md).
   Paste the console output yourself if an agent needs it.

## 🧑‍💻 Use with Claude Code

**Copy for Claude Code** writes two files with the same timestamp and copies a
prompt that names both:

```text
Downloads/shotback/cap-1756052403118.png    the annotated capture
Downloads/shotback/cap-1756052403118.json   the same review as data
```

```text
Review this screenshot: /mnt/c/Users/you/Downloads/shotback/cap-1756052403118.png
Machine-readable annotations (selectors, rects, diagnostics): /mnt/c/Users/you/Downloads/shotback/cap-1756052403118.json
...
```

Paste that into your session and the agent can read the annotations instead of
guessing at pixels. The sidecar is `version: 1` and carries, per annotation, the
number drawn on the image, its comment, its `rect` in image px, a
`normalizedRect` (0..1 of the capture) and the element it covers - CSS path,
React component chain, `data-testid`, visible text - plus the capture
environment, the page's failed requests and the image's relative path.

For a repeatable workflow, copy [`skills/shotback/SKILL.md`](skills/shotback/SKILL.md)
into your project's `.claude/skills/shotback/`. It tells the agent to read the
sidecar first, find the source from the selectors and component names rather
than from the image, treat `normalizedRect` as layout position, fold the
diagnostics into the fix, and open the PNG only when the selectors are
ambiguous.

The sidecar is best effort: if it cannot be written, the prompt still copies -
without the machine-readable line - and the status says so.

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
rationale, and [`PRIVACY.md`](PRIVACY.md) for the plain-language privacy policy.

## 🤝 Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## 📄 License

MIT ([`LICENSE`](LICENSE)).
