# Privacy Policy

Shotback is a local-first Chrome extension. This page explains, in plain
language, what it stores and where your data goes. The technical version of
every claim below lives in [`SECURITY.md`](SECURITY.md) - if the two ever
disagree, treat that as a bug and open an issue.

## The short version

- Shotback makes no network requests of its own.
- Everything it captures stays in your browser profile unless you personally
  choose to export it.
- There is no Shotback server, no account, and no analytics or telemetry.

## What Shotback stores, and where

Shotback keeps two kinds of local data, both inside your Chrome profile:

- **Share details** (annotations, comments, the page URL, and similar
  metadata) live in `chrome.storage.local`.
- **The screenshot image itself** lives in IndexedDB, in a database local to
  the extension.

Neither of these is a server, a cloud bucket, or anything reachable from
outside your machine. A "local share link" it can generate
(`viewer.html?share=<id>`) only works inside the same browser profile that
created it - it is not a public URL, and nobody else can open it.

By default Shotback keeps up to 50 shares for up to 30 days, then prunes the
oldest ones automatically. You can also delete shares yourself at any time by
clearing the extension's site data from `chrome://extensions`.

## What a capture and its annotations contain

When you capture a page, Shotback records:

- the screenshot itself (a full-page image, stitched from what your browser
  can already see);
- any box, arrow, text, or redaction annotation you draw, plus the comments
  you attach to them;
- for each non-redaction annotation, a description of the page element under
  it: its CSS selector (tag, id, classes, `role`, `data-testid`), its
  position, up to 80 characters of its visible text, and - on React sites -
  the names of the React components that render it. The component names are
  read by briefly running a small script inside the page's own JavaScript
  world (not Shotback's isolated one); only short, sanitised names come
  back, one line each, capped at 50 characters. All of this is read from the
  page only at the moment you draw or move an annotation;
- the requests the page itself made and did not get a good answer to (HTTP
  status 400 or higher, up to 20 of them, each URL capped at 200 characters).
  This is a partial view: it only sees same-origin failures and cross-origin
  ones the site opted into sharing, and Chrome itself only remembers roughly
  the last 250 requests;
- basic environment details about the tab you captured (page title, viewport
  size, pixel ratio, color scheme, whether the page or an inner panel
  scrolled, and your user agent string).

Shotback does **not** collect the page's own JavaScript console errors - the
browser only delivers those to code running inside the page itself, and
Shotback deliberately does not run code there to avoid that trade-off. See
`SECURITY.md` for the full reasoning.

## Redaction: what it protects, and its limits

The Redact tool lets you black out (technically, pixelate) part of a capture
before it is stored or exported. Once you redact a region:

- every export - the downloaded image, the clipboard copy, the cloud-LLM
  package, the file saved for Claude Code, and the saved share - carries the
  pixelated version, never the original;
- the un-redacted pixels exist only in that one open editor tab's memory.
  Closing the tab destroys them for good, with no way to recover them
  afterward, on this machine or any other;
- a redaction is never described in a prompt or sidecar beyond a count -
  Shotback does not read the element or text underneath it, because doing so
  would put the very thing you redacted back into an exported prompt.

Pixelation is not the same as a solid black box. It is a lossy but structured
encoding of what was underneath, and short strings in a known font can
sometimes be recovered from it by a determined attacker. Treat a redacted
password or token as compromised and rotate it - do not treat redaction as a
substitute for changing a leaked secret.

## When data leaves your device

Shotback only sends data off your machine when you personally trigger an
export, and each export is a manual, visible action:

- **Copy Local Share Link** - nothing leaves the device; it just gives you a
  link that only works in this browser profile.
- **Prepare for Cloud LLM** - downloads the annotated image to your computer
  and copies a text prompt to your clipboard. Shotback does not upload
  anything itself; the image only reaches an external LLM if you manually
  attach or paste it there yourself.
- **Copy for Claude Code** - saves the annotated image and a JSON sidecar (the
  same page-derived data described above: selectors, text, failed-request
  URLs) to `Downloads/shotback/` on your computer, and copies a prompt
  referencing both files to your clipboard. This is a local file write, not a
  network request - the files stay on disk until you delete them.
- **Copy batch for Claude Code** - the same local file write for several saved
  captures at once: every ticked capture's image plus one `batch.json` holding
  their annotations, selectors and environment, written into a single
  `Downloads/shotback/batch-<ts>/` folder, with a prompt copied to your
  clipboard.
- **Copy Image** - copies the annotated image to your clipboard, for you to
  paste wherever you choose.

Outside of these actions, Shotback does not transmit anything anywhere.

## Permissions

Shotback asks for the minimum browser permissions full-page capture needs
(`activeTab`, `tabs`, `scripting`, `storage`, `unlimitedStorage`, `downloads`,
and `<all_urls>` host access), and it only reads page content while you are
actively capturing or annotating a page - never in the background. The full
rationale for each permission is in [`SECURITY.md`](SECURITY.md).

## Changes to this policy

If this policy changes, the change will be visible in this file's git
history in the project repository.

## Contact

Questions about this policy, or about how Shotback handles data, are welcome
as an issue on the project's GitHub repository. For a security
vulnerability specifically, see the reporting process in
[`SECURITY.md`](SECURITY.md) instead of a public issue.
