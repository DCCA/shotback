# Tasks: Web Store readiness

- [x] **1. Privacy policy**
  - [x] 1.1 `PRIVACY.md`: local storage, capture/annotation contents,
        redaction limits, when data leaves the device, permissions, contact.
  - [x] 1.2 Cross-checked every claim against `SECURITY.md` (see
        `completion-summary.md`).
- [x] **2. Release workflow**
  - [x] 2.1 `.github/workflows/release.yml`: tag `v*` -> checkout, setup-node
        (22, npm cache), `npm ci`, `npm run check`, zip `dist/` ->
        `shotback-<tag>.zip`, `gh release create` with `GH_TOKEN:
        ${{ github.token }}`. `permissions: contents: write` at job level. No
        store credentials, no publish step.
  - [x] 2.2 Validated: `npx @action-validator/cli` (exit 0 on both the new
        workflow and the existing `ci.yml`) and a `yaml.safe_load` parse
        check.
- [x] **3. Store screenshots**
  - [x] 3.1 `scripts/store-screenshots.mjs`: launches the built `dist/`
        extension in real Chromium (same pattern as
        `tests/e2e/extension.spec.ts`), against a small fixture "dashboard"
        page, and writes three 1280x800 PNGs to `store/`: editor with box +
        arrow + text annotations and a redaction, the local share viewer, and
        the dark-mode editor.
  - [x] 3.2 Ran it locally against a real build; read all three PNGs back and
        confirmed the annotations land on the intended elements (not
        guessed/hard-coded pixel offsets - the script reads real
        `getBoundingClientRect()` values off the fixture page).
  - [x] 3.3 `store/README.md` documents regeneration; `.gitignore` excludes
        `store/*` except that README.
- [x] **4. Manifest / README**
  - [x] 4.1 `public/manifest.json`: `homepage_url` added (only change).
  - [x] 4.2 `SECURITY.md`: one line noting `homepage_url` is static metadata.
  - [x] 4.3 `README.md`: "Install from the Chrome Web Store" placeholder
        section (not yet published) above the from-source steps, and a link
        to `PRIVACY.md` next to the existing `SECURITY.md` link.
- [x] **5. Gate**
  - [x] 5.1 `npm run check` green (typecheck, lint, test, build).
  - [x] 5.2 `npm run format:check` green.
  - [x] 5.3 `npm run test:e2e` green (7/7), confirming this change did not
        affect the existing e2e suite.
- [x] **6. Ship**
  - [x] 6.1 Commit, push, PR against `main` (not merged).
