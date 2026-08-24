/** How long a re-captured page is given to finish loading before capture. */
const LOAD_TIMEOUT_MS = 15_000;
const POLL_MS = 250;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wait for a freshly opened tab to report `complete`, bounded so a page that
 * never finishes loading cannot hang the editor.
 *
 * A timeout is not an error: the capture that follows re-injects the content
 * script and retries by itself, so a slow page still gets captured - it just
 * gets captured as it stands.
 */
async function waitForTabLoad(tabId: number): Promise<void> {
  for (let waited = 0; waited < LOAD_TIMEOUT_MS; waited += POLL_MS) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete") return;
    await delay(POLL_MS);
  }
}

/**
 * Re-capture the page a saved share was taken from: open it in a new tab, wait
 * for it to load, then open a second editor against that tab with
 * `autocapture=1` - the same URL shape `background.ts` builds for the toolbar
 * icon, plus the share this capture follows, so the new session can link the
 * two and the viewer can put them side by side.
 */
export async function recaptureShare(share: { id: string; pageUrl: string }): Promise<void> {
  if (!share.pageUrl) {
    throw new Error("This saved share has no page URL to re-capture.");
  }

  const tab = await chrome.tabs.create({ url: share.pageUrl });
  if (typeof tab.id !== "number") {
    throw new Error("The page could not be opened in a new tab.");
  }
  await waitForTabLoad(tab.id);

  const params = new URLSearchParams({
    tabId: String(tab.id),
    autocapture: "1",
    previousShareId: share.id
  });
  if (typeof tab.windowId === "number") {
    params.set("windowId", String(tab.windowId));
  }
  await chrome.tabs.create({ url: chrome.runtime.getURL(`editor.html?${params.toString()}`) });
}
