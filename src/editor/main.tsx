import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Separator } from "@/components/ui/separator";
import { AnnotationCanvas } from "@/editor/annotation-canvas";
import { CommentTimeline } from "@/editor/comment-timeline";
import { SavedShares } from "@/editor/saved-shares";
import { Sidebar } from "@/editor/sidebar";
import { useEditorState } from "@/editor/use-editor-state";
import { useExports } from "@/editor/use-exports";
import { captureFullPage, inspectPoints } from "@/lib/capture";
import { buildLocalShareUrl } from "@/lib/localStore";
import { inspectAnchor } from "@/lib/numbering";
import "@/styles/globals.css";

function EditorApp(): JSX.Element {
  const search = new URLSearchParams(window.location.search);
  const tabId = Number(search.get("tabId"));
  const windowId = Number(search.get("windowId"));
  const autoCapture = search.get("autocapture") === "1";

  const state = useEditorState();
  const exports = useExports(state);

  const inlineCommentRef = useRef<HTMLTextAreaElement | null>(null);
  // Stitched image px per page CSS px, set by the last capture. A ref, not
  // state: nothing renders from it, and the commit handler must see it at once.
  const captureScaleRef = useRef<number | null>(null);
  // Bumped per inspection: only the newest response may write contexts, so a
  // slow one cannot land on top of a newer commit's result.
  const inspectGenRef = useRef(0);
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
    captureScaleRef.current = null;
    state.setShareUrl("");
    state.setEnvironment(undefined);
    state.resetAnnotations();
    state.setSelectedId(null);
    state.setGeneralFeedback("");

    try {
      const result = await captureFullPage(tabId, windowId, (index, total) => {
        state.setProgress(`Capturing ${index}/${total}...`);
      });
      state.setBaseDataUrl(result.dataUrl);
      state.setPageUrl(result.pageUrl);
      state.setEnvironment(result.environment);
      captureScaleRef.current = result.scale;
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

  /**
   * Re-read the element under every annotation from the captured tab, so the
   * prompts can name it. Deliberately outside the undo history: a context is
   * derived data, refreshed on the next commit, and an extra history entry per
   * inspection would double every undo. An older snapshot may therefore carry
   * an older context, which is harmless. Best effort throughout - `inspectPoints`
   * swallows a closed tab or a missing content script.
   *
   * A `null` answer clears the annotation's context instead of keeping the one
   * it had: the element it named is no longer under it (or the tab navigated),
   * and a stale name in a prompt is worse than no name.
   */
  const refreshContexts = async (): Promise<void> => {
    const scale = captureScaleRef.current;
    if (!scale || !canCapture) return;

    const generation = (inspectGenRef.current += 1);
    const items = state.getAnnotations();
    const contexts = await inspectPoints(
      tabId,
      items.map((annotation) => {
        const { x, y } = inspectAnchor(annotation);
        return { x: x / scale, y: y / scale };
      }),
      state.pageUrl
    );
    if (generation !== inspectGenRef.current) return;
    if (contexts.length === 0 || contexts.length !== items.length) return;

    const byId = new Map(items.map((annotation, index) => [annotation.id, contexts[index]]));
    state.setAnnotations((current) =>
      current.map((annotation) => {
        if (!byId.has(annotation.id)) return annotation;
        const context = byId.get(annotation.id) ?? undefined;
        return context === annotation.context ? annotation : { ...annotation, context };
      })
    );
  };

  const selectTimelineItem = (id: string): void => {
    state.setSelectedId(id);
    state.setInteractionMode("move");
    setShouldFocusSelectedComment(true);
  };

  return (
    <main className="grid min-h-screen grid-cols-1 gap-4 p-4 lg:grid-cols-[360px_1fr] lg:p-5">
      <Sidebar state={state} exports={exports} onCapture={() => void takeScreenshot()}>
        <Separator />
        <CommentTimeline
          items={timelineItems}
          selectedId={state.selectedId}
          onSelect={selectTimelineItem}
          onRemove={state.removeAnnotation}
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
          state.commitAnnotations();
          void refreshContexts();
        }}
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<EditorApp />);
