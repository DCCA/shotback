import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { exportAnnotatedImage } from "@/lib/annotate";
import { captureFullPage } from "@/lib/capture";
import { buildLocalShareUrl, saveLocalShare } from "@/lib/localStore";
import type { Annotation, AnnotationTool } from "@/types/annotation";
import "@/styles/globals.css";

interface DraftShape {
  xStart: number;
  yStart: number;
  xCurrent: number;
  yCurrent: number;
}

interface DragState {
  id: string;
  startX: number;
  startY: number;
  original: Annotation;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function moveAnnotation(annotation: Annotation, dx: number, dy: number): Annotation {
  if (annotation.tool === "box") {
    return { ...annotation, x: annotation.x + dx, y: annotation.y + dy };
  }

  if (annotation.tool === "arrow") {
    return {
      ...annotation,
      x1: annotation.x1 + dx,
      y1: annotation.y1 + dy,
      x2: annotation.x2 + dx,
      y2: annotation.y2 + dy
    };
  }

  return { ...annotation, x: annotation.x + dx, y: annotation.y + dy };
}

function annotationCommentAnchor(annotation: Annotation): { x: number; y: number } | null {
  if (annotation.tool === "box") {
    return { x: annotation.x, y: annotation.y };
  }

  if (annotation.tool === "arrow") {
    return { x: Math.min(annotation.x1, annotation.x2), y: Math.min(annotation.y1, annotation.y2) };
  }

  return { x: annotation.x, y: annotation.y };
}

function annotationSummary(annotation: Annotation): string {
  if (annotation.tool === "text") return annotation.text;
  return annotation.comment?.trim() || "(no comment)";
}

function buildExternalLlmPrompt(params: {
  pageUrl: string;
  generalFeedback: string;
  annotations: Annotation[];
}): string {
  const comments = params.annotations
    .map((annotation, index) => {
      if (annotation.tool === "text") {
        return `${index + 1}. [text] ${annotation.text || "(empty)"}`;
      }

      return `${index + 1}. [${annotation.tool}] ${annotation.comment?.trim() || "(no comment)"}`;
    })
    .join("\n");

  return [
    "Please review this screenshot and provide feedback.",
    "",
    `Page URL: ${params.pageUrl || "(unknown)"}`,
    `General feedback context: ${params.generalFeedback.trim() || "(none)"}`,
    "",
    "Area comments:",
    comments || "(none)"
  ].join("\n");
}

function EditorApp(): JSX.Element {
  const search = new URLSearchParams(window.location.search);
  const tabId = Number(search.get("tabId"));
  const windowId = Number(search.get("windowId"));

  const svgRef = useRef<SVGSVGElement | null>(null);
  const inlineCommentRef = useRef<HTMLTextAreaElement | null>(null);

  const [baseDataUrl, setBaseDataUrl] = useState<string>("");
  const [pageUrl, setPageUrl] = useState<string>("");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [tool, setTool] = useState<AnnotationTool>("box");
  const [interactionMode, setInteractionMode] = useState<"draw" | "move">("draw");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [color, setColor] = useState("#ff3333");
  const [generalFeedback, setGeneralFeedback] = useState("");
  const [progress, setProgress] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [shareUrl, setShareUrl] = useState<string>("");
  const [draft, setDraft] = useState<DraftShape | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 });
  const [shouldFocusSelectedComment, setShouldFocusSelectedComment] = useState(false);
  const selectedAnnotation = annotations.find((item) => item.id === selectedId) ?? null;
  const selectedNote = selectedAnnotation
    ? selectedAnnotation.tool === "text"
      ? selectedAnnotation.text
      : selectedAnnotation.comment ?? ""
    : "";
  const selectedAnchor = selectedAnnotation ? annotationCommentAnchor(selectedAnnotation) : null;

  const canCapture = Number.isFinite(tabId) && Number.isFinite(windowId);
  const timelineItems = [...annotations].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const inlineEditorPosition = selectedAnchor
    ? {
        x: Math.max(10, Math.min(selectedAnchor.x + 14, imageSize.width - 250)),
        y: Math.max(10, Math.min(selectedAnchor.y + 14, imageSize.height - 90))
      }
    : null;

  useEffect(() => {
    if (!shouldFocusSelectedComment) return;
    if (!selectedAnnotation) return;

    inlineCommentRef.current?.focus();
    inlineCommentRef.current?.select();
    setShouldFocusSelectedComment(false);
  }, [selectedAnnotation, shouldFocusSelectedComment]);

  const takeScreenshot = async (): Promise<void> => {
    if (!canCapture) {
      setStatus("Missing target tab information. Open this page from the extension popup.");
      return;
    }

    setIsBusy(true);
    setStatus("");
    setShareUrl("");
    setAnnotations([]);
    setSelectedId(null);
    setGeneralFeedback("");

    try {
      const result = await captureFullPage(tabId, windowId, (index, total) => {
        setProgress(`Capturing ${index}/${total}...`);
      });
      setBaseDataUrl(result.dataUrl);
      setPageUrl(result.pageUrl);
      setProgress("Capture completed");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Capture failed");
    } finally {
      setIsBusy(false);
    }
  };

  const createShareUrl = async (): Promise<void> => {
    if (!baseDataUrl) {
      setStatus("Capture a screenshot before creating a share link.");
      return;
    }

    setIsBusy(true);
    setStatus("");

    try {
      const merged = await exportAnnotatedImage(baseDataUrl, annotations, { generalFeedback });
      const share = await saveLocalShare({
        imageDataUrl: merged,
        annotations,
        pageUrl,
        generalFeedback
      });
      const localUrl = buildLocalShareUrl(share.id);
      setShareUrl(localUrl);
      await navigator.clipboard.writeText(localUrl);
      setStatus("Local share link generated and copied to clipboard.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Share creation failed");
    } finally {
      setIsBusy(false);
    }
  };

  const pointerPos = (event: React.PointerEvent<SVGElement>): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };

    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;

    const matrix = svg.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };

    const transformed = point.matrixTransform(matrix.inverse());
    return { x: transformed.x, y: transformed.y };
  };

  const onCanvasPointerDown = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (!baseDataUrl) return;

    if (interactionMode !== "draw") {
      setSelectedId(null);
      return;
    }

    setSelectedId(null);

    const { x, y } = pointerPos(event);

    if (tool === "text") {
      const item: Annotation = {
        id: uid(),
        tool: "text",
        x,
        y,
        text: "",
        color,
        createdAt: new Date().toISOString()
      };

      setAnnotations((prev) => [...prev, item]);
      setSelectedId(item.id);
      setInteractionMode("move");
      setShouldFocusSelectedComment(true);
      return;
    }

    setDraft({ xStart: x, yStart: y, xCurrent: x, yCurrent: y });
  };

  const onAnnotationPointerDown =
    (item: Annotation) => (event: React.PointerEvent<SVGElement>): void => {
      event.stopPropagation();
      setSelectedId(item.id);

      if (interactionMode !== "move") {
        return;
      }

      event.preventDefault();

      const { x, y } = pointerPos(event);
      setDrag({
        id: item.id,
        startX: x,
        startY: y,
        original: item
      });
    };

  const onCanvasPointerMove = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (drag) {
      const { x, y } = pointerPos(event);
      const dx = x - drag.startX;
      const dy = y - drag.startY;
      setAnnotations((prev) =>
        prev.map((item) => (item.id === drag.id ? moveAnnotation(drag.original, dx, dy) : item))
      );
      return;
    }

    if (!draft) return;

    const { x, y } = pointerPos(event);
    setDraft((prev) => (prev ? { ...prev, xCurrent: x, yCurrent: y } : null));
  };

  const onCanvasPointerUp = (): void => {
    if (drag) {
      setDrag(null);
      return;
    }

    if (!draft) return;

    if (tool === "box") {
      const x = Math.min(draft.xStart, draft.xCurrent);
      const y = Math.min(draft.yStart, draft.yCurrent);
      const width = Math.abs(draft.xCurrent - draft.xStart);
      const height = Math.abs(draft.yCurrent - draft.yStart);

      if (width > 5 && height > 5) {
        const item: Annotation = {
          id: uid(),
          tool: "box",
          x,
          y,
          width,
          height,
          color,
          comment: "",
          createdAt: new Date().toISOString()
        };
        setAnnotations((prev) => [...prev, item]);
        setSelectedId(item.id);
        setInteractionMode("move");
        setShouldFocusSelectedComment(true);
      }
    }

    if (tool === "arrow") {
      const item: Annotation = {
        id: uid(),
        tool: "arrow",
        x1: draft.xStart,
        y1: draft.yStart,
        x2: draft.xCurrent,
        y2: draft.yCurrent,
        color,
        comment: "",
        createdAt: new Date().toISOString()
      };
      setAnnotations((prev) => [...prev, item]);
      setSelectedId(item.id);
      setInteractionMode("move");
      setShouldFocusSelectedComment(true);
    }

    setDraft(null);
  };

  const updateSelectedAnnotationNote = (value: string): void => {
    if (!selectedId) return;
    setAnnotations((prev) =>
      prev.map((item) => {
        if (item.id !== selectedId) return item;
        if (item.tool === "text") return { ...item, text: value };
        return { ...item, comment: value };
      })
    );
  };

  const removeLast = (): void => {
    setAnnotations((prev) => prev.slice(0, -1));
    setSelectedId(null);
  };

  const removeSelected = (): void => {
    if (!selectedId) return;
    setAnnotations((prev) => prev.filter((item) => item.id !== selectedId));
    setSelectedId(null);
  };

  const removeById = (id: string): void => {
    setAnnotations((prev) => prev.filter((item) => item.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
  };

  const download = async (): Promise<void> => {
    if (!baseDataUrl) return;
    const merged = await exportAnnotatedImage(baseDataUrl, annotations, { generalFeedback });
    const a = document.createElement("a");
    a.href = merged;
    a.download = `shotback-${Date.now()}.png`;
    a.click();
  };

  const prepareExternalLlmPackage = async (): Promise<void> => {
    if (!baseDataUrl) {
      setStatus("Capture a screenshot before preparing LLM package.");
      return;
    }

    try {
      const merged = await exportAnnotatedImage(baseDataUrl, annotations, { generalFeedback });
      const prompt = buildExternalLlmPrompt({
        pageUrl,
        generalFeedback,
        annotations
      });

      const a = document.createElement("a");
      a.href = merged;
      a.download = `shotback-llm-${Date.now()}.png`;
      a.click();

      await navigator.clipboard.writeText(prompt);
      setStatus("Prompt copied. Annotated image downloaded. Attach image to external LLM manually.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to prepare external LLM package");
    }
  };

  return (
    <div className="grid min-h-screen grid-cols-1 gap-4 p-4 lg:grid-cols-[360px_1fr] lg:p-5">
      <Card className="lg:max-h-[calc(100vh-2.5rem)] lg:overflow-auto">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between">
            <CardTitle>Shotback Editor</CardTitle>
            <Badge variant="accent">{annotations.length} notes</Badge>
          </div>
          <Button disabled={isBusy} onClick={() => void takeScreenshot()}>
            Capture Page
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Interaction
            </span>
            <Select
              value={interactionMode}
              onChange={(event) => setInteractionMode(event.target.value as "draw" | "move")}
            >
              <option value="draw">Draw New</option>
              <option value="move">Move Existing</option>
            </Select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tool</span>
            <Select value={tool} onChange={(event) => setTool(event.target.value as AnnotationTool)}>
              <option value="box">Box</option>
              <option value="arrow">Arrow</option>
              <option value="text">Text</option>
            </Select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Color</span>
            <Input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              General Feedback
            </span>
            <Textarea
              value={generalFeedback}
              onChange={(event) => setGeneralFeedback(event.target.value)}
              rows={3}
              placeholder="Write overall feedback for this screenshot"
            />
          </label>

          <p className="m-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Draw mode creates annotations. Move mode selects or drags existing annotations.
          </p>

          <div className="grid grid-cols-1 gap-2">
            <Button variant="secondary" disabled={!baseDataUrl || isBusy} onClick={removeLast}>
              Undo Last Change
            </Button>
            <Button variant="destructive" disabled={!selectedId || isBusy} onClick={removeSelected}>
              Delete Selected Item
            </Button>
            <Button variant="secondary" disabled={!baseDataUrl || isBusy} onClick={() => void download()}>
              Download Image (PNG)
            </Button>
            <Button
              variant="secondary"
              disabled={!baseDataUrl || isBusy}
              onClick={() => void prepareExternalLlmPackage()}
            >
              Prepare for Cloud LLM
            </Button>
            <Button
              variant="default"
              disabled={!baseDataUrl || isBusy}
              onClick={() => void createShareUrl()}
            >
              Copy Local Share Link
            </Button>
          </div>

          <div className="space-y-1 text-sm">
            {progress ? <p className="m-0 text-slate-700">{progress}</p> : null}
            {status ? <p className="m-0 font-medium text-red-700">{status}</p> : null}
            <p className="m-0 text-slate-700">Annotations: {annotations.length}</p>
          </div>

          <Separator />
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="m-0 text-sm font-semibold">Comment Timeline</h2>
              <Badge>{timelineItems.length}</Badge>
            </div>
            {timelineItems.length === 0 ? (
              <p className="m-0 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                No comments yet.
              </p>
            ) : (
              <ol className="m-0 grid list-none gap-2 p-0">
                {timelineItems.map((item, index) => {
                  const selected = item.id === selectedId;
                  return (
                    <li key={item.id}>
                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        <button
                          type="button"
                          className={`rounded-lg border px-3 py-2 text-left transition ${
                            selected
                              ? "border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200"
                              : "border-slate-200 bg-white hover:bg-slate-50"
                          }`}
                          onClick={() => {
                            setSelectedId(item.id);
                            setInteractionMode("move");
                            setShouldFocusSelectedComment(true);
                          }}
                        >
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            #{index + 1} {item.tool} • {new Date(item.createdAt).toLocaleTimeString()}
                          </div>
                          <div className="mt-1 text-sm text-slate-800">{annotationSummary(item)}</div>
                        </button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="self-start text-red-700 hover:bg-red-50"
                          aria-label={`Delete timeline item ${index + 1}`}
                          onClick={() => removeById(item.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
          {shareUrl ? (
            <a
              href={shareUrl}
              target="_blank"
              rel="noreferrer"
              className="block text-sm font-medium text-emerald-700 underline underline-offset-2"
            >
              {shareUrl}
            </a>
          ) : null}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="p-4">
          {baseDataUrl ? (
            <div className="relative inline-block rounded-lg border border-slate-200 bg-white">
            <img
              id="capture-image"
              src={baseDataUrl}
              alt="Captured page"
              className="block h-auto max-w-none"
              onLoad={(event) => {
                const img = event.currentTarget;
                setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
              }}
            />
            <svg
              ref={svgRef}
              className={`absolute inset-0 h-full w-full ${
                interactionMode === "move" ? "cursor-grab" : "cursor-crosshair"
              }`}
              viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}
              onPointerDown={onCanvasPointerDown}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={onCanvasPointerUp}
              onPointerLeave={onCanvasPointerUp}
            >
              <defs>
                <marker
                  id="arrow-head"
                  markerWidth="10"
                  markerHeight="10"
                  refX="7"
                  refY="3"
                  orient="auto"
                >
                  <polygon points="0 0, 8 3, 0 6" fill="currentColor" />
                </marker>
              </defs>

              {annotations.map((item) => {
                const isSelected = selectedId === item.id;
                const anchor = annotationCommentAnchor(item);

                if (item.tool === "box") {
                  return (
                    <g key={item.id} onPointerDown={onAnnotationPointerDown(item)}>
                      <rect
                        x={item.x}
                        y={item.y}
                        width={item.width}
                        height={item.height}
                        fill="transparent"
                        stroke={item.color}
                        strokeWidth={isSelected ? "4" : "3"}
                        strokeDasharray={isSelected ? "8 5" : undefined}
                        pointerEvents="all"
                      />
                      {item.comment && anchor ? (
                        <g pointerEvents="none">
                          <rect
                            x={anchor.x}
                            y={Math.max(0, anchor.y - 24)}
                            width={Math.max(52, item.comment.length * 8 + 14)}
                            height={22}
                            rx={4}
                            fill="rgba(255,255,255,0.92)"
                            stroke={item.color}
                            strokeWidth="1"
                          />
                          <text
                            x={anchor.x + 7}
                            y={Math.max(14, anchor.y - 9)}
                            fill={item.color}
                            fontSize="13"
                            fontWeight="600"
                          >
                            {item.comment}
                          </text>
                        </g>
                      ) : null}
                    </g>
                  );
                }

                if (item.tool === "arrow") {
                  return (
                    <g key={item.id} onPointerDown={onAnnotationPointerDown(item)}>
                      <line
                        x1={item.x1}
                        y1={item.y1}
                        x2={item.x2}
                        y2={item.y2}
                        stroke="transparent"
                        strokeWidth="14"
                      />
                      <line
                        x1={item.x1}
                        y1={item.y1}
                        x2={item.x2}
                        y2={item.y2}
                        stroke={item.color}
                        strokeWidth={isSelected ? "4" : "3"}
                        markerEnd="url(#arrow-head)"
                        strokeDasharray={isSelected ? "8 5" : undefined}
                        pointerEvents="none"
                      />
                      {item.comment && anchor ? (
                        <g pointerEvents="none">
                          <rect
                            x={anchor.x}
                            y={Math.max(0, anchor.y - 24)}
                            width={Math.max(52, item.comment.length * 8 + 14)}
                            height={22}
                            rx={4}
                            fill="rgba(255,255,255,0.92)"
                            stroke={item.color}
                            strokeWidth="1"
                          />
                          <text
                            x={anchor.x + 7}
                            y={Math.max(14, anchor.y - 9)}
                            fill={item.color}
                            fontSize="13"
                            fontWeight="600"
                          >
                            {item.comment}
                          </text>
                        </g>
                      ) : null}
                    </g>
                  );
                }

                return (
                  <text
                    key={item.id}
                    x={item.x}
                    y={item.y}
                    fill={item.color}
                    fontSize="18"
                    fontWeight={isSelected ? "700" : "500"}
                  onPointerDown={onAnnotationPointerDown(item)}
                >
                  {item.text}
                </text>
              );
              })}

              {selectedAnnotation && inlineEditorPosition ? (
                <foreignObject
                  x={inlineEditorPosition.x}
                  y={inlineEditorPosition.y}
                  width={240}
                  height={84}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <div className="h-full w-full rounded-lg border-2 border-emerald-600 bg-white/95 p-1.5 shadow-lg">
                    <textarea
                      ref={inlineCommentRef}
                      className="h-full w-full resize-none rounded-md border border-slate-300 bg-white px-2 py-1 text-[13px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/50"
                      value={selectedNote}
                      onChange={(event) => updateSelectedAnnotationNote(event.target.value)}
                      placeholder="Add comment for selected area"
                      rows={3}
                    />
                  </div>
                </foreignObject>
              ) : null}

              {draft && tool === "box" ? (
                <rect
                  x={Math.min(draft.xStart, draft.xCurrent)}
                  y={Math.min(draft.yStart, draft.yCurrent)}
                  width={Math.abs(draft.xCurrent - draft.xStart)}
                  height={Math.abs(draft.yCurrent - draft.yStart)}
                  fill="transparent"
                  stroke={color}
                  strokeWidth="2"
                  strokeDasharray="6 4"
                />
              ) : null}

              {draft && tool === "arrow" ? (
                <line
                  x1={draft.xStart}
                  y1={draft.yStart}
                  x2={draft.xCurrent}
                  y2={draft.yCurrent}
                  stroke={color}
                  strokeWidth="2"
                  strokeDasharray="6 4"
                />
              ) : null}
            </svg>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center text-sm text-slate-600">
            Capture a page to start annotating.
          </div>
        )}
        </CardContent>
      </Card>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<EditorApp />);
