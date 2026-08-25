import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AnnotationCanvas } from "@/editor/annotation-canvas";
import { CommentTimeline } from "@/editor/comment-timeline";
import { recaptureShare } from "@/editor/recapture";
import { SavedShares } from "@/editor/saved-shares";
import { Sidebar } from "@/editor/sidebar";
import { useEditorState } from "@/editor/use-editor-state";
import { useExports } from "@/editor/use-exports";
import {
  captureFullPage,
  captureOptions,
  createGenerationGuard,
  inspectPoints,
  toPageCoords,
  type CaptureMapping,
  type CaptureMode
} from "@/lib/capture";
import { buildLocalShareUrl } from "@/lib/localStore";
import { inspectableAnnotations, inspectAnchor } from "@/lib/numbering";
import "@/styles/globals.css";

function EditorApp(): JSX.Element {
  const search = new URLSearchParams(window.location.search);
  const tabId = Number(search.get("tabId"));
  const windowId = Number(search.get("windowId"));
  const autoCapture = search.get("autocapture") === "1";
  // Set when this session was opened by "Re-capture" on a saved share: the
  // share this capture follows, recorded on the share saved from here.
  const previousShareId = search.get("previousShareId") ?? undefined;

  // Undo and redo replace the annotations wholesale, so an inspection already
  // in flight would answer for geometry that has just been reverted. Handing
  // the restore straight to `refreshContexts` settles both halves at once: its
  // first act is to take a new inspection ticket, which retires the outstanding
  // one, and it then re-reads the elements the restored annotations now sit on.
  const state = useEditorState(() => void refreshContexts());
  const exports = useExports(state, previousShareId);

  const inlineCommentRef = useRef<HTMLTextAreaElement | null>(null);
  // How the last capture's image px map back onto the live page, for the
  // inspection round trip. A ref, not state: nothing renders from it, and the
  // commit handler must see it at once.
  const captureMappingRef = useRef<CaptureMapping | null>(null);
  // Only the newest inspection may write contexts, so a slow response cannot
  // land on top of a newer commit - or on top of an undo. Created once per
  // session; `createGenerationGuard` is pure and unit-tested in `capture.ts`.
  const inspectGuard = useRef(createGenerationGuard()).current;
  const autoCaptureFiredRef = useRef(false);
  const [shouldFocusSelectedComment, setShouldFocusSelectedComment] = useState(false);

  const canCapture = Number.isFinite(tabId) && Number.isFinite(windowId);

  const takeScreenshot = async (mode: CaptureMode = "full"): Promise<void> => {
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
    captureMappingRef.current = null;
    state.setShareUrl("");
    state.setEnvironment(undefined);
    state.setDiagnostics(undefined);
    state.resetAnnotations();
    // A crop is a region of the capture that is about to be replaced, so it
    // cannot outlive it - nor can a marquee drawn on the old one.
    state.setCrop(null);
    state.setCropDraft(null);
    state.setSelectedId(null);
    state.setGeneralFeedback("");
    state.setLastExportSize(null);

    try {
      const result = await captureFullPage(
        tabId,
        windowId,
        (index, total) => {
          state.setProgress(`Capturing ${index}/${total}...`);
        },
        captureOptions(mode)
      );
      state.setBaseDataUrl(result.dataUrl);
      state.setPageUrl(result.pageUrl);
      state.setEnvironment(result.environment);
      state.setDiagnostics(result.diagnostics);
      captureMappingRef.current = {
        scale: result.scale,
        scrollerTop: result.scrollerTop,
        scrollOffset: result.scrollOffset
      };
    } catch (error) {
      state.setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Capture failed"
      });
    } finally {
      state.setIsBusy(false);
      // Progress says what is happening *now*. The capture is on screen the
      // moment it finishes, so a lingering "Capture completed" would only be a
      // stale line to read past on the next export.
      state.setProgress("");
    }
  };

  // When opened directly from the toolbar icon (autocapture=1), start the
  // full-page capture once on load so a single click yields a ready screenshot.
  // Always full page: there is nowhere to pick a mode before this fires, and
  // the whole point of one-click capture is that nothing is asked. The manual
  // Capture button (and its mode chooser) remains available for re-capture.
  useEffect(() => {
    if (!autoCapture || autoCaptureFiredRef.current || !canCapture) return;
    autoCaptureFiredRef.current = true;
    void takeScreenshot("full");
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
   *
   * Redactions are never inspected. That rule lives in
   * `inspectableAnnotations`, not here, so a second inspection call site
   * cannot leak by default.
   */
  const refreshContexts = async (): Promise<void> => {
    // The ticket comes first, before any bail-out: calling this at all means
    // whatever is in flight is now describing stale geometry, and that has to
    // hold even on the paths that have nothing new to ask for.
    const generation = inspectGuard.next();

    const mapping = captureMappingRef.current;
    if (!mapping || !canCapture) return;

    const items = inspectableAnnotations(state.getAnnotations());
    const contexts = await inspectPoints(
      tabId,
      // `toPageCoords`, not a bare unscale: a visible-area capture's image
      // starts at the scroll position it was taken from, so every point on it
      // is that much further down the page than its image coordinate says.
      items.map((annotation) => toPageCoords(inspectAnchor(annotation), mapping)),
      state.pageUrl
    );
    if (!inspectGuard.isCurrent(generation)) return;
    if (contexts.length === 0 || contexts.length !== items.length) return;

    const byId = new Map(items.map((annotation, index) => [annotation.id, contexts[index]]));
    state.setAnnotations((current) =>
      current.map((annotation) => {
        // A redaction is never in `byId`, and the `never`-typed `context` on it
        // means the compiler refuses this write rather than trusting that.
        if (annotation.tool === "redact" || !byId.has(annotation.id)) return annotation;
        const context = byId.get(annotation.id) ?? undefined;
        return context === annotation.context ? annotation : { ...annotation, context };
      })
    );
    // Test hook: the e2e waits on this to know an inspection has landed.
    document.body.dataset.sbInspectGen = String(generation);
  };

  // Picking a row is an explicit "edit this one", so it enters Select - through
  // the palette's own setter, so `interactionMode` keeps exactly one writer and
  // the toolbar cannot be left showing a drawing tool the canvas is not using.
  const selectTimelineItem = (id: string): void => {
    state.setSelectedId(id);
    state.setPaletteTool("select");
    setShouldFocusSelectedComment(true);
  };

  return (
    // A fixed two-pane app shell from `lg` up: the window never scrolls, each
    // column scrolls its own contents, and the capture's scrollport is the one
    // scroller for the capture - so reaching the bottom of a tall screenshot no
    // longer means scrolling the page and then scrolling the image again.
    //
    // Below `lg` there is no room to hold two panes on screen at once, so the
    // shell unwinds: the canvas comes first (it is what the session is about),
    // the sidebar follows it, and the window scrolls normally. DOM order is
    // unchanged - only the visual order flips - so the sidebar keeps its place
    // in the tab sequence and for a screen reader.
    // `minmax(0,1fr)`, not `1fr`: a bare `1fr` track has an automatic minimum,
    // so anything inside the canvas card that refuses to shrink (the tool
    // palette, before it was allowed to wrap) widens the column, overflows the
    // window and clips the capture. The explicit 0 minimum is what keeps the
    // pane's width a property of the window rather than of its contents.
    <main className="grid min-h-screen grid-cols-1 gap-4 p-4 lg:h-screen lg:min-h-0 lg:grid-cols-[360px_minmax(0,1fr)] lg:overflow-hidden lg:p-5">
      {/* The editor's second live region, and the only one that is never
          shown: delete, undo and redo change the canvas and the timeline and
          nothing else, so they succeeded silently for anyone not watching the
          pixels. The visible toast (`status-toast.tsx`) stays the one visible
          status surface - putting these through it would blink a banner over
          the capture on every keystroke of an undo run. */}
      <p id="editor-announcer" className="sr-only" role="status" aria-live="polite">
        {state.announcement}
      </p>
      <Sidebar state={state} exports={exports} onCapture={(mode) => void takeScreenshot(mode)}>
        <Separator />
        <CommentTimeline
          items={state.annotations}
          crop={state.crop}
          selectedId={state.selectedId}
          onSelect={selectTimelineItem}
          onRemove={state.removeAnnotation}
        />
        {/* The link itself is on the clipboard, which is what "Copy" meant -
            printing 90 unreadable characters of `chrome-extension://<id>/...`
            in the sidebar only pushed everything below it down. Still an
            anchor, so Open is a real link (middle-click, new tab), and it
            clears the moment a different export runs so it can never label
            the wrong thing. */}
        {state.shareUrl ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">
              Local share link copied
            </span>
            <a
              className={buttonVariants({ variant: "secondary", size: "sm" })}
              href={state.shareUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open
            </a>
          </div>
        ) : null}

        <Separator />
        <SavedShares
          shares={exports.savedShares}
          onOpen={(id) => window.open(buildLocalShareUrl(id), "_blank")}
          onDelete={(id) => void exports.removeSavedShare(id)}
          onRecapture={(share) => {
            void recaptureShare(share).catch((error: unknown) => {
              state.setStatus({
                kind: "error",
                message: error instanceof Error ? error.message : "Re-capture failed"
              });
            });
          }}
          onBatchExport={(ids) => void exports.copyBatchForClaudeCode(ids)}
          isBusy={state.isBusy}
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
