import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getLocalShare, type LocalShare } from "@/lib/localStore";
import "@/styles/globals.css";

function ViewerApp(): JSX.Element {
  const [share, setShare] = useState<LocalShare | null>(null);
  const [status, setStatus] = useState("Loading share...");

  useEffect(() => {
    const run = async (): Promise<void> => {
      const params = new URLSearchParams(window.location.search);
      const shareId = params.get("share");

      if (!shareId) {
        setStatus("Missing share id in URL.");
        return;
      }

      try {
        const record = await getLocalShare(shareId);
        if (!record) {
          setStatus(
            "Share not found in local storage. This link only works in a browser profile where this extension saved it."
          );
          return;
        }

        setShare(record);
        setStatus("");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Failed to load share");
      }
    };

    void run();
  }, []);

  if (status) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-5xl p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Shotback Share</CardTitle>
            <CardDescription>{status}</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  if (!share) {
    return <main className="mx-auto min-h-screen w-full max-w-5xl p-4 md:p-6" />;
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl p-4 md:p-6">
      <div className="space-y-4">
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Shotback Share</CardTitle>
              <Badge variant="accent">Local</Badge>
            </div>
            <CardDescription>
              Review the source context and annotated output from this capture.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="m-0">
                <span className="font-semibold text-slate-700">Source page:</span>{" "}
                <a className="text-emerald-700 underline underline-offset-2" href={share.pageUrl}>
                  {share.pageUrl}
                </a>
              </p>
              <p className="m-0">
                <span className="font-semibold text-slate-700">Saved at:</span>{" "}
                {new Date(share.createdAt).toLocaleString()}
              </p>
              <p className="m-0">
                <span className="font-semibold text-slate-700">General feedback:</span>{" "}
                {share.generalFeedback?.trim() || "No general feedback provided."}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">Annotated Image</CardTitle>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const link = document.createElement("a");
                  link.href = share.imageDataUrl;
                  link.download = `shotback-share-${share.id}.png`;
                  link.click();
                }}
              >
                Download PNG
              </Button>
            </div>
            <Separator />
          </CardHeader>
          <CardContent>
            <img
              src={share.imageDataUrl}
              alt="Annotated share"
              className="h-auto w-full rounded-lg border border-slate-200 bg-white"
            />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<ViewerApp />);
