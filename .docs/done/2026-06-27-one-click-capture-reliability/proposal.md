# Proposal: One-Click Capture Reliability + On-Page Notice

## Why
One-click capture (`.docs/done/2026-06-27-claude-code-capture-handoff/`, Change A) fires the instant the editor opens. Dogfooding surfaced three problems the manual Capture button never hit, because it runs seconds later once the browser has settled:

1. **`Could not establish connection. Receiving end does not exist.`** — the target tab's content script had not registered its message listener yet when `SB_GET_PAGE_METRICS` was sent.
2. **`Tabs cannot be edited right now (user may be dragging a tab).`** — `chrome.tabs.update(target, {active:true})` ran while the just-opened editor tab was still being inserted into the tab strip.
3. **No on-screen feedback.** Capture activates and scrolls the _target_ tab, so the user is looking at the page (not the editor's progress text) and could switch tabs / scroll and corrupt the stitch — with nothing telling them not to. The first cut of the notice also leaked into the screenshot.

## Scope
- Make the one-click auto-capture path resilient to both transient Chrome errors via inject-and-retry / activate-and-retry helpers.
- Show an on-page "Capturing…" notice during capture, guaranteed out of the captured frames.

## Out of Scope
- Changing the capture algorithm (scroll/stitch) itself.
- New permissions (none required).
- Configurable notice text/position.
