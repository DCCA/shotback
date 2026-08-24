# Completion Summary: Diff mode (re-capture with before/after viewer)

## What changed

- `src/lib/localStore.ts` - `previousShareId?: string` on `LocalShare` and
  `LocalShareMeta`, carried through `toLocalShareMeta`, `saveLocalShare` and
  `getLocalShare`. Passthrough only, exactly like `environment`: optional, so
  no `schemaVersion` bump, no migration, and absent on every older record
  (including one migrated from the legacy v1 shape).
- `src/lib/feedback.ts` - `buildClaudeCodePrompt` takes an optional
  `followsPrevious`. When set it renders one line under the image and sidecar
  paths: `Before/after: this capture follows an earlier one - verify the fix
against the previous state.` A **flag, not a path**: the previous PNG lives in
  the share store, not in Downloads, so there is nothing for an agent to read.
  Without it the prompt is byte-identical to what it always was.
- `src/editor/recapture.ts` (new) - `recaptureShare({ id, pageUrl })`:
  `chrome.tabs.create` on the page, `waitForTabLoad` (250 ms poll, bounded at
  15 s), then a second `chrome.tabs.create` on
  `editor.html?tabId=&windowId=&autocapture=1&previousShareId=` - the same URL
  shape `background.ts` builds for the toolbar icon, so the re-capture runs the
  one existing capture path rather than a parallel one. A load timeout is
  deliberately **not** an error: the capture re-injects the content script and
  retries by itself, so a slow page is captured as it stands.
- `src/editor/saved-shares.tsx` - a **Re-capture** button per row (with the
  same `aria-label` shape the Delete button uses). The three actions moved onto
  their own wrapped row under the title: with three buttons in the 360px
  sidebar the old side-by-side grid squeezed the page label down to `1...` and
  wrapped the timestamp over four lines.
- `src/editor/main.tsx` - reads the `previousShareId` URL param, passes it to
  `useExports`, and wires `onRecapture` with a failure status.
- `src/editor/use-exports.ts` - `useExports(state, previousShareId)`. It does
  exactly two things with it: `saveLocalShare` records it, and the Claude Code
  prompt gets `followsPrevious: Boolean(previousShareId)`.
- `src/viewer/main.tsx` - resolves the predecessor with `getLocalShare` when the
  share carries one and renders **Before** / **After** side by side
  (`md:grid-cols-2`, `<figure>`/`<figcaption>`), with the card titled
  "Before and After". Best effort: a predecessor that has been deleted or pruned
  yields the new capture alone plus a muted note, never a failed viewer. The
  "After" image keeps `alt="Annotated share"`, so every existing viewer
  assertion still resolves.
- `README.md` - a Features bullet. `CLAUDE.md` - the viewer surface bullet, the
  storage paragraph (both passthrough fields), a new re-capture paragraph, the
  `feedback.ts` helper bullet and the e2e description.

## Design notes

- **The flow reuses the toolbar path, it does not fork it.** The only new thing
  is who builds the URL: `background.ts` for a click on the icon,
  `recaptureShare` for a click on the button. Auto-capture, the retry helpers
  and the on-page notice are untouched.
- **`previousShareId` is passthrough and nothing else.** No index, no reverse
  link, no chain walking. One share names the one it follows; the viewer
  resolves that one and stops. A chain would need pruning to understand links,
  which is a much bigger change for a case nobody asked for.
- **No image diffing** (the explicit scope decision). Two captures of the same
  page differ in scroll position, window size and any animation that happened
  in between, so a pixel diff would light up everywhere and mean nothing. Side
  by side is what a reviewer actually reads.
- **A missing predecessor is a note, not an error.** Shares are pruned at 50
  records / 30 days, so a "before" capture disappearing is normal, and the new
  capture is still the thing the user asked to see.

## RED/GREEN evidence

### Group 1: passthrough and prompt line (`tests/localStore.test.ts`, `tests/feedback.test.ts`)

RED (`npx vitest run tests/localStore.test.ts tests/feedback.test.ts`):

```text
FAIL  tests/localStore.test.ts > localStore > carries previousShareId through save and read...
AssertionError: expected undefined to be 'mlvjy800-f422ddd7'
  198|     expect(after.previousShareId).toBe(previous.id);

FAIL  tests/feedback.test.ts > buildClaudeCodePrompt > says the capture follows an earlier one only when it does
  473|       "Before/after: this capture follows an earlier one - verify the ...

 Test Files  2 failed (2)
      Tests  2 failed | 52 passed (54)
```

