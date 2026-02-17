# Security Policy

## Supported Scope
This project currently targets local-first usage of a Chrome extension.

Security-sensitive areas:
- screenshot capture and annotation handling
- local share storage (`chrome.storage.local`)
- local share viewer route (`viewer.html?share=<id>`)

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
