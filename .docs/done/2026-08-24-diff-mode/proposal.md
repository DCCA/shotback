# Proposal: Diff mode (re-capture with before/after viewer)

## Why

A review ends with "is it fixed?". Today that means capturing the page again
from the toolbar, saving a second share, and holding two viewer tabs side by
side by hand. Nothing records that the second capture is the follow-up to the
first, so neither the viewer nor a Claude Code prompt can say so.

## Goal

- A **Re-capture** button on every saved share: it opens that share's page in a
  new tab, waits for it to load, and opens a second editor against it with the
  existing one-click auto-capture, carrying the share it follows.
- The share saved from that session records `previousShareId`.
- The viewer renders the two captures side by side, labelled **Before** and
  **After**; a predecessor that has been deleted or pruned degrades to the new
  capture plus a note.
- The Claude Code prompt gains one line when the session follows a capture, so
  the agent knows to verify a fix rather than review a screenshot cold.

## Scope

- `src/lib/localStore.ts` - `previousShareId?: string` on `LocalShare` and
  `LocalShareMeta`, passthrough only (no `schemaVersion` bump, no migration -
  the same pattern `environment` established).
- `src/lib/feedback.ts` - `buildClaudeCodePrompt` takes `followsPrevious`.
- `src/editor/recapture.ts` - the new-tab orchestration.
- `src/editor/saved-shares.tsx` - the button; `src/editor/main.tsx` reads the
  `previousShareId` URL param and wires the callback; `src/editor/use-exports.ts`
  carries it into `saveLocalShare` and into the prompt.
- `src/viewer/main.tsx` - the before/after rendering.
- `tests/localStore.test.ts`, `tests/feedback.test.ts`,
  `tests/e2e/extension.spec.ts`.
- `README.md`, `CLAUDE.md`.

## Out of Scope

- **Image diffing.** No pixel comparison, no highlight of what changed, no
  slider. Two images side by side is what a reviewer needs to judge a fix, and
  a pixel diff of two captures taken at different scroll positions and window
  sizes would be noise dressed up as signal.
- Chains longer than one step. A share links to the one it follows; the viewer
  resolves exactly one predecessor and does not walk the chain.
- Re-annotating, or copying the previous capture's annotations onto the new one.
- Any change to the batch export, the JSON sidecar or the cloud-LLM prompt.
