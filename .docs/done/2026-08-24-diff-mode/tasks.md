# Tasks: Diff mode (re-capture with before/after viewer)

- [x] **1. Unit tests RED**
  - [x] 1.1 `tests/localStore.test.ts` - `previousShareId` survives save and
        read (on the returned meta and on the record read back), is `undefined`
        for a first capture, and is `undefined` on a migrated legacy record.
  - [x] 1.2 `tests/feedback.test.ts` - `buildClaudeCodePrompt` renders the
        before/after line as the third line (right under the image and sidecar
        paths) when `followsPrevious` is set, and is byte-identical to today's
        prompt when it is not.
  - [x] 1.3 RED: `2 failed | 52 passed (54)` - `expected undefined to be
        'mlvjy800-...'` and the missing before/after line.
- [x] **2. Passthrough and prompt line; GREEN**
  - [x] 2.1 `src/lib/localStore.ts` - the optional field on `LocalShare` and
        `LocalShareMeta`, carried through `toLocalShareMeta`, `saveLocalShare`
        and `getLocalShare`. No `schemaVersion` bump, no migration.
  - [x] 2.2 `src/lib/feedback.ts` - `followsPrevious?: boolean` on
        `buildClaudeCodePrompt`. A flag, not a path: the previous PNG lives in
        the share store, not on disk.
  - [x] 2.3 GREEN: `54 passed (54)`.
- [x] **3. Re-capture flow and viewer**
  - [x] 3.1 `src/editor/recapture.ts` - `recaptureShare({ id, pageUrl })`:
        `chrome.tabs.create` on the page, `waitForTabLoad` (bounded 15 s,
        250 ms poll, a timeout proceeds rather than throwing), then a second
        `chrome.tabs.create` on `editor.html?tabId=&windowId=&autocapture=1&previousShareId=`
        - the same URL shape `background.ts` builds for the toolbar icon.
  - [x] 3.2 `src/editor/saved-shares.tsx` - a **Re-capture** button per row.
        The three actions moved onto their own wrapped row under the title, so
        a third button no longer squeezes the label to `1...` in the 360px
        sidebar.
  - [x] 3.3 `src/editor/main.tsx` - reads the `previousShareId` param, passes
        it to `useExports`, and wires `onRecapture` with an error status.
  - [x] 3.4 `src/editor/use-exports.ts` - `useExports(state, previousShareId)`:
        into `saveLocalShare`, and `followsPrevious` on the Claude Code prompt.
  - [x] 3.5 `src/viewer/main.tsx` - resolves the predecessor best effort and
        renders **Before**/**After** side by side; a missing predecessor shows
        the new capture plus a muted note.
  - [x] 3.6 `npm run typecheck` / `npm run lint` clean.
- [x] **4. e2e**
  - [x] 4.1 New focused test after the redaction one: save share A, click
        Re-capture, assert two tabs open (the page and an editor carrying
        `previousShareId=A`), save share B from the new editor, read
        `share:<B>` out of `chrome.storage.local` through the service worker
        and assert its `previousShareId`, then open the viewer and assert two
        images with Before/After labels. Deleting A and reloading the viewer
        asserts the fallback note and a single image. Every tab it opened is
        closed at the end.
  - [x] 4.2 RED: `git stash push -- src/lib/localStore.ts` (the flow and the
        viewer kept), rebuilt, ran `-g "re-capture links"` -
        `expect(received).toBe(expected)` on `stored.previousShareId`,
        `Received: undefined`.
  - [x] 4.3 `git stash pop`, rebuilt, reran - GREEN first time.
  - [x] 4.4 Full suite: `npm run test:e2e` - `8 passed`.
- [x] **5. Visual check**
  - [x] 5.1 Viewer before/after and the saved-shares row screenshotted light
        and dark (temporary `screenshot` calls in the e2e, removed afterward).
        The first pass exposed the cramped three-button row, which is what
        3.2's layout change fixes.
- [x] **6. Gate + docs**
  - [x] 6.1 `npm run check` green.
  - [x] 6.2 `npm run format:check` green.
  - [x] 6.3 `npm run test:e2e` green.
  - [x] 6.4 Em-dash and colour-literal greps on added lines - zero hits.
  - [x] 6.5 `README.md` (Features bullet), `CLAUDE.md` (viewer, storage,
        re-capture and e2e paragraphs).
- [x] **7. Commit and PR**
