import { useCallback, useEffect, useState } from "react";
import type { EditorState } from "@/editor/use-editor-state";
import { exportAnnotatedImage } from "@/lib/annotate";
import { applyCrop, clampCrop, type Rect } from "@/lib/crop";
import { buildClaudeCodePrompt, buildExternalLlmPrompt } from "@/lib/feedback";
import {
  buildLocalShareUrl,
  deleteLocalShare,
  listLocalShares,
  saveLocalShare,
  type LocalShareMeta
} from "@/lib/localStore";
import { buildSidecar } from "@/lib/sidecar";
import { toClaudePath } from "@/lib/wslPath";
import type { Annotation } from "@/types/annotation";

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The prompt builders' optional `image` param, present only once a real
 * capture has replaced the 1x1 placeholder `imageSize` starts at.
 */
function promptImage(imageSize: {
  width: number;
  height: number;
}): { width: number; height: number } | undefined {
  return imageSize.width > 1 ? imageSize : undefined;
}

/**
 * What every output renders. Annotations are stored in capture space and only
 * shifted here, once, so the exported image, both prompts, the JSON sidecar
 * and a saved share always describe the same picture: with no crop, the whole
 * capture; with one, the crop region, the annotations `applyCrop` kept, and
 * the crop's own size wherever an image size is reported.
 */
interface ExportView {
  annotations: Annotation[];
  /** Passed to `exportAnnotatedImage`; absent when the whole capture is exported. */
  crop?: Rect;
  image: { width: number; height: number };
}

function exportView(state: EditorState): ExportView {
  if (!state.crop) return { annotations: state.annotations, image: state.imageSize };

  const crop = clampCrop(state.crop, state.imageSize);
  return {
    annotations: applyCrop(state.annotations, crop),
    crop,
    image: { width: crop.width, height: crop.height }
  };
}

/**
 * Resolve a completed download's absolute on-disk path. Polls because the path
 * is only populated once Chrome finishes writing the file. Returns "" if the
 * path cannot be resolved (interrupted, or still pending after the timeout).
 */
export async function resolveDownloadPath(downloadId: number): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const [item] = await chrome.downloads.search({ id: downloadId });
    if (item?.state === "complete" && item.filename) return item.filename;
    if (item?.state === "interrupted") return "";
    await delay(150);
  }
  const [item] = await chrome.downloads.search({ id: downloadId });
  return item?.state === "complete" ? (item.filename ?? "") : "";
}

/**
 * Save one blob under `Downloads/<relativeName>` and resolve its absolute
 * on-disk path ("" when Chrome never reported one). The object URL is revoked
 * as soon as the download has been written.
 */
async function downloadBlob(blob: Blob, relativeName: string): Promise<string> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const downloadId = await chrome.downloads.download({
      url: objectUrl,
      filename: relativeName,
      conflictAction: "uniquify",
      saveAs: false
    });
    return await resolveDownloadPath(downloadId);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Write the JSON sidecar next to the PNG (same timestamp) and return the path
 * the prompt should point at, "" when it could not be written. Best effort by
 * design: the sidecar is an aid, so failing to save it costs the prompt its
 * machine-readable line and nothing else.
 */
async function saveSidecar(
  state: EditorState,
  view: ExportView,
  stamp: number,
  imagePath: string
): Promise<string> {
  try {
    const sidecar = buildSidecar({
      capturedAt: state.environment?.capturedAt ?? new Date(stamp).toISOString(),
      pageUrl: state.pageUrl,
      generalFeedback: state.generalFeedback,
      annotations: view.annotations,
      image: view.image,
      imagePath,
      environment: state.environment,
      diagnostics: state.diagnostics
    });
    const blob = new Blob([JSON.stringify(sidecar, null, 2)], { type: "application/json" });
    const absolutePath = await downloadBlob(blob, `shotback/cap-${stamp}.json`);
    return absolutePath ? toClaudePath(absolutePath) : "";
  } catch {
    return "";
  }
}

