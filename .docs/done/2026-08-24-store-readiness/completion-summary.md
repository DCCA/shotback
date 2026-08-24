# Completion Summary: Web Store readiness

## What changed

- `PRIVACY.md` (new) - plain-language privacy policy: what is stored (share
  metadata in `chrome.storage.local`, images in IndexedDB), what a capture
  and its annotations contain (screenshot, annotations/comments, per-element
  selector/text context, failed-request diagnostics, environment), redaction
  and its limits, when data leaves the device (each of the four export
  actions), permissions, retention (50 shares / 30 days), and contact.
- `.github/workflows/release.yml` (new) - on tag `v*`: checkout, setup-node
  (22, npm cache), `npm ci`, `npm run check`, zip `dist/` into
  `shotback-<tag>.zip`, `gh release create` with `GH_TOKEN:
  ${{ github.token }}`. `permissions: contents: write` scoped at the job
  level. No store credentials, no publish step - a human still uploads the
  zip to the Chrome Web Store dashboard.
- `scripts/store-screenshots.mjs` (new) - launches the built `dist/`
  extension in real Chromium the same way `tests/e2e/extension.spec.ts` does,
  against a small fixture page, and writes three 1280x800 PNGs to `store/`.
  Annotation positions are read from the fixture page's real
  `getBoundingClientRect()` values (not hard-coded pixel guesses), and the
  source window is explicitly sized to 1280x800 before capture - both fixes
  came out of the first run producing misplaced annotations (see below).
- `store/README.md` (new) - regeneration instructions; `.gitignore` gained
  `store/*` / `!store/README.md`.
- `public/manifest.json` - added `homepage_url` (only change to the file).
- `SECURITY.md` - one line noting `homepage_url` is static metadata, grants
  no permission.
- `README.md` - "Install from the Chrome Web Store" placeholder section
  (not yet published) above the existing from-source steps, and a link to
  `PRIVACY.md` next to the `SECURITY.md` link.

## PRIVACY.md claim-to-SECURITY.md cross-check

| PRIVACY.md claim | SECURITY.md source |
|---|---|
| Share metadata in `chrome.storage.local`, image in IndexedDB | "Data Handling" + architecture note in `SECURITY.md`/`CLAUDE.md` (`localStore.ts`) |
| Local share link only works in the same profile, not public | "Expected Security Boundaries": "Local share links are not public URLs." |
| Retention: 50 shares / 30 days, auto-pruned | `DEFAULT_RETENTION_POLICY` referenced in project architecture docs (`localStore.ts`) |
| Per-annotation element description: CSS selector, position, up to 80 chars text | SECURITY.md lines 39-44 ("each drawn or moved annotation asks the captured tab to describe the element... reads that element's selector... up to 80 characters") |
| Failed-request diagnostics: status >= 400, up to 20, 200-char URL cap, partial by construction (CORS-gated, ~250-entry buffer) | SECURITY.md lines 31-38 |
| No console-error collection, and why | SECURITY.md "Deliberate non-collection: page console errors" section |
| Redaction: pixelated before storage/export, original only in editor tab memory, never persisted, no element context read | SECURITY.md "Redaction" section (lines 91-131), especially "The original, unredacted capture exists only in the editor session" |
| Pixelation is weaker than solid fill; short known-font strings recoverable; rotate don't just hide | SECURITY.md: "Block pixelation is weaker than a solid fill" paragraph |
| No network requests of its own | SECURITY.md "Data Handling": "The extension makes no network requests of its own." |
| Cloud LLM export: manual download + clipboard, no upload by the extension | SECURITY.md "Data Handling" + "Expected Security Boundaries": "Cloud LLM fallback requires manual user action" |
| Copy for Claude Code: writes PNG + JSON sidecar to `Downloads/shotback/`, no network request, sidecar carries same page-derived data as the prompt | SECURITY.md "Data Handling" paragraph on the Claude Code action |
| Permissions list and "only while capturing/annotating, never in background" | SECURITY.md "Permission Rationale" table + "Access to page content is exercised only at user-initiated capture time..." |

No claim in `PRIVACY.md` goes beyond what `SECURITY.md` documents, and
nothing in `SECURITY.md`'s data-handling section is omitted from the plain-
language version.

## Workflow validation

Ran both:

- `npx --yes @action-validator/cli .github/workflows/release.yml` -> exit 0,
  no output (same clean result on the existing `.github/workflows/ci.yml`,
  used as a control).
- `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/release.yml'))"`
  -> `YAML OK`.

Did not push a tag - not tested end to end against real GitHub Actions, per
the task's constraint.

## Screenshots

Generated with `npm run build && node scripts/store-screenshots.mjs` into
`store/` (gitignored, not committed):

- `store/1-editor-annotations.png` - light editor, a box annotation around a
  "Save changes" button (pin 1), an arrow pointing at a stat card (pin 2), a
  text note (pin 3, "3 notes" badge confirms all three are counted), and a
  redaction outline over a fake email address in the header (redactions are
  deliberately excluded from numbering, so no pin - matches
  `numberAnnotations`'s documented behavior).
- `store/2-viewer.png` - the local share viewer rendering a saved capture
  with its one annotation, source page URL, saved timestamp and viewport.
- `store/3-editor-dark.png` - the same editor in dark mode, box annotation
  visible, dark tokens applied throughout (sidebar, canvas, controls).

First run produced badly misplaced annotations: the source window defaulted
to a small size (`780x493`, confirmed via the viewer's own "Viewport:"
readout) rather than the assumed 1280x800, and pixel offsets were guessed
by hand against unmeasured layout. Fixed by explicitly sizing the source
page's viewport to 1280x800 before triggering capture, and by reading real
element rects (`getBoundingClientRect()`) off the fixture page and
converting them to image-px via the actual capture scale
(`naturalWidth / 1280`), rather than hard-coding numbers. Re-ran and visually
confirmed all three shots (see report for the read-back).

## Gate

- `npm run check` (typecheck + lint + test + build): green - 206/206 unit
  tests passed, build succeeded. One lint fix needed: `no-undef` on
  `document`/`window`/`chrome` inside the script's `page.evaluate`/
  `sw.evaluate` callbacks (they run in the browser/extension, not Node) -
  resolved with a top-of-file `/* global document, window, chrome */`
  comment, the same pattern the ESLint flat config already exempts for
  `.ts` files via `no-undef: off`.
- `npm run format:check`: green.
- `npm run test:e2e`: green, 7/7 - unaffected by this change (screenshot
  script is a separate, standalone script, not part of the built
  extension).

## Risks / follow-ups

- The Chrome Web Store listing itself (description copy, category, promo
  tile) is not part of this change - only the build/zip pipeline and the
  screenshots that would go into a listing.
- `PRIVACY.md`'s "Contact" section points at GitHub issues; if the project
  later gets a dedicated support email, update both `PRIVACY.md` and
  `SECURITY.md` together.
- The release workflow has not been exercised end to end (no tag was
  pushed) - first real use should be watched via `gh run view` after a
  genuine version tag.
