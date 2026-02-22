import { createRoot } from "react-dom/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import "@/styles/globals.css";

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
    <main className="w-[320px] p-3">
      <Card>
        <CardHeader className="space-y-2 pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-3xl leading-none">Shotback</CardTitle>
            <Badge variant="accent" className="shrink-0">
              New
            </Badge>
          </div>
          <CardDescription>
            Capture, annotate, and share visual feedback for LLM workflows.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={() => void openEditor()}>
            Open Capture Editor
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<PopupApp />);
