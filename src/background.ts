chrome.runtime.onInstalled.addListener(() => {
  console.info("Shotback extension installed");
});

// No action popup: clicking the toolbar icon opens the editor for the active
// tab and signals it to auto-capture, collapsing capture down to a single click.
chrome.action.onClicked.addListener((tab) => {
  if (typeof tab.id !== "number") return;
  const params = new URLSearchParams({
    tabId: String(tab.id),
    autocapture: "1"
  });
  if (typeof tab.windowId === "number") {
    params.set("windowId", String(tab.windowId));
  }
  const url = chrome.runtime.getURL(`editor.html?${params.toString()}`);
  void chrome.tabs.create({ url });
});
