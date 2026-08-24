import { useCallback, useEffect, useState } from "react";
import type { EditorState } from "@/editor/use-editor-state";
import { exportAnnotatedImage } from "@/lib/annotate";
import { buildClaudeCodePrompt, buildExternalLlmPrompt } from "@/lib/feedback";
import {
  buildLocalShareUrl,
  deleteLocalShare,
  listLocalShares,
  saveLocalShare,
  type LocalShareMeta
} from "@/lib/localStore";
import { toClaudePath } from "@/lib/wslPath";

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
      const merged = await exportAnnotatedImage(state.baseDataUrl, state.annotations, {
        generalFeedback: state.generalFeedback
      });
      const share = await saveLocalShare({
        imageDataUrl: merged,
        annotations: state.annotations,
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

    try {
      const merged = await exportAnnotatedImage(state.baseDataUrl, state.annotations, {
        generalFeedback: state.generalFeedback
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
    try {
      const merged = await exportAnnotatedImage(state.baseDataUrl, state.annotations, {
        generalFeedback: state.generalFeedback
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

    try {
      const merged = await exportAnnotatedImage(state.baseDataUrl, state.annotations, {
        generalFeedback: state.generalFeedback
      });
      const prompt = buildExternalLlmPrompt({
        pageUrl: state.pageUrl,
        generalFeedback: state.generalFeedback,
        annotations: state.annotations,
        environment: state.environment,
        image: promptImage(state.imageSize)
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

  // Save the annotated image to Downloads/shotback and copy a Claude Code prompt
  // that references the file by path - translating a Windows path to its WSL
  // /mnt equivalent so a WSL session can read it directly. No network involved.
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
    let objectUrl = "";

    try {
      const merged = await exportAnnotatedImage(state.baseDataUrl, state.annotations, {
        generalFeedback: state.generalFeedback
      });
      const blob = await (await fetch(merged)).blob();
      objectUrl = URL.createObjectURL(blob);
      const relativeName = `shotback/cap-${Date.now()}.png`;

      const downloadId = await chrome.downloads.download({
        url: objectUrl,
        filename: relativeName,
        conflictAction: "uniquify",
        saveAs: false
      });

      const absolutePath = await resolveDownloadPath(downloadId);
      const filePath = absolutePath ? toClaudePath(absolutePath) : `Downloads/${relativeName}`;
      const prompt = buildClaudeCodePrompt({
        filePath,
        pageUrl: state.pageUrl,
        generalFeedback: state.generalFeedback,
        annotations: state.annotations,
        environment: state.environment,
        image: promptImage(state.imageSize)
      });
      await navigator.clipboard.writeText(prompt);

      state.setStatus(
        absolutePath
          ? {
              kind: "success",
              message:
                "Copied a Claude Code prompt with the image's path. Paste it into your session."
            }
          : {
              kind: "error",
              message:
                "Image saved to Downloads/shotback, but its full path could not be resolved. Copied a prompt with the relative path — fix it if your Claude session needs an absolute path."
            }
      );
    } catch (error) {
      state.setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Failed to copy for Claude Code"
      });
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
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
