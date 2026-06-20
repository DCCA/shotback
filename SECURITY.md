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

| Permission                     | Why it is needed                                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `activeTab`                    | Access the tab the user is viewing when they invoke capture.                                                          |
| `tabs`                         | Coordinate capture: query the active tab, focus the target tab, and open the editor/viewer. Uses tab/window ids only. |
| `scripting`                    | Inject the capture helper that measures the page and drives scroll-and-stitch.                                        |
| `storage` + `unlimitedStorage` | Persist share metadata in `chrome.storage.local` and large annotated images in IndexedDB without quota errors.        |
| `host_permissions: <all_urls>` | A general screenshot tool must capture whatever page the user is on; there is no fixed allowlist of sites.            |

Access to page content is exercised **only at user-initiated capture time**, not
in the background.

`web_accessible_resources` is intentionally **not** declared: the content script
injects no extension resources into web pages, and the editor/viewer load their
own assets as same-origin extension pages. Omitting it removes an
extension-fingerprinting vector.

### Known follow-up

The content script is registered statically on `<all_urls>` and is also injected
on demand at capture time. A future change may move fully to on-demand injection
to avoid running on every page load.

## Data Handling

- Screenshots, annotations, and feedback stay in the local browser profile.
- The extension makes no network requests of its own.
- Data leaves the device only when the user explicitly uses the cloud LLM
  fallback (manual image download + clipboard paste).

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
