import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { EditorState } from "@/editor/use-editor-state";
import type { EditorExports } from "@/editor/use-exports";
import type { AnnotationTool } from "@/types/annotation";

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
    setAnnotations,
    selectedId,
    setSelectedId,
    tool,
    setTool,
    interactionMode,
    setInteractionMode,
    color,
    setColor,
    generalFeedback,
    setGeneralFeedback,
    status,
    isBusy,
    baseDataUrl,
    progress
  } = state;

  const removeLast = (): void => {
    const removed = annotations[annotations.length - 1];
    setAnnotations((prev) => prev.slice(0, -1));
    if (removed && selectedId === removed.id) setSelectedId(null);
  };

  const removeSelected = (): void => {
    if (!selectedId) return;
    setAnnotations((prev) => prev.filter((item) => item.id !== selectedId));
    setSelectedId(null);
  };

  return (
    <Card className="lg:max-h-[calc(100vh-2.5rem)] lg:overflow-auto">
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between">
          <CardTitle as="h1">Shotback Editor</CardTitle>
          <Badge variant="accent">{annotations.length} notes</Badge>
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
            onValueChange={(value) => setTool(value as AnnotationTool)}
            options={[
              { value: "box", label: "Box" },
              { value: "arrow", label: "Arrow" },
              { value: "text", label: "Text" }
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
          the selected item.
        </p>

        <div className="grid grid-cols-1 gap-2">
          <Button variant="secondary" disabled={!baseDataUrl || isBusy} onClick={removeLast}>
            Undo Last Change
          </Button>
          <Button variant="destructive" disabled={!selectedId || isBusy} onClick={removeSelected}>
            Delete Selected Item
          </Button>
          <Button
            variant="secondary"
            disabled={!baseDataUrl || isBusy}
            onClick={() => void exports.download()}
          >
            Download Image (PNG)
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

        <div className="space-y-1 text-sm" aria-live="polite">
          {progress ? <p className="m-0 text-muted-foreground">{progress}</p> : null}
          {status ? (
            <p
              className={`m-0 font-medium ${
                status.kind === "success" ? "text-primary" : "text-destructive"
              }`}
            >
              {status.message}
            </p>
          ) : null}
          <p className="m-0 text-muted-foreground">Annotations: {annotations.length}</p>
        </div>

        {children}
      </CardContent>
    </Card>
  );
}
