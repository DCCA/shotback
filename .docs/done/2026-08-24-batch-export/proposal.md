# Proposal: Batch export of saved shares

## Why

A review rarely covers one screen. Today the only way to hand three captures to
Claude Code is to reopen each saved share, re-export it and paste three separate
prompts, each pointing at its own PNG and its own JSON in a flat
`Downloads/shotback/`. The agent then has to be told, by hand, that they belong
together.

## Goal

- A checkbox on every saved share, and a **Copy batch for Claude Code** button
  once at least one is ticked.
- The export writes every ticked share's PNG plus **one** `batch.json` into a
  single `Downloads/shotback/batch-<ts>/` folder.
- The copied prompt leads with the JSON path, then lists one numbered line per
  capture (page URL, annotation count, image path). Per-capture detail stays in
  the JSON.
- One failed download aborts the whole batch with an honest status: no prompt,
  and the message says which folder may hold files already written.

## Scope

- `src/lib/sidecar.ts` - `BatchSidecar { version: 1; captures: Sidecar[] }` and
  the pure `buildBatchSidecar(captures)`.
- `src/lib/feedback.ts` - `buildBatchPrompt(entries, sidecarPath)`.
- `src/editor/use-exports.ts` - `copyBatchForClaudeCode(ids)`.
- `src/editor/saved-shares.tsx` - the checkbox, the selection state and the
  batch button; `src/editor/main.tsx` wires the callback.
- `tests/sidecar.test.ts`, `tests/feedback.test.ts`,
  `tests/e2e/extension.spec.ts` (the `inner` branch, which already saves two
  shares).
- `README.md`, `CLAUDE.md`, `skills/shotback/SKILL.md`.

## Out of Scope

- Re-annotating or re-rendering a stored share. Its image is already annotated;
  the batch exports it byte for byte.
- A batch cloud-LLM prompt, a batch download of the images as a zip, or any
  select-all/none affordance.
- Any change to `localStore.ts`: a share already carries the annotations,
  environment, page URL and feedback a `Sidecar` needs.
- Diagnostics in a batch capture's sidecar - shares never persisted them, and
  inventing an empty block would be a false claim.
