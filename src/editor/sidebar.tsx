import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { EditorState, EditorTool } from "@/editor/use-editor-state";
import type { EditorExports } from "@/editor/use-exports";
import type { Verbosity } from "@/lib/feedback";
import { numberAnnotations, redactions } from "@/lib/numbering";

interface SidebarProps {
  state: EditorState;
  exports: EditorExports;
  onCapture: () => void;
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
    tool,
    setTool,
    interactionMode,
    setInteractionMode,
    color,
    setColor,
    zoom,
    setZoom,
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

  return (
    // In the fixed shell the sidebar column is exactly the pane's height, so
    // `min-h-0` is what lets it scroll its own contents instead of stretching
    // the grid row. Below `lg` it has no height of its own and the window
    // scrolls, which is why both classes are breakpoint-scoped.
    <Card className="order-2 lg:order-1 lg:min-h-0 lg:overflow-y-auto">
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between">
          <CardTitle as="h1">Shotback Editor</CardTitle>
          <Badge variant="accent">{noteCount} notes</Badge>
        </div>
        <Button disabled={isBusy} onClick={onCapture}>
          Capture Page
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <span
            id="interaction-label"
            className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Interaction
          </span>
          <Select
            aria-labelledby="interaction-label"
            value={interactionMode}
            onValueChange={(value) => setInteractionMode(value as "draw" | "move")}
            options={[
              { value: "draw", label: "Draw New" },
              { value: "move", label: "Move Existing" }
            ]}
          />
        </div>

        <div className="space-y-1.5">
          <span
            id="tool-label"
            className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Tool
          </span>
          <Select
            aria-labelledby="tool-label"
            value={tool}
            onValueChange={(value) => setTool(value as EditorTool)}
            options={[
              { value: "box", label: "Box" },
              { value: "arrow", label: "Arrow" },
              { value: "text", label: "Text" },
              { value: "redact", label: "Redact" },
              { value: "crop", label: "Crop" }
            ]}
          />
        </div>

        {/* Crop has no rows here on purpose: Apply/Cancel float at the marquee
            and the applied-crop chip sits over the canvas (see
            `annotation-canvas.tsx`), so drawing a crop no longer shoves every
            control below it down and back up again. */}

        <div className="space-y-1.5">
          <span
            id="zoom-label"
            className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Zoom
          </span>
          <Select
            aria-labelledby="zoom-label"
            value={zoom}
            onValueChange={(value) => setZoom(value as "fit" | "actual")}
            options={[
              { value: "fit", label: "Fit width" },
              { value: "actual", label: "Actual size (100%)" }
            ]}
          />
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Color
          </span>
          <Input
            type="color"
            aria-label="Annotation color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            className="h-10 cursor-pointer p-1"
          />
        </label>

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
          Draw mode creates annotations. Move mode selects or drags existing annotations. Press{" "}
          <kbd className="rounded border border-border bg-card px-1 text-[11px]">Esc</kbd> to
          deselect and{" "}
          <kbd className="rounded border border-border bg-card px-1 text-[11px]">Del</kbd> to remove
          the selected item.{" "}
          <kbd className="rounded border border-border bg-card px-1 text-[11px]">Ctrl+Z</kbd> undoes
          and{" "}
          <kbd className="rounded border border-border bg-card px-1 text-[11px]">Ctrl+Shift+Z</kbd>{" "}
          redoes.
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

        <div className="grid grid-cols-1 gap-2">
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
            onClick={() => void exports.copyForClaudeCode()}
          >
            Copy for Claude Code
          </Button>
          <Button
            variant="default"
            disabled={!baseDataUrl || isBusy}
            onClick={() => void exports.createShareUrl()}
          >
            Copy Local Share Link
          </Button>
        </div>

        {/* Counts only. What just happened is announced by the canvas toast
            (`status-toast.tsx`), which is the page's one aria-live region -
            a status buried at the bottom of a scrolling sidebar was routinely
            off screen when it mattered. */}
        <div className="space-y-1 text-sm">
          <p className="m-0 text-muted-foreground">Annotations: {noteCount}</p>
          {redactedCount > 0 ? (
            <p className="m-0 text-muted-foreground">
              Redacted regions: {redactedCount} (pixelated in every export and in the saved share)
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
