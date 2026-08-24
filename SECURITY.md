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
| `downloads`                    | Save the annotated PNG to `Downloads/shotback/` and read back its on-disk path for the "Copy for Claude Code" handoff. Writes only files the user explicitly exports; reads only the path of the file it just created.                                                                                                                            |
| `host_permissions: <all_urls>` | A general screenshot tool must capture whatever page the user is on; there is no fixed allowlist of sites.                                                                                                                                                                                                                                        |

`commands` (\_execute_action for `Alt+Shift+S`) is not a permission - it only binds a keyboard shortcut to the existing toolbar action.

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
- The extension makes no network requests of its own.
- Data leaves the device only when the user explicitly uses the cloud LLM
  fallback (manual image download + clipboard paste). The "Copy for Claude Code"
  action likewise only writes a PNG to `Downloads/shotback/` and copies a text
  prompt to the clipboard - it makes no network request.

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
