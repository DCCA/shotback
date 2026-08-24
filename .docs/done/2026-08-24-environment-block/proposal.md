# Proposal: Environment block in prompts, shares and viewer

## Why

The 2026-08-23 product review (`.docs/reviews/2026-08-23-product-review.md`, P2)
found that Shotback's handoff carries only the page URL and the comments, while
every competitor auto-attaches environment metadata. An agent receiving a
Shotback prompt cannot tell how wide the page was, whether it was light or dark,
what browser rendered it, or when the shot was taken - so it either asks or
guesses.

## Goal

Every capture records the **captured tab's** context and hands it to the two
prompt outputs, to saved shares, and to the viewer's metadata card.

## Scope

- `PageMetrics` gains `title`, `colorScheme` and `scroller` - read in
  `src/content.ts`, which is the only place that can see the target tab.
- `CaptureEnvironment` + the pure `buildEnvironment(metrics, userAgent, now)` in
  `src/lib/capture.ts`; `CaptureResult` carries the environment.
- `buildExternalLlmPrompt` / `buildClaudeCodePrompt` take an optional
  `environment` and render an `Environment:` block after the `Page URL:` line.
- `saveLocalShare` / `getLocalShare` pass `environment` through as an optional
  field; the viewer shows viewport, DPR and colour scheme when present.
- Editor state holds the environment, clears it when a new capture starts, and
  feeds all three prompt/share consumers.

## Out of Scope

- Element geometry, DOM context or console/network capture (later tasks).
- A `schemaVersion` bump or any migration - the field is optional passthrough,
  and shares saved before this change simply have no environment.
- Editing or redacting the environment before export.
