# Shotback Chrome Extension

Shotback is a Chrome extension for capturing full-page screenshots, annotating them (box, arrow, text), and generating a local share link.

## Tech Stack

- Chrome Extension Manifest V3
- TypeScript + React + Vite
- Local persistence via `chrome.storage.local`

## Local Development

```bash
npm install
npm run dev
npm run build
npm run test
```

To load in Chrome:

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Click Load unpacked and select `dist/`.

## Share Link Behavior

Generated links are local extension URLs like:

`chrome-extension://<extension-id>/viewer.html?share=<id>`

These links only resolve in browser profiles where:
- the extension is installed, and
- the share record exists in local extension storage.

## Current MVP Limits

- Chrome only
- Full-page capture via scroll-and-stitch
- Local-only share URLs (no cloud hosting)
- No user sign-in
- Share data remains in local storage until manually cleared
