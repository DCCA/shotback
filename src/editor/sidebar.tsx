import type * as React from "react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useTimedConfirm } from "@/editor/use-confirm";
import type { EditorState } from "@/editor/use-editor-state";
import type { EditorExports } from "@/editor/use-exports";
import { CAPTURE_MODES, type CaptureMode } from "@/lib/capture";
import type { Verbosity } from "@/lib/feedback";
import { numberAnnotations, redactions } from "@/lib/numbering";
import { plural } from "@/lib/utils";

/** How long the "Replace capture?" pair waits before reverting on its own. */
const CAPTURE_CONFIRM_MS = 5000;

interface SidebarProps {
  state: EditorState;
  exports: EditorExports;
  /** Runs a capture in the mode the chooser beside the button is showing. */
  onCapture: (mode: CaptureMode) => void;
  /** Timeline, share link and saved-shares sections, rendered below the status block. */
  children?: React.ReactNode;
}

export function Sidebar({ state, exports, onCapture, children }: SidebarProps): JSX.Element {
  const {
    annotations,
    undoAnnotations,
    redoAnnotations,
    canUndo,
    canRedo,
    removeAnnotation,
    selectedId,
    generalFeedback,
    setGeneralFeedback,
    isBusy,
    baseDataUrl,
    promptVerbosity,
    setPromptVerbosity,
    exportFormat,
    setExportFormat,
    lastExportSize
  } = state;

  // Redactions are not notes: they are never numbered, so counting them here
  // would disagree with the timeline, the pins and the prompt. They get their
  // own count instead, because "how much of this is hidden" is worth saying.
  const noteCount = numberAnnotations(annotations).length;
  const redactedCount = redactions(annotations).length;

  const removeSelected = (): void => {
    if (selectedId) removeAnnotation(selectedId);
  };

  // A capture replaces the image every annotation is anchored to, so with work
  // on screen the button asks first. Nothing to lose with an empty canvas, so
  // nothing is asked there.
  const capture = useTimedConfirm<boolean>(CAPTURE_CONFIRM_MS);
  const captureWouldDiscard = annotations.length > 0;

  // Local, not editor state: the mode is read once, at the click, and nothing
  // else in the session depends on which one is showing.
  const [captureMode, setCaptureMode] = useState<CaptureMode>("full");

  const runCapture = (): void => onCapture(captureMode);

  const startCapture = (): void => {
    capture.arm(null);
    runCapture();
  };

  return (
    // In the fixed shell the sidebar column is exactly the pane's height, so
    // `min-h-0` is what lets it scroll its own contents instead of stretching
    // the grid row. Below `lg` it has no height of its own and the window
    // scrolls, which is why both classes are breakpoint-scoped.
    <Card className="order-2 lg:order-1 lg:min-h-0 lg:overflow-y-auto">
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between">
          <CardTitle as="h1">Shotback Editor</CardTitle>
          {/* The one place the annotation count is stated at all: the timeline
              heading dropped its badge, so there is a single number to trust
              rather than two that can disagree. */}
          <Badge variant="accent">{plural(noteCount, "note")}</Badge>
        </div>
        {capture.armed ? (
          // Escape cancels, and the trigger takes focus back when the pair
          // goes - both from `useTimedConfirm`, so the timed revert restores
          // the keyboard exactly the way an explicit Cancel does.
          <div className="grid grid-cols-2 gap-2" onKeyDown={capture.onKeyDown}>
            <Button
              variant="destructive"
              disabled={isBusy}
              autoFocus
              onClick={capture.onConfirm(runCapture)}
            >
              Replace capture?
            </Button>
            <Button variant="secondary" disabled={isBusy} onClick={() => capture.arm(null)}>
              Cancel
            </Button>
          </div>
        ) : (
          // A split control: one filled primary that captures, and a compact
          // chooser next to it for the two variations. The button always says
          // the same thing because it always does the same thing - capture the
          // page - and the chooser is what says how much of it.
          <div className="flex items-stretch gap-2">
            <Button
              ref={capture.triggerRef(true)}
              // Primary only while it is the way in. Once there is a capture
              // the session's destination is the handoff below, and two filled
              // buttons in one column is no hierarchy at all.
              variant={baseDataUrl ? "secondary" : "default"}
              className="flex-1"
              disabled={isBusy}
              onClick={() => (captureWouldDiscard ? capture.arm(true) : startCapture())}
            >
              Capture Page
            </Button>
            <div className="w-[9.5rem] shrink-0">
              <Select
                aria-label="Capture mode"
                value={captureMode}
                onValueChange={(value) => setCaptureMode(value as CaptureMode)}
                options={CAPTURE_MODES.map((mode) => ({ value: mode.value, label: mode.label }))}
                disabled={isBusy}
                className="text-[13px]"
              />
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Tool, colour and zoom live on the canvas toolbar
            (`tool-palette.tsx`), where the pointer is - they change what the
            next gesture does, not what an export contains. Crop has no rows
            here either: Apply/Cancel float at the marquee and the applied-crop
            chip sits over the canvas (see `annotation-canvas.tsx`). */}

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            General Feedback
          </span>
          <Textarea
            value={generalFeedback}
            onChange={(event) => setGeneralFeedback(event.target.value)}
            rows={3}
            placeholder="Write overall feedback for this screenshot"
          />
        </label>

        <p className="m-0 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          <kbd className="rounded border border-border bg-card px-1 text-[11px]">Esc</kbd>{" "}
          deselects,{" "}
          <kbd className="rounded border border-border bg-card px-1 text-[11px]">Del</kbd> removes
          the selected item,{" "}
          <kbd className="rounded border border-border bg-card px-1 text-[11px]">Ctrl+Z</kbd> undoes
          and{" "}
          <kbd className="rounded border border-border bg-card px-1 text-[11px]">Ctrl+Shift+Z</kbd>{" "}
          redoes. With a crop drawn,{" "}
          <kbd className="rounded border border-border bg-card px-1 text-[11px]">Enter</kbd> applies
          it. Holding{" "}
          <kbd className="rounded border border-border bg-card px-1 text-[11px]">Alt</kbd> over a
          selected redaction shows what is under it.
        </p>

        <div className="space-y-1.5">
          <span
            id="export-format-label"
            className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Export format
          </span>
          <Select
            aria-labelledby="export-format-label"
            value={exportFormat}
            onValueChange={(value) => setExportFormat(value as "png" | "jpeg")}
            options={[
              { value: "png", label: "PNG" },
              { value: "jpeg", label: "JPEG" }
            ]}
          />
        </div>

        <div className="space-y-1.5">
          <span
            id="prompt-verbosity-label"
            className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Prompt detail
          </span>
          <Select
            aria-labelledby="prompt-verbosity-label"
            value={promptVerbosity}
            onValueChange={(value) => setPromptVerbosity(value as Verbosity)}
            options={[
              { value: "compact", label: "Compact" },
              { value: "standard", label: "Standard" },
              { value: "detailed", label: "Detailed" }
            ]}
          />
        </div>

        {/* Three groups, separated: edit what is on the canvas, send the review
            somewhere, or just take the file. Exactly one button is filled -
            the handoff this extension exists for - so the column reads as a
            recommendation rather than a wall of equal choices. */}
        <div id="editor-actions" className="grid grid-cols-1 gap-2">
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={!canUndo || isBusy} onClick={undoAnnotations}>
              Undo
            </Button>
            <Button variant="secondary" disabled={!canRedo || isBusy} onClick={redoAnnotations}>
              Redo
            </Button>
          </div>
          <Button variant="destructive" disabled={!selectedId || isBusy} onClick={removeSelected}>
            Delete Selected Item
          </Button>

          <Separator className="my-1.5" />

          <Button
            variant="default"
            disabled={!baseDataUrl || isBusy}
            onClick={() => void exports.copyForClaudeCode()}
          >
            Copy for Claude Code
          </Button>
          {/* Names the format actually in force: with the pref on JPEG,
              "Saves PNG" was simply wrong about the file it writes. */}
          <p className="m-0 -mt-1 text-xs text-muted-foreground">
            Saves {exportFormat === "jpeg" ? "JPEG" : "PNG"} + JSON to Downloads/shotback and copies
            the prompt.
          </p>
          <Button
            variant="secondary"
            disabled={!baseDataUrl || isBusy}
            onClick={() => void exports.prepareExternalLlmPackage()}
          >
            Prepare for Cloud LLM
          </Button>
          <Button
            variant="secondary"
            disabled={!baseDataUrl || isBusy}
            onClick={() => void exports.createShareUrl()}
          >
            Copy Local Share Link
          </Button>

          <Separator className="my-1.5" />

          <Button
            variant="secondary"
            disabled={!baseDataUrl || isBusy}
            onClick={() => void exports.download()}
          >
            Download Image ({exportFormat === "jpeg" ? "JPEG" : "PNG"})
          </Button>
          <Button
            variant="secondary"
            disabled={!baseDataUrl || isBusy}
            onClick={() => void exports.copyImage()}
          >
            Copy Image
          </Button>
        </div>

        {/* Counts only. What just happened is announced by the canvas toast
            (`status-toast.tsx`), which is the page's one aria-live region -
            a status buried at the bottom of a scrolling sidebar was routinely
            off screen when it mattered. */}
        <div className="space-y-1 text-sm">
          {redactedCount > 0 ? (
            <p className="m-0 text-muted-foreground">
              {plural(redactedCount, "redacted region")} (pixelated here, and in every export and
              saved share)
            </p>
          ) : null}
          {lastExportSize !== null ? (
            <p className="m-0 text-muted-foreground">
              Last export: {Math.max(1, Math.round(lastExportSize / 1024))} KB
            </p>
          ) : null}
        </div>

        {children}
      </CardContent>
    </Card>
  );
}
