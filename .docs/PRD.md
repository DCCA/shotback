# Shotback PRD

## Problem

A developer working with a coding agent needs to point at a UI problem and
have the agent act on it. A screenshot alone loses the connection to code:
the agent must guess which element a comment refers to and cannot verify
what actually failed. Prior art needs a cloud seat (Jam, Marker.io,
BugHerd) or only works on a localhost dev server (Vibe Annotations,
Agentation); nothing combines full-page capture on any URL with an
agent-consumable handoff.

## Goal

A local-first Chrome extension that captures a full page in one click, lets
the user pin annotations to exact UI areas, and hands an agent everything it
needs to act - not just a picture - while making zero network requests.

## Target user

Developers doing visual review of web UIs (their own app, a client site, a
third-party page) with an AI coding agent in the loop, who want the fix
grounded in real selectors and page state, not a screenshot to re-derive.

## Scope (shipped truth)

- Capture MUST be one click: the toolbar icon or `Alt+Shift+S` opens the
  editor and captures the full page (scroll + stitch), scrollbars hidden
  during capture so a track never bakes into a frame.
- Annotations MUST render as numbered pins on the canvas and the exported
  PNG, backed by a shared "Notes" legend, so image and prompt share numbers.
- The editor MUST support real undo/redo (draw, move, resize, comment,
  delete) via sidebar buttons and `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z`, MUST
  fit-to-width by default with a 1:1 zoom toggle, and MUST render correctly
  in light and dark theme, automatically or via `class="dark"`.
- Prompt exports MUST offer three verbosity levels (Compact, Standard,
  Detailed), since a full-page capture should not force the priciest prompt.
  Standard and Detailed MUST carry an Environment block (page title,
  viewport, device pixel ratio, colour scheme, user agent, capture time).
- Standard and Detailed prompts MUST add, per area annotation, its pixel and
  percent-of-page geometry and the CSS selector and React component chain
  of the element it covers, read live via `SB_INSPECT_POINTS` and a
  MAIN-world React fiber read.
- Detailed prompts MUST include a Diagnostics block of failed page requests
  (status 400+) from resource timing - CORS-gated and silent on console
  errors, so it MUST stay documented as partial, never implied complete.
- "Copy for Claude Code" MUST save the annotated PNG and a JSON sidecar of
  the same review as data (selectors, rects, diagnostics) to
  `Downloads/shotback/` and copy a prompt referencing both by path; the repo
  MUST ship `skills/shotback/SKILL.md` so an agent project can consume the
  sidecar by convention instead of re-deriving it.
- "Copy Image" MUST place the annotated PNG on the clipboard directly, and
  "Copy Local Share Link" MUST produce a profile-scoped `chrome-extension://`
  URL, never a public one (see Constraints for the network posture).

## Non-goals

- Cloud accounts, hosted infrastructure, team collaboration, or a
  public/shareable URL.
- Collecting the page's own uncaught console errors: a documented posture
  decision (`SECURITY.md`), not a gap to close by default.
- Area/visible/delayed capture, blur/redact, batch queue, diff mode: future
  work, not committed scope.

## Success criteria

- Given a saved sidecar and no access to the PNG, an agent MUST be able to
  locate every annotated element (selector, component, or normalized rect).
- A user MUST be able to go from clicking the toolbar icon (or
  `Alt+Shift+S`) to a copied, agent-ready prompt in under 30 seconds.
- A share produced in one browser profile MUST NOT open in another profile.

## Constraints

- No network requests originate from the extension itself.
- Permissions stay minimal (`activeTab`, `tabs`, `scripting`, `storage`,
  `unlimitedStorage`, `downloads`, `<all_urls>`), each justified in
  `SECURITY.md`; page access MUST be user-initiated, never background.
