import { createRoot } from "react-dom/client";
import "./popup.css";

function PopupApp(): JSX.Element {
  const openEditor = async (): Promise<void> => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      window.alert("No active tab available");
      return;
    }

    const target = chrome.runtime.getURL(`editor.html?tabId=${tab.id}&windowId=${tab.windowId}`);
    await chrome.tabs.create({ url: target });
    window.close();
  };

  return (
    <main className="popup-shell">
      <h1>Shotback</h1>
      <p>Capture, annotate, and generate a share link for LLM feedback.</p>
      <button onClick={() => void openEditor()}>Open Capture Editor</button>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<PopupApp />);