export interface EditorExports {
  download: () => Promise<void>;
  copyImage: () => Promise<void>;
  prepareExternalLlmPackage: () => Promise<void>;
  copyForClaudeCode: () => Promise<void>;
  createShareUrl: () => Promise<void>;
  savedShares: LocalShareMeta[];
  refreshSavedShares: () => Promise<void>;
  removeSavedShare: (id: string) => Promise<void>;
}

export function useExports(state: EditorState): EditorExports {
  const [savedShares, setSavedShares] = useState<LocalShareMeta[]>([]);

  const refreshSavedShares = useCallback(async (): Promise<void> => {
    try {
      setSavedShares(await listLocalShares());
    } catch {
      // Listing saved shares is best-effort; ignore transient storage errors.
    }
  }, []);

  useEffect(() => {
    void refreshSavedShares();
  }, [refreshSavedShares]);

  const createShareUrl = async (): Promise<void> => {
    if (!state.baseDataUrl) {
      state.setStatus({
        kind: "error",
        message: "Capture a screenshot before creating a share link."
      });
      return;
    }

    state.setIsBusy(true);
    state.setStatus(null);

    try {
      const view = exportView(state);
      const merged = await exportAnnotatedImage(state.baseDataUrl, view.annotations, {
        generalFeedback: state.generalFeedback,
        crop: view.crop
      });
      const share = await saveLocalShare({
        imageDataUrl: merged,
        annotations: view.annotations,
        pageUrl: state.pageUrl,
        generalFeedback: state.generalFeedback,
        environment: state.environment
      });
      const localUrl = buildLocalShareUrl(share.id);
      state.setShareUrl(localUrl);
      await navigator.clipboard.writeText(localUrl);
      state.setStatus({
        kind: "success",
        message: "Local share link generated and copied to clipboard."
      });
      await refreshSavedShares();
    } catch (error) {
      state.setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Share creation failed"
      });
    } finally {
      state.setIsBusy(false);
    }
  };

  const removeSavedShare = async (id: string): Promise<void> => {
    try {
      await deleteLocalShare(id);
      await refreshSavedShares();
      state.setShareUrl((current) => (current === buildLocalShareUrl(id) ? "" : current));
    } catch (error) {
      state.setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Failed to delete saved share"
      });
    }
  };

  const download = async (): Promise<void> => {
    if (!state.baseDataUrl) {
      state.setStatus({ kind: "error", message: "Capture a screenshot before downloading." });
      return;
    }

    // Cleared up front: the success message is worded the same on every call,
    // so without this a second download in a row leaves stale text on screen.
    state.setStatus(null);

    try {
      const view = exportView(state);
      const merged = await exportAnnotatedImage(state.baseDataUrl, view.annotations, {
        generalFeedback: state.generalFeedback,
        crop: view.crop
      });
      const a = document.createElement("a");
      a.href = merged;
      a.download = `shotback-${Date.now()}.png`;
      a.click();
      state.setStatus({ kind: "success", message: "Annotated image downloaded." });
    } catch (error) {
      state.setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Failed to download image"
      });
    }
  };

  // Copy the annotated PNG to the clipboard so it can be pasted straight into
  // an agent chat (Claude Code, Cursor, ...) without saving a file first.
  const copyImage = async (): Promise<void> => {
    if (!state.baseDataUrl) {
      state.setStatus({ kind: "error", message: "Capture a screenshot before copying." });
      return;
    }

    // Cleared up front: the success message is worded the same on every call,
    // so without this a second copy in a row leaves stale text on screen.
    state.setStatus(null);

    try {
      const view = exportView(state);
      const merged = await exportAnnotatedImage(state.baseDataUrl, view.annotations, {
        generalFeedback: state.generalFeedback,
        crop: view.crop
      });
      const blob = await (await fetch(merged)).blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      state.setStatus({
        kind: "success",
        message: "Annotated image copied. Paste it into your agent chat."
      });
    } catch (error) {
      state.setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Failed to copy image"
      });
    }
  };

  const prepareExternalLlmPackage = async (): Promise<void> => {
    if (!state.baseDataUrl) {
      state.setStatus({
        kind: "error",
        message: "Capture a screenshot before preparing LLM package."
      });
      return;
    }

    // Cleared up front, like the other async exports: the success message is
    // worded the same on every call, so without this a second copy in a row
    // leaves stale text on screen with no visible sign the click did anything.
    state.setStatus(null);

    try {
      const view = exportView(state);
      const merged = await exportAnnotatedImage(state.baseDataUrl, view.annotations, {
        generalFeedback: state.generalFeedback,
        crop: view.crop
      });
      const prompt = buildExternalLlmPrompt({
        pageUrl: state.pageUrl,
        generalFeedback: state.generalFeedback,
        annotations: view.annotations,
        environment: state.environment,
        diagnostics: state.diagnostics,
        image: promptImage(view.image),
        verbosity: state.promptVerbosity
      });

      const a = document.createElement("a");
      a.href = merged;
      a.download = `shotback-llm-${Date.now()}.png`;
      a.click();

      await navigator.clipboard.writeText(prompt);
      state.setStatus({
        kind: "success",
        message: "Prompt copied. Annotated image downloaded. Attach image to external LLM manually."
      });
    } catch (error) {
      state.setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Failed to prepare external LLM package"
      });
    }
  };

  // Save the annotated image plus a JSON sidecar to Downloads/shotback and copy
  // a Claude Code prompt that references both by path - translating a Windows
  // path to its WSL /mnt equivalent so a WSL session can read them directly. No
  // network involved.
  const copyForClaudeCode = async (): Promise<void> => {
    if (!state.baseDataUrl) {
      state.setStatus({
        kind: "error",
        message: "Capture a screenshot before copying for Claude Code."
      });
      return;
    }

    state.setIsBusy(true);
    state.setStatus(null);

    try {
      const view = exportView(state);
      const merged = await exportAnnotatedImage(state.baseDataUrl, view.annotations, {
        generalFeedback: state.generalFeedback,
        crop: view.crop
      });
      const stamp = Date.now();
      const imageName = `shotback/cap-${stamp}.png`;

      const absolutePath = await downloadBlob(await (await fetch(merged)).blob(), imageName);
      const filePath = absolutePath ? toClaudePath(absolutePath) : `Downloads/${imageName}`;
      const sidecarPath = await saveSidecar(state, view, stamp, imageName);

      const prompt = buildClaudeCodePrompt({
        filePath,
        sidecarPath: sidecarPath || undefined,
        pageUrl: state.pageUrl,
        generalFeedback: state.generalFeedback,
        annotations: view.annotations,
        environment: state.environment,
        diagnostics: state.diagnostics,
        image: promptImage(view.image),
        verbosity: state.promptVerbosity
      });
      await navigator.clipboard.writeText(prompt);

      const problems = [
        absolutePath
          ? ""
          : "the image's full path could not be resolved, so the prompt carries a relative one",
        sidecarPath ? "" : "the JSON sidecar could not be saved, so the prompt does not link one"
      ].filter(Boolean);

      state.setStatus(
        problems.length === 0
          ? {
              kind: "success",
              message:
                "Copied a Claude Code prompt with the image and JSON paths. Paste it into your session."
            }
          : { kind: "error", message: `Prompt copied, but ${problems.join(", and ")}.` }
      );
    } catch (error) {
      state.setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Failed to copy for Claude Code"
      });
    } finally {
      state.setIsBusy(false);
    }
  };

  return {
    download,
    copyImage,
    prepareExternalLlmPackage,
    copyForClaudeCode,
    createShareUrl,
    savedShares,
    refreshSavedShares,
    removeSavedShare
  };
}
