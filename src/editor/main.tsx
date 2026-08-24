import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Separator } from "@/components/ui/separator";
import { AnnotationCanvas } from "@/editor/annotation-canvas";
import { CommentTimeline } from "@/editor/comment-timeline";
import { SavedShares } from "@/editor/saved-shares";
import { Sidebar } from "@/editor/sidebar";
import { useEditorState } from "@/editor/use-editor-state";
import { useExports } from "@/editor/use-exports";
import { captureFullPage } from "@/lib/capture";
import { buildLocalShareUrl } from "@/lib/localStore";
import "@/styles/globals.css";

function EditorApp(): JSX.Element {
  const search = new URLSearchParams(window.location.search);
  const tabId = Number(search.get("tabId"));
  const windowId = Number(search.get("windowId"));
  const autoCapture = search.get("autocapture") === "1";

  const state = useEditorState();
  const exports = useExports(state);

  const inlineCommentRef = useRef<HTMLTextAreaElement | null>(null);
  const autoCaptureFiredRef = useRef(false);
  const [shouldFocusSelectedComment, setShouldFocusSelectedComment] = useState(false);

  const canCapture = Number.isFinite(tabId) && Number.isFinite(windowId);
  const timelineItems = [...state.annotations].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const takeScreenshot = async (): Promise<void> => {
    if (!canCapture) {
      state.setStatus({
        kind: "error",
        message:
          "Missing target tab information. Click the Shotback toolbar icon on the page you want to capture."
      });
      return;
    }

    state.setIsBusy(true);
    state.setStatus(null);
    state.setShareUrl("");
    state.setAnnotations([]);
    state.setSelectedId(null);
    state.setGeneralFeedback("");

    try {
      const result = await captureFullPage(tabId, windowId, (index, total) => {
        state.setProgress(`Capturing ${index}/${total}...`);
      });
      state.setBaseDataUrl(result.dataUrl);
      state.setPageUrl(result.pageUrl);
      state.setProgress("Capture completed");
    } catch (error) {
      state.setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Capture failed"
      });
    } finally {
      state.setIsBusy(false);
    }
  };

  // When opened directly from the toolbar icon (autocapture=1), start the
  // full-page capture once on load so a single click yields a ready screenshot.
  // The manual Capture button remains available for re-capture.
  useEffect(() => {
    if (!autoCapture || autoCaptureFiredRef.current || !canCapture) return;
    autoCaptureFiredRef.current = true;
    void takeScreenshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectTimelineItem = (id: string): void => {
    state.setSelectedId(id);
    state.setInteractionMode("move");
    setShouldFocusSelectedComment(true);
  };

  const removeTimelineItem = (id: string): void => {
    state.setAnnotations((prev) => prev.filter((item) => item.id !== id));
    if (state.selectedId === id) state.setSelectedId(null);
  };

  return (
    <main className="grid min-h-screen grid-cols-1 gap-4 p-4 lg:grid-cols-[360px_1fr] lg:p-5">
      <Sidebar state={state} exports={exports} onCapture={() => void takeScreenshot()}>
        <Separator />
        <CommentTimeline
          items={timelineItems}
          selectedId={state.selectedId}
          onSelect={selectTimelineItem}
          onRemove={removeTimelineItem}
        />
        {state.shareUrl ? (
          <a
            href={state.shareUrl}
            target="_blank"
            rel="noreferrer"
            className="block break-all text-sm font-medium text-primary underline underline-offset-2"
          >
            {state.shareUrl}
          </a>
        ) : null}

        <Separator />
        <SavedShares
          shares={exports.savedShares}
          onOpen={(id) => window.open(buildLocalShareUrl(id), "_blank")}
          onDelete={(id) => void exports.removeSavedShare(id)}
        />
      </Sidebar>

      <AnnotationCanvas
        state={state}
        inlineCommentRef={inlineCommentRef}
        shouldFocusSelectedComment={shouldFocusSelectedComment}
        setShouldFocusSelectedComment={setShouldFocusSelectedComment}
        onCommit={() => {
          // Wired to the undo/redo history in a later change.
        }}
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<EditorApp />);
