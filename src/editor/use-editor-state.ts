import type * as React from "react";
import { useState } from "react";
import type { Annotation, AnnotationTool } from "@/types/annotation";

/**
 * Every piece of editor state the surrounding modules (canvas, sidebar,
 * timeline, exports) read or write. Transient pointer-gesture state stays
 * private to the canvas.
 */
export interface EditorState {
  annotations: Annotation[];
  setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>;
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
  imageSize: { width: number; height: number };
  setImageSize: (size: { width: number; height: number }) => void;
  progress: string;
  setProgress: (progress: string) => void;
  shareUrl: string;
  setShareUrl: (url: string) => void;
}

export function useEditorState(): EditorState {
  const [baseDataUrl, setBaseDataUrl] = useState<string>("");
  const [pageUrl, setPageUrl] = useState<string>("");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
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

  return {
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
    setStatus,
    isBusy,
    setIsBusy,
    baseDataUrl,
    setBaseDataUrl,
    pageUrl,
    setPageUrl,
    imageSize,
    setImageSize,
    progress,
    setProgress,
    shareUrl,
    setShareUrl
  };
}
