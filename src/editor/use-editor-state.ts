import type * as React from "react";
import { useLayoutEffect, useRef, useState } from "react";
import type { CaptureEnvironment } from "@/lib/capture";
import { commit, createHistory, redo, undo, type History } from "@/lib/history";
import type { Annotation, AnnotationTool } from "@/types/annotation";

/**
 * Every piece of editor state the surrounding modules (canvas, sidebar,
 * timeline, exports) read or write. Transient pointer-gesture state stays
 * private to the canvas.
 */
export interface EditorState {
  /** Live annotations, updated on every pointer move during a gesture. */
  annotations: Annotation[];
  setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>;
  /** Undo/redo snapshots: only completed edits land here, never in-gesture state. */
  history: History<Annotation[]>;
  /** Snapshot the latest annotations as one undo entry. */
  commitAnnotations: () => void;
  undoAnnotations: () => void;
  redoAnnotations: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Remove one annotation and snapshot the result - every delete path uses this. */
  removeAnnotation: (id: string) => void;
  /** Clear the annotations and the history, for a fresh capture. */
  resetAnnotations: () => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  tool: AnnotationTool;
  setTool: (tool: AnnotationTool) => void;
  interactionMode: "draw" | "move";
  setInteractionMode: (mode: "draw" | "move") => void;
  color: string;
  setColor: (color: string) => void;
  generalFeedback: string;
  setGeneralFeedback: (value: string) => void;
  status: { kind: "success" | "error"; message: string } | null;
  setStatus: (status: EditorState["status"]) => void;
  isBusy: boolean;
  setIsBusy: (busy: boolean) => void;
  baseDataUrl: string;
  setBaseDataUrl: (url: string) => void;
  pageUrl: string;
  setPageUrl: (url: string) => void;
  /** The captured tab's context, undefined until a capture completes. */
  environment: CaptureEnvironment | undefined;
  setEnvironment: (environment: CaptureEnvironment | undefined) => void;
  imageSize: { width: number; height: number };
  setImageSize: (size: { width: number; height: number }) => void;
  /** How the capture is displayed: scaled to fit the pane, or at its real pixel size. */
  zoom: "fit" | "actual";
  setZoom: (zoom: "fit" | "actual") => void;
  progress: string;
  setProgress: (progress: string) => void;
  shareUrl: string;
  setShareUrl: React.Dispatch<React.SetStateAction<string>>;
}

export function useEditorState(): EditorState {
  const [baseDataUrl, setBaseDataUrl] = useState<string>("");
  const [pageUrl, setPageUrl] = useState<string>("");
  const [environment, setEnvironment] = useState<CaptureEnvironment | undefined>(undefined);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [history, setHistory] = useState<History<Annotation[]>>(() =>
    createHistory<Annotation[]>([])
  );
  const [tool, setTool] = useState<AnnotationTool>("box");
  const [interactionMode, setInteractionMode] = useState<"draw" | "move">("draw");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [color, setColor] = useState("#ff3333");
  const [generalFeedback, setGeneralFeedback] = useState("");
  const [progress, setProgress] = useState<string>("");
  const [status, setStatus] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [shareUrl, setShareUrl] = useState<string>("");
  const [isBusy, setIsBusy] = useState(false);
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 });
  const [zoom, setZoom] = useState<"fit" | "actual">("fit");

  // The canvas commits from inside the pointer handler that just changed the
  // annotations (a `flushSync` create, for one), so the handler's own closure
  // is a render behind. This ref is what "the latest annotations" means there.
  // A layout effect, not a plain one: `flushSync` runs layout effects before it
  // returns, so the ref is already current when that handler resumes.
  const annotationsRef = useRef(annotations);
  useLayoutEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);

  // Same story for the history, one step worse: a commit can come from a
  // passive effect (the comment editor unmounting), and the very next keypress
  // must see it even though React has not re-rendered yet. Every write goes
  // through `applyHistory`, so the ref - not the render value - is the source
  // of truth for what undo/redo operate on.
  const historyRef = useRef(history);

  const applyHistory = (next: History<Annotation[]>): void => {
    historyRef.current = next;
    setHistory(next);
  };

  const commitAnnotations = (): void => {
    applyHistory(commit(historyRef.current, annotationsRef.current));
  };

  const applySnapshot = (next: History<Annotation[]>): void => {
    if (next === historyRef.current) return;
    applyHistory(next);
    setAnnotations(next.present);
    annotationsRef.current = next.present;
    if (selectedId && !next.present.some((item) => item.id === selectedId)) setSelectedId(null);
  };

  const undoAnnotations = (): void => applySnapshot(undo(historyRef.current));

  const redoAnnotations = (): void => applySnapshot(redo(historyRef.current));

  const removeAnnotation = (id: string): void => {
    const next = annotationsRef.current.filter((item) => item.id !== id);
    setAnnotations(next);
    annotationsRef.current = next;
    commitAnnotations();
    if (selectedId === id) setSelectedId(null);
  };

  const resetAnnotations = (): void => {
    const empty: Annotation[] = [];
    setAnnotations(empty);
    annotationsRef.current = empty;
    applyHistory(createHistory(empty));
  };

  return {
    annotations,
    setAnnotations,
    history,
    commitAnnotations,
    undoAnnotations,
    redoAnnotations,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    removeAnnotation,
    resetAnnotations,
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
    setStatus,
    isBusy,
    setIsBusy,
    baseDataUrl,
    setBaseDataUrl,
    pageUrl,
    setPageUrl,
    environment,
    setEnvironment,
    imageSize,
    setImageSize,
    zoom,
    setZoom,
    progress,
    setProgress,
    shareUrl,
    setShareUrl
  };
}
