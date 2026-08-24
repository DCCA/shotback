import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getLocalShare, type LocalShare } from "@/lib/localStore";
import "@/styles/globals.css";

const IMAGE_CLASS = "h-auto w-full rounded-lg border border-border bg-card";

function ViewerApp(): JSX.Element {
  const [share, setShare] = useState<LocalShare | null>(null);
  // The capture this one follows, when it came from a re-capture and the
  // earlier share is still stored. `null` covers both "not a re-capture" and
  // "the previous share has been deleted or pruned".
  const [previous, setPrevious] = useState<LocalShare | null>(null);
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

        if (record.previousShareId) {
          // Best effort: a missing predecessor is a note in the UI, never a
          // reason to fail the share the user actually asked for.
          setPrevious(await getLocalShare(record.previousShareId).catch(() => null));
        }
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
            <CardTitle as="h1">Shotback Share</CardTitle>
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
              <CardTitle as="h1">Shotback Share</CardTitle>
              <Badge variant="accent">Local</Badge>
            </div>
            <CardDescription>
              Review the source context and annotated output from this capture.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 rounded-lg border border-border bg-muted p-3 text-sm">
              <p className="m-0">
                <span className="font-semibold text-muted-foreground">Source page:</span>{" "}
                <a className="text-primary underline underline-offset-2" href={share.pageUrl}>
                  {share.pageUrl}
                </a>
              </p>
              <p className="m-0">
                <span className="font-semibold text-muted-foreground">Saved at:</span>{" "}
                {new Date(share.createdAt).toLocaleString()}
              </p>
              {share.environment ? (
                <p className="m-0">
                  <span className="font-semibold text-muted-foreground">Viewport:</span>{" "}
                  {share.environment.viewport.width}x{share.environment.viewport.height} @
                  {share.environment.devicePixelRatio}x - {share.environment.colorScheme}
                </p>
              ) : null}
              <p className="m-0">
                <span className="font-semibold text-muted-foreground">General feedback:</span>{" "}
                {share.generalFeedback?.trim() || "No general feedback provided."}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle as="h2" className="text-base">
                {previous ? "Before and After" : "Annotated Image"}
              </CardTitle>
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
          <CardContent className="space-y-3">
            {share.previousShareId && !previous ? (
              <p className="m-0 text-xs text-muted-foreground">
                The earlier capture this one follows is no longer stored, so only the new one is
                shown.
              </p>
            ) : null}
            {previous ? (
              <div className="grid gap-3 md:grid-cols-2">
                <figure className="m-0 space-y-2">
                  <figcaption className="text-xs font-semibold text-muted-foreground">
                    Before
                  </figcaption>
                  <img
                    src={previous.imageDataUrl}
                    alt="Previous annotated share"
                    className={IMAGE_CLASS}
                  />
                </figure>
                <figure className="m-0 space-y-2">
                  <figcaption className="text-xs font-semibold text-muted-foreground">
                    After
                  </figcaption>
                  <img src={share.imageDataUrl} alt="Annotated share" className={IMAGE_CLASS} />
                </figure>
              </div>
            ) : (
              <img src={share.imageDataUrl} alt="Annotated share" className={IMAGE_CLASS} />
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<ViewerApp />);
