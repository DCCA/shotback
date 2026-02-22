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
    <main className="mx-auto min-h-screen w-full max-w-sm p-4">
      <Card className="mt-2">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <CardTitle>Shotback</CardTitle>
            <Badge variant="accent">Extension</Badge>
          </div>
          <CardDescription>
            Capture, annotate, and generate share-ready feedback for LLM workflows.
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
