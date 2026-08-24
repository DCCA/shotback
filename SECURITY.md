# Security Policy

## Supported Scope

This project currently targets local-first usage of a Chrome extension.

Security-sensitive areas:

- screenshot capture and annotation handling
- local share storage (`chrome.storage.local`)
- local share viewer route (`viewer.html?share=<id>`)

## Permission Rationale

Shotback requests only what full-page capture requires. Each permission and its
justification:

| Permission                     | Why it is needed                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activeTab`                    | Access the tab the user is viewing when they invoke capture.                                                                                                                                                                                                                                                                                      |
| `tabs`                         | Coordinate capture: query the active tab, focus the target tab, and open the editor/viewer. Uses tab/window ids only.                                                                                                                                                                                                                             |
| `scripting`                    | Inject the capture helper that measures the page and drives scroll-and-stitch, and - when the user annotates - run a minimal, self-contained function in the page's own JavaScript world (`world: "MAIN"`) to read React component names. No extension state crosses into that world; only sanitised strings (one line, 50 chars each) come back. |
| `storage` + `unlimitedStorage` | Persist share metadata in `chrome.storage.local` and large annotated images in IndexedDB without quota errors.                                                                                                                                                                                                                                    |
| `downloads`                    | Save the annotated PNG and its JSON sidecar to `Downloads/shotback/` and read back their on-disk paths for the "Copy for Claude Code" handoff. Writes only files the user explicitly exports; reads only the paths of the files it just created.                                                                                                  |
| `host_permissions: <all_urls>` | A general screenshot tool must capture whatever page the user is on; there is no fixed allowlist of sites.                                                                                                                                                                                                                                        |

`commands` (\_execute_action for `Alt+Shift+S`) is not a permission - it only binds a keyboard shortcut to the existing toolbar action.

`homepage_url` in the manifest is static metadata pointing at the project repository; it grants no permission and triggers no request on its own.

Access to page content is exercised **only at user-initiated capture time and
while the user annotates a capture**, never in the background. Capturing also
reads the page's own resource timing and collects the requests it answered with
a status of 400 or more (up to 20, each URL clamped to one line of 200 chars).
Those URLs go into the prompts the user copies, so a page's own request URLs -
query strings included - can leave the device through an explicit export. The
status is readable only for same-origin responses and for cross-origin ones that
opt in with `Access-Control-Allow-Origin`, and the browser keeps only about 250
resource entries, so this is a partial view by construction: an absent
diagnostics block means "nothing readable failed", not "nothing failed".
Annotating is
itself a user-initiated act: each drawn or moved annotation asks the captured
tab to describe the element beneath it, which reads that element's selector
(tag, id, classes, `role`, `data-testid`), its position, and up to 80 characters
of its visible text. That description is stored on the annotation, so it lands
in saved shares and in the prompts the user copies.

To hand the hit element between the isolated content script and the page-world
component read, the element is briefly marked with a `data-shotback-hit`
attribute. It is page-observable while it is there and is removed as soon as the
component read consumes it (or, if that fails, on the next inspection).

`web_accessible_resources` is intentionally **not** declared: the content script
injects no extension resources into web pages, and the editor/viewer load their
own assets as same-origin extension pages. Omitting it removes an
extension-fingerprinting vector.

### Deliberate non-collection: page console errors

Prompts do **not** carry the page's uncaught JavaScript errors, and this is a
posture decision rather than an oversight. Chromium reports an error only to
listeners in the JavaScript world that threw it, so a `window` error listener in
the content script's isolated world never fires for the page's own errors
(measured against real Chromium; the probe output is in
`.docs/done/2026-08-24-diagnostics/`). The only way to collect them is a
`world: "MAIN"` content script running at `document_start` on every page load -
extension code inside every page's own JavaScript world, page-readable and
page-tamperable, and one more extension-fingerprinting vector. That runs against
both the omission of `web_accessible_resources` below and the follow-up right
after it, so it is not done. Reopen it as an explicit, documented trade.

### Known follow-up

The content script is registered statically on `<all_urls>` and is also injected
on demand at capture time. A future change may move fully to on-demand injection
to avoid running on every page load.

## Data Handling

- Screenshots, annotations, element descriptions, failed-request URLs, and
  feedback stay in the local browser profile.
- Regions the user redacts are pixelated into every exported image and into the
  saved share before it is stored (see "Redaction" below).
- The extension makes no network requests of its own.
- Data leaves the device only when the user explicitly uses the cloud LLM
  fallback (manual image download + clipboard paste). The "Copy for Claude Code"
  action likewise only writes a PNG and a JSON sidecar to `Downloads/shotback/`
  and copies a text prompt to the clipboard - it makes no network request. The
  sidecar carries the same page-derived data the prompt does (element
  selectors, page text, failed-request URLs), in a file that stays on disk
  until the user deletes it.

### Redaction

The Redact tool hides a region of the capture, and it does so at the raster
level: `exportAnnotatedImage` draws the base image, immediately replaces every
redacted region with 12px blocks resampled from the pixels underneath (a
`imageSmoothingQuality = "high"` downscale, so a block weighs its whole area
rather than sampling a pixel or two out of it), and only then draws the
annotations and the notes legend. The exported PNG therefore
never contains the original pixels, and there is no second path around it,
because every output is that one function's result: the downloaded PNG, the
clipboard copy, the cloud LLM package, the PNG written to `Downloads/shotback/`
for Claude Code, and the image stored in a saved local share.

State this plainly, because it is the property the tool is worth having:

- **A redaction is destructive for everything that leaves the editor.** The
  saved share holds the pixelated image, so opening `viewer.html?share=<id>`
  cannot recover what was hidden, on this machine or any other.
- **The original, unredacted capture exists only in the editor session**, as
  the in-memory `baseDataUrl` of that editor tab. It is never written to
  `chrome.storage.local`, never written to IndexedDB and never written to disk.
  Closing the tab is what destroys it, and after that the redaction cannot be
  undone by anyone, the user included.
- A redaction carries no note and no element context, and it is never mapped
  back to the live page: reading the element under one would put its selector,
  and up to 80 characters of its text, into the very prompts the redaction
  exists to keep it out of. Prompts and the JSON sidecar say only how many
  regions were hidden and where they sit.
- **Block pixelation is weaker than a solid fill**, and is not the right tool
  for a small run of known-font text: a grid of block averages is a lossy but
  structured encoding of what it replaced, and Depix-class attacks recover
  short strings from one by searching a rendered corpus for a block pattern
  that matches. Draw the region generously larger than the secret (more
  surrounding context per block means less of the block is the secret), and
  treat a redacted password or token as rotated rather than hidden. A
  solid-fill mode would remove that class of attack outright and is the
  obvious future option if this posture is not enough.
- A redaction hides pixels, not the page. Everything else a prompt carries
  about the page (the URL, the environment, other annotations' selectors and
  failed-request URLs) is unaffected, so a secret in a URL still needs removing
  by hand.

## Reporting a Vulnerability

If you find a security issue, please report it privately to the maintainers before public disclosure.

Include:

- issue summary
- impact and attack scenario
- reproduction steps
- proposed mitigation (if available)

Please avoid opening public issues for unpatched vulnerabilities.

## Expected Security Boundaries

- Local share links are not public URLs.
- Data is stored in extension local storage by design.
- Cloud LLM fallback requires manual user action (download + paste/upload).

## Hardening Guidance for Contributors

- Keep permissions in `public/manifest.json` minimal.
- Validate any new external/network integration before merge.
- Avoid introducing silent data exfiltration paths.
- Ensure user intent is explicit before exporting or sharing data.

## Current Limitations

- No authenticated multi-user model.
- No encrypted cloud storage mode by default.
- Security posture is local-first and depends on browser/profile integrity.
