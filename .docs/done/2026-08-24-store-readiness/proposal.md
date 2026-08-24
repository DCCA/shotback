# Proposal: Web Store readiness

## Why

Shotback has no publishing pipeline and no user-facing privacy policy, both
of which the Chrome Web Store listing flow requires (or strongly expects) and
which a real user cannot currently answer for themselves without reading
`SECURITY.md` end to end. Getting a build onto a reviewer's or a user's
machine today means cloning the repo and running `npm run build` by hand.

## Goal

Make the repository store-ready without publishing anything:

- a plain-language `PRIVACY.md`, consistent with `SECURITY.md`, that a
  non-technical reviewer or user can read in a couple of minutes;
- a tag-triggered GitHub Actions workflow that builds and zips `dist/` and
  attaches it to a GitHub Release, with no store credentials and no publish
  step - a human still uploads the zip to the Chrome Web Store dashboard by
  hand;
- a repeatable script that generates the 1280x800 listing screenshots the
  store dashboard asks for;
- the manifest's `homepage_url`, and README pointers to both the (future)
  store listing and the new privacy policy.

## Scope

- Create: `PRIVACY.md`, `.github/workflows/release.yml`,
  `scripts/store-screenshots.mjs`.
- Modify: `public/manifest.json` (`homepage_url` only), `README.md` (install
  section + privacy link), `SECURITY.md` (one line on `homepage_url`),
  `.gitignore` (`store/*`, keep `store/README.md`).

## Non-goals

- No version bump automation - the manifest version stays hand-managed.
- No Chrome Web Store publishing, no store API credentials in CI.
- No change to the extension's runtime behavior, permissions, or data
  handling - this is packaging and documentation only.
