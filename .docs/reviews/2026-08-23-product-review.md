# Shotback product review - 2026-08-23

Benchmarked against best-in-class tools in the three categories Shotback
straddles, plus the AI-agent handoff tools that are its real category.

## Method

- Read the code, PRD, and docs; drove the built extension in real Chromium
  (Playwright + `--load-extension`) and screenshotted the editor and viewer in
  light and dark.
- Benchmarks: full-page extensions (GoFullPage, FireShot, Awesome Screenshot,
  FuseBase/Nimbus); visual bug reporters (Jam, Marker.io, BugHerd, Userback,
  Ybug); desktop annotators (CleanShot X, Shottr, Snagit); screenshot-to-agent
  tools (stagewise, Vibe Annotations, Agentation, Drawbridge, Chrome DevTools
  MCP, Vercel Toolbar).

## Verdict

Shotback's wedge is real and nobody else occupies it: zero-network, no
account, works on any URL, one click, and hands the result to a coding agent.
Jam/Marker/BugHerd need a cloud seat; Vibe Annotations and Agentation are
localhost-dev-server only. But the product today is a solid *capture* tool
with a thin *handoff* and a below-par *editor*. The gap to close is not more
screenshot features - it is the context that travels with the screenshot.

| Dimension | Score (1-5) | One line |
|---|---|---|
| Capture | 3 | Full page is now robust (PR #18); no area/visible/delay modes; scrollbar strip baked in |
| Annotation editor | 2 | Box/arrow/text only; no numbers, blur, highlight, real undo, zoom, shortcuts |
| AI handoff (core) | 2 | Prompt carries URL + comments only; no selectors, metadata, console, coordinates |
| Sharing / viewer | 3 | Local links work; viewer is a read-only page, no agent-readable export |
| Privacy / trust | 5 | No network, minimal permissions, documented rationale |
| UI polish | 2 | Dark theme broken, sidebar overflow, labels unreadable on export |
| Engineering health | 4 | CI gate, 56 unit + 5 e2e tests, docs contract; 1171-line editor monolith |

## Findings, ranked

### P0 - defects found while reviewing (evidence in `scratchpad` screenshots)

1. **Dark theme is half-wired.** With `class="dark"` the secondary buttons
   (Undo, Download, Prepare for Cloud LLM, Copy for Claude Code) render with no
   visible label, helper text and "Annotations: n" vanish, and in the viewer
   "Saved at" / "General feedback" values are invisible. Cause: the editor and
   viewer still use literal `text-slate-*` / `border-slate-*` / `bg-white`
   classes instead of tokens, and the `.dark` block is never applied (no
   `prefers-color-scheme` hook). Either finish it (tokens everywhere +
   `@media (prefers-color-scheme: dark)`) or delete the block; today it is a
   trap.
2. **Sidebar horizontal scrollbar.** The share URL is one unbreakable string
   and forces the whole left card to scroll sideways. `break-all` (or show it
   as a "Copied" chip with an Open button) fixes it.
3. **Exported image does not match the prompt.** The prompt numbers comments
   `1. [box] ...`, but the image has no numbered markers - it draws the full
   comment text in a 13 px pill that overlaps page content and is unreadable
   once a 1000+ px capture is scaled down (see viewer screenshot). Every
   benchmark (CleanShot, Shottr, Snagit, Agentation, Marker.io) uses numbered
   pins; the number is the join key between picture and text.
4. **Scrollbar strip in every frame.** Captured frames include the page's
   scrollbar track (15 px light column at the right edge). Hide it during
   capture (`scrollbar-width: none` / `::-webkit-scrollbar{display:none}` on
   the scroller) and restore after.
5. **Inline comment editor covers the annotation.** The 240x84 textarea is
   placed over the arrowhead/box corner; the label pill then sits on top of
   the page content. Anchor the editor outside the shape and keep the pill
   off the shape's interior.
6. Minor: "Undo Last Change" only removes the last annotation (a move or
   resize cannot be undone); the first keystroke after drawing can land before
   the comment box is focused (effect-based focus); the native
   `<input type="color">` renders as a full-width red bar.

### P1 - table stakes vs. the screenshot category

| Feature | Who has it | Shotback |
|---|---|---|
| Keyboard shortcut to capture | GoFullPage `Alt+Shift+P`, all desktop tools | No `commands` in manifest |
| Copy annotated PNG to clipboard | FireShot, CleanShot, Snagit 2026 | No (download only). Paste is the fastest path into a Claude Code / Cursor chat |
| Blur / redact | FireShot, FuseBase, CleanShot, Snagit Smart Redact | No - a real risk given the cloud-LLM export |
| Visible-area / selected-region / delayed capture | All four extensions | Full page only |
| Numbered markers / step counter | CleanShot, Shottr, Snagit | No |
| Highlight, freehand, crop | All | No |
| Real undo/redo | All | Remove-last only |
| Zoom / fit-to-width | All | Image is `max-w-none`; wide captures scroll sideways |
| Colour swatches / tool hotkeys | All | Native colour input; no B/A/T/V keys |
| JPEG / PDF export | GoFullPage, FireShot | PNG only |

### P2 - the differentiator: make the handoff best-in-class

This is the category Shotback actually competes in, and where it is furthest
behind. Vibe Annotations, Agentation, and stagewise all argue the same thing:
"a screenshot loses the connection to code." Their per-annotation payload is a
CSS selector, the React/Vue component (and source file), bounding box,
computed styles, viewport info. Jam/Marker/BugHerd add console errors,
failed network requests, browser/OS metadata, and all three now ship an MCP
server.

Shotback's prompt today: URL, general feedback, `n. [tool] comment`. Not even
the box coordinates.

What to add, in order of value per effort:

1. **Environment block** (S): page title, viewport, DPR, user agent, colour
   scheme, timestamp. Already known at capture time.
2. **Per-annotation geometry** (S): pixel rect + normalized rect in the
   prompt, so a text-only model can still reason about position.
3. **Per-annotation DOM context** (M): the content script is still in the tab;
   map each box/arrow back to page coordinates and run
   `document.elementsFromPoint` -> CSS path, tag/id/classes, visible text,
   `data-testid`, React component name via the `__reactFiber$` key, bounding
   rect. Shotback is uniquely placed here: full-page capture means every
   numbered comment on a whole page maps to a selector in one pass - nobody
   combines stitched capture with per-pin selectors today.
4. **Console errors + failed requests since page load** (M): inject an error /
   `unhandledrejection` hook and read `performance.getEntriesByType("resource")`
   for 4xx/5xx; no `chrome.debugger` needed for the 80% case.
5. **Structured sidecar** (S): write `shotback/<id>.json` next to the PNG
   (annotations, geometry, DOM context, environment) and reference it in the
   prompt. A Claude Code skill / MCP tool that reads `Downloads/shotback/*.json`
   turns "read this image" into "here are 7 typed fixes with selectors."
6. **Prompt verbosity levels** (S): Compact / Standard / Detailed, as
   Agentation does; a full-page PNG is already expensive in tokens.
7. **Batch queue** (L): annotate several pages, hand the agent one batch.
8. **Diff mode** (M): re-capture the same URL after the fix and hand back
   before/after. No competitor does this; it closes the loop.

### P3 - product and positioning

- The PRD still describes the Feb MVP ("generate a local share URL"); the
  actual differentiator (agent handoff) is a footnote. Rewrite the PRD around
  the P2 list and make "Copy for Claude Code" the primary action.
- Three near-identical output buttons ("Download", "Prepare for Cloud LLM",
  "Copy for Claude Code", plus "Copy Local Share Link") with no hierarchy.
  One primary action (Send to agent) with a target picker; the rest secondary.
- No Web Store listing, release, privacy-policy page, or listing screenshots
  (a store listing with `<all_urls>` requires a privacy policy).
- Empty state says "Capture a page to start annotating" even though the user
  arrived via auto-capture; the card header "Shotback Editor" is dead space.
- Engineering: split `src/editor/main.tsx` (1171 lines) into canvas, toolbar,
  timeline, exports; add editor integration tests (already in backlog);
  turn on branch protection (already in backlog).

## Roadmap

**Phase 1 - fix and tighten (1-2 days):** P0 1-5; numbered markers on export;
copy PNG to clipboard; `commands` shortcut; real undo/redo stack; zoom/fit;
colour swatches; hide scrollbar during capture.

**Phase 2 - handoff v2 (3-5 days):** environment block, geometry, DOM context
per annotation, console/network errors, JSON sidecar, prompt verbosity, a
`shotback` Claude Code skill that consumes the sidecar. Rewrite the PRD.

**Phase 3 - category parity and distribution (1-2 weeks):** area/visible/delay
capture, blur/redact, highlight/freehand/crop, JPEG export, Web Store listing
with privacy policy, batch queue, diff mode.

## Sources

Competitor facts were gathered on 2026-08-23 from vendor sites: gofullpage.com,
getfireshot.com, awesomescreenshot.com, thefusebase.com, jam.dev (pricing +
MCP docs), marker.io/features, bugherd.com, userback.io, ybug.io,
cleanshot.com, shottr.cc, snagitpro.com review, stagewise.io,
vibe-annotations.com, agentation.com/faq, github.com/breschio/drawbridge,
github.com/ChromeDevTools/chrome-devtools-mcp, vercel.com/docs/comments.
Pricing figures from third-party sources are marked unverified in the notes.
