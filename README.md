<div align="center">

# 📸 Shotback

### A Chrome extension for fast screenshot reviews: capture a full page, annotate specific areas, keep a timeline of comments, and share a local review link.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green.svg)](https://developer.chrome.com/docs/extensions/)

</div>

---

## 🎯 Why Shotback

Shotback is optimized for **local-first review workflows**. You can annotate UI issues quickly, preserve context with area-linked comments, and keep feedback organized before sending to an LLM.

## ✨ Features

- 📷 **Full-page capture** (`scroll + stitch`)
- ✏️ **Area annotations**: box, arrow, text
- 🔗 **Linked comments** tied to selected annotation
- ⏱️ **Comment timeline** with per-item remove
- 💬 **General feedback** for screenshot-level notes
- 🔐 **Local share links** (`chrome-extension://.../viewer.html?share=...`)
- 🤖 **External LLM fallback**:
  - downloads annotated image
  - copies a structured prompt to clipboard

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
2. **Click** the Shotback extension icon and open the editor.
3. **Click** **Capture Page**.
4. **Draw** annotations and add comments.
5. **Use** one of two outputs:
   - **Copy Local Share Link** for local profile review
   - **Prepare for Cloud LLM** for external LLMs (prompt + image download)

## 📁 Project Structure

```text
src/
  popup/       # extension popup UI
  editor/      # annotation editor UI
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

| Command | Description |
|---------|-------------|
| `npm run dev` | Run Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run test` | Run unit tests (Vitest) |
| `npm run preview` | Preview production build |

## ⚠️ Local Link Constraint

Local share links are **intentionally local**. They only work where:
- ✅ the extension is installed
- ✅ the share exists in that browser profile's `chrome.storage.local`

> **Note:** For cloud LLM tools that cannot access local links, use **Prepare for Cloud LLM**.

## 🤝 Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## 📄 License

MIT ([`LICENSE`](LICENSE)).
