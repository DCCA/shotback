# Spec: One-Click Capture Reliability + On-Page Notice

### Requirement: Resilient Content-Script Messaging
Capture MUST retry the initial content-script message while the receiving end is not ready, re-injecting the content script between attempts.

#### Scenario: Receiver not ready on auto-capture
- GIVEN one-click capture fires before the content script has registered its listener
- WHEN `SB_GET_PAGE_METRICS` is sent and rejects with "Receiving end does not exist"
- THEN the content script is re-injected and the message retried up to a bounded number of times
- AND capture proceeds once a response is received

#### Scenario: Unrelated error is not retried
- GIVEN a message rejects with an error that is not a no-receiver error
- WHEN the send fails
- THEN it is rethrown immediately without retrying

### Requirement: Resilient Tab Activation
Capture MUST retry activating the target tab while the tab strip is transiently locked.

#### Scenario: Tab strip busy on auto-capture
- GIVEN the editor tab was just created and the strip is still settling
- WHEN `chrome.tabs.update(target, {active:true})` rejects with "Tabs cannot be edited right now"
- THEN activation is retried with a short backoff until it succeeds or retries are exhausted

### Requirement: On-Page Capture Notice
The page being captured SHALL display a notice telling the user not to switch tabs or scroll while capture runs, and the notice MUST NOT appear in the saved screenshot.

#### Scenario: Notice visible during capture
- GIVEN a full-page capture is running
- WHEN the page is scrolling between segments
- THEN a fixed notice ("Capturing full page… don't switch tabs or scroll") is visible on the page

#### Scenario: Notice excluded from frames
- GIVEN the notice is shown
- WHEN each `captureVisibleTab` frame is taken
- THEN the notice is hidden and the hide has been painted before the frame is captured
- AND the notice is removed when capture finishes or is restored

#### Scenario: Notice failure never breaks capture
- GIVEN the notice messages cannot be delivered (e.g. an old content script)
- WHEN capture runs
- THEN the capture still completes normally