GREEN, after the field and the flag:

```text
Test Files  2 passed (2)
     Tests  54 passed (54)
```

### Group 2: e2e (`tests/e2e/extension.spec.ts`)

RED - `git stash push -- src/lib/localStore.ts` (the button, the flow and the
viewer kept, so the whole tab orchestration still ran), `npm run build`,
`npx playwright test -g "re-capture links"`:

```text
1) re-capture links the new share to the one it follows

  Error: expect(received).toBe(expected) // Object.is equality
  Expected: "mt7ovkd4-118affc4"
  Received: undefined

  > 972 |   expect(stored.previousShareId).toBe(shareA);
1 failed
```

That RED is the honest one: it proves the flow works end to end (page tab,
second editor with `previousShareId` in its URL, a real capture, share B saved)
and fails on exactly the link the store was not yet keeping.

`git stash pop`, `npm run build`, reran - GREEN first time. Full suite:

```text
Running 8 tests using 1 worker
  ✓ extension loads with no popup and the downloads permission
  ✓ capture notice shows, hides for the frame, and is removed
  ✓ full-page capture stitches every viewport in order (smooth)
  ✓ full-page capture stitches every viewport in order (inner) (6.9s)
  ✓ a redaction is pixelated in the export and in the saved share
  ✓ re-capture links the new share to the one it follows (4.5s)
  ✓ editor page renders the capture UI
  ✓ dark theme keeps every control legible
8 passed (17.6s)
```

### Group 3: visual

Temporary `screenshot` calls in the e2e (removed before commit), light and dark:

- Viewer: the two captures sit side by side under "Before and After", each
  under its own label, both legible in either theme.
- Saved shares: the first pass showed the three-button row squeezing the page
  label to `1...` and wrapping the timestamp over four lines. After moving the
  actions to their own row, the row reads
  `127.0.0.1 / 8/24/2026, 5:30:44 PM • 47 KB` with **Open / Re-capture /
  Delete** underneath, in both themes.

## Gate output

```text
npm run check
  typecheck: clean
  lint: clean
  test: 15 files, 215 tests passed
  build: succeeded

npm run format:check
  All matched files use Prettier code style!

npm run test:e2e
  8 passed (17.6s)

git diff --cached -U0 | grep '^+' | grep -cP '\x{2014}'
  0

git diff --cached -U0 -- src | grep '^+' | grep -cE "(text|bg|border|ring|from|to|via|fill|stroke)-(slate|emerald|red|white)\b"
  0
```

## Self-review

- **Completeness**: passthrough (meta + full record + legacy read), the
  Re-capture button, the tab flow, the viewer's before/after, the prompt line
  and the deleted-predecessor fallback are each covered by a test - the last
  two by the unit suite and by the e2e's delete-and-reload step.
- **Quality**: the load wait is bounded (15 s, 250 ms poll) and a timeout
  proceeds rather than hanging; the e2e closes both tabs it opened plus the
  viewer, so no later test inherits a page; no new dependency, no new component.
- **Discipline**: no image diffing, no chain walking, no reverse index, no
  schema bump. `src/lib` stays free of `chrome.*` - the flag the prompt takes is
  a boolean, not a share id.
- **Testing**: RED captured for both groups before the code existed (the e2e RED
  through a real `git stash` of `localStore.ts` against the finished flow);
  GREEN re-verified after each; `npm run check`, `format:check` and the full e2e
  suite green as the final gate.

## Deviations and follow-ups

- `buildClaudeCodePrompt` takes `followsPrevious: boolean` rather than the
  `previousShareId` string the brief's file list sketched. The rendered line
  carries no id or path (there is no file to point at), so passing the id into
  a pure lib function would have been unused data.
- The e2e re-captures the newest saved share (`Re-capture` `.first()`), since
  the persistent context still holds shares from earlier tests and every one of
  them is the same fixture host. Scoping by `aria-label` would not disambiguate
  them either.
- No visual affordance in the editor telling the user that *this* session is a
  re-capture (the prompt says so, the viewer shows it). Cheap to add later if it
  turns out to be confusing.
