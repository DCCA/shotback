# Store listing screenshots

The PNGs in this folder (gitignored) are the Chrome Web Store listing
screenshots. Regenerate them with:

```bash
npm run build
node scripts/store-screenshots.mjs
```

This launches the built `dist/` extension in real Chromium (the same way
`tests/e2e/extension.spec.ts` does) against a small local fixture page, draws
a representative set of annotations (box, arrow, text, and a redaction), and
writes three 1280x800 PNGs here:

- `1-editor-annotations.png` - the editor with a full set of annotations,
  including a redaction over a fake email address.
- `2-viewer.png` - the local share viewer for a saved capture.
- `3-editor-dark.png` - the editor in dark mode.
