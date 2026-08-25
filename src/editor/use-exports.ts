import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorState } from "@/editor/use-editor-state";
import { dataUrlByteLength, exportAnnotatedImage } from "@/lib/annotate";
import { applyCrop, clampCrop, type Rect } from "@/lib/crop";
import { buildBatchPrompt, buildClaudeCodePrompt, buildExternalLlmPrompt } from "@/lib/feedback";
import {
  buildLocalShareUrl,
  deleteLocalShare,
  getLocalShare,
  listLocalShares,
  saveLocalShare,
  type LocalShareMeta
} from "@/lib/localStore";
import { buildBatchSidecar, buildSidecar, type Sidecar } from "@/lib/sidecar";
import { plural } from "@/lib/utils";
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

/** The file extension for an export format - the only place that spells it out. */
function extFor(format: "png" | "jpeg"): string {
  return format === "jpeg" ? "jpg" : "png";
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
 * Write the JSON sidecar next to the PNG (same timestamp). Best effort by
 * design: the sidecar is an aid, so failing to save it costs the prompt its
 * machine-readable line and nothing else - but the two ways that can happen
 * are told apart, because "could not be saved" is a lie when the file is
 * sitting in Downloads and only its absolute path never came back.
 */
async function saveSidecar(
  state: EditorState,
  view: ExportView,
  stamp: number,
  imagePath: string
): Promise<{ saved: boolean; path: string }> {
  try {
    const sidecar = buildSidecar({
      capturedAt: state.environment?.capturedAt ?? new Date(stamp).toISOString(),
      pageUrl: state.pageUrl,
      generalFeedback: state.generalFeedback,
      annotations: view.annotations,
      image: view.image,
      imagePath,
      environment: state.environment,
      diagnostics: state.diagnostics,
      imageFormat: state.exportFormat
    });
    const blob = new Blob([JSON.stringify(sidecar, null, 2)], { type: "application/json" });
    const absolutePath = await downloadBlob(blob, `shotback/cap-${stamp}.json`);
    return { saved: true, path: absolutePath ? toClaudePath(absolutePath) : "" };
  } catch {
    return { saved: false, path: "" };
  }
}

/**
 * The pixel size of a stored share's image, read by decoding it. Shares predate
 * the crop feature and carry no size of their own, so the only honest source is
 * the image itself - and `normalizedRect` in the sidecar needs it.
 */
function decodeImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("Failed to decode the saved share image"));
    image.src = dataUrl;
  });
}

export interface EditorExports {
  download: () => Promise<void>;
  copyImage: () => Promise<void>;
  prepareExternalLlmPackage: () => Promise<void>;
  copyForClaudeCode: () => Promise<void>;
  copyBatchForClaudeCode: (ids: string[]) => Promise<void>;
  createShareUrl: () => Promise<void>;
  savedShares: LocalShareMeta[];
  refreshSavedShares: () => Promise<void>;
  removeSavedShare: (id: string) => Promise<void>;
}

/**
 * `previousShareId` is the share this editor session re-captures, carried in
 * the editor URL by `recaptureShare`. It is passthrough only: the share saved
 * here records it, and the Claude Code prompt says the capture follows one.
 */
export function useExports(state: EditorState, previousShareId?: string): EditorExports {
  const [savedShares, setSavedShares] = useState<LocalShareMeta[]>([]);

  // How many of this tab's own share writes are in flight. Chrome delivers
  // `onChanged` for a tab's own writes too, and every write here is already
  // followed by an explicit refresh - see the listener below.
  const ownWrites = useRef(0);

  const refreshSavedShares = useCallback(async (): Promise<void> => {
    try {
      setSavedShares(await listLocalShares());
    } catch {
      // Listing saved shares is best-effort; ignore transient storage errors.
    }
  }, []);

  /** Run a write that touches `share:` keys, then re-list exactly once. */
  const withOwnWrite = async (write: () => Promise<void>): Promise<void> => {
    ownWrites.current += 1;
    try {
      await write();
      await refreshSavedShares();
    } finally {
      ownWrites.current -= 1;
    }
  };

  useEffect(() => {
    void refreshSavedShares();
  }, [refreshSavedShares]);

  /**
   * Follow the store, not just this tab's own writes. Two editor tabs are the
   * normal way to build a batch (capture page A, capture page B), and a list
   * read once on mount left the first tab showing one share with no way to
   * pick up the second - the only refresh being a reload, which re-runs
   * `autocapture=1` and throws that tab's annotations away.
   *
   * Only `share:` keys matter; `prefs` writes on every dropdown change and
   * re-listing every share for that would be pure waste.
   *
   * And only *other* tabs' writes: this tab's own save/delete paths already
   * re-list when they finish, so without `ownWrites` every one of them listed
   * twice - two overlapping `listLocalShares` calls that can in principle
   * resolve out of order and leave the older answer on screen.
   */
  useEffect(() => {
    const onChanged = (changes: Record<string, unknown>, area: string): void => {
      if (area !== "local" || ownWrites.current > 0) return;
      if (!Object.keys(changes).some((key) => key.startsWith("share:"))) return;
      void refreshSavedShares();
    };

    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
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
      // A share is a link handed to someone else, and always regenerated from
      // this same PNG - it never carries the download-format pref.
      const merged = await exportAnnotatedImage(state.baseDataUrl, view.annotations, {
        generalFeedback: state.generalFeedback,
        crop: view.crop
      });
      state.setLastExportSize(dataUrlByteLength(merged));
      let localUrl = "";
      await withOwnWrite(async () => {
        const share = await saveLocalShare({
          imageDataUrl: merged,
          annotations: view.annotations,
          pageUrl: state.pageUrl,
          generalFeedback: state.generalFeedback,
          environment: state.environment,
          previousShareId
        });
        localUrl = buildLocalShareUrl(share.id);
      });
      state.setShareUrl(localUrl);
      await navigator.clipboard.writeText(localUrl);
      state.setStatus({
        kind: "success",
        message: "Local share link generated and copied to clipboard."
      });
    } catch (error) {
      state.setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Share creation failed"
      });
    } finally {
      state.setIsBusy(false);
    }
  };

  /**
   * Keep a copy of an export inside the extension itself. A Claude Code
   * handoff writes real files to Downloads and puts a prompt on the clipboard,
   * and until this existed that was the whole of the record: lose the
   * clipboard or close the tab and the tool that made the capture could not
   * show it to you, even though it lists every share with a thumbnail.
   *
   * Best effort, like the sidecar: a failure here costs the row and nothing
   * else, and the status says so rather than claiming a clean copy. The share
   * URL is deliberately not put on the clipboard - the clipboard holds the
   * prompt, and a chip labelling it "share link copied" would be a lie.
   *
   * A share is always PNG (`createShareUrl` never passes the format pref
   * either): the viewer renders it, and the batch handoff writes every share
   * out as `cap-<i>.png`, so a JPEG stored here would put JPEG bytes in a file
   * named `.png`. With the pref on PNG - the default - `exported` already is
   * one and is reused rather than rendered a second time.
   */
  const saveShareForExport = async (exported: string, view: ExportView): Promise<boolean> => {
    try {
      const imageDataUrl =
        state.exportFormat === "png"
          ? exported
          : await exportAnnotatedImage(state.baseDataUrl, view.annotations, {
              generalFeedback: state.generalFeedback,
              crop: view.crop
            });
      await withOwnWrite(() =>
        saveLocalShare({
          imageDataUrl,
          annotations: view.annotations,
          pageUrl: state.pageUrl,
          generalFeedback: state.generalFeedback,
          environment: state.environment,
          previousShareId
        }).then(() => undefined)
      );
      return true;
    } catch {
      return false;
    }
  };

  const removeSavedShare = async (id: string): Promise<void> => {
    try {
      await withOwnWrite(() => deleteLocalShare(id));
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
    // The "Local share link copied" chip describes the clipboard, and this
    // export is about to take it - so the chip goes with it.
    state.setShareUrl("");

    try {
      const view = exportView(state);
      const merged = await exportAnnotatedImage(state.baseDataUrl, view.annotations, {
        generalFeedback: state.generalFeedback,
        crop: view.crop,
        format: state.exportFormat
      });
      state.setLastExportSize(dataUrlByteLength(merged));
      const a = document.createElement("a");
      a.href = merged;
      a.download = `shotback-${Date.now()}.${extFor(state.exportFormat)}`;
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
    state.setShareUrl("");

    try {
      const view = exportView(state);
      // Always PNG, regardless of the export-format pref: browser support for
      // an "image/jpeg" ClipboardItem is inconsistent, so a JPEG copy could
      // silently fail to paste on some platforms. PNG always works.
      const merged = await exportAnnotatedImage(state.baseDataUrl, view.annotations, {
        generalFeedback: state.generalFeedback,
        crop: view.crop
      });
      state.setLastExportSize(dataUrlByteLength(merged));
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
    state.setShareUrl("");

    try {
      const view = exportView(state);
      const merged = await exportAnnotatedImage(state.baseDataUrl, view.annotations, {
        generalFeedback: state.generalFeedback,
        crop: view.crop,
        format: state.exportFormat
      });
      state.setLastExportSize(dataUrlByteLength(merged));
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
      a.download = `shotback-llm-${Date.now()}.${extFor(state.exportFormat)}`;
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
    state.setShareUrl("");

    try {
      const view = exportView(state);
      const merged = await exportAnnotatedImage(state.baseDataUrl, view.annotations, {
        generalFeedback: state.generalFeedback,
        crop: view.crop,
        format: state.exportFormat
      });
      state.setLastExportSize(dataUrlByteLength(merged));
      const stamp = Date.now();
      // The sidecar records the image as a bare filename, because both files
      // land in the same folder - so `imagePath` means "beside this JSON" in
      // the single-capture sidecar exactly as it does in the batch one.
      const imageBase = `cap-${stamp}.${extFor(state.exportFormat)}`;
      const imageName = `shotback/${imageBase}`;

      const absolutePath = await downloadBlob(await (await fetch(merged)).blob(), imageName);
      const filePath = absolutePath ? toClaudePath(absolutePath) : `Downloads/${imageName}`;
      const sidecar = await saveSidecar(state, view, stamp, imageBase);

      const prompt = buildClaudeCodePrompt({
        filePath,
        sidecarPath: sidecar.path || undefined,
        followsPrevious: Boolean(previousShareId),
        pageUrl: state.pageUrl,
        generalFeedback: state.generalFeedback,
        annotations: view.annotations,
        environment: state.environment,
        diagnostics: state.diagnostics,
        image: promptImage(view.image),
        verbosity: state.promptVerbosity
      });
      await navigator.clipboard.writeText(prompt);

      // Only now. The clipboard is what this button is *for*, and the Saved
      // Shares row is a side record - with the format pref on JPEG the save
      // re-renders the whole capture as a PNG first, which on a tall page is
      // seconds of canvas work the paste should never wait behind.
      const shared = await saveShareForExport(merged, view);

      const problems = [
        absolutePath
          ? ""
          : "the image's full path could not be resolved, so the prompt carries a relative one",
        sidecar.saved
          ? sidecar.path
            ? ""
            : "the JSON sidecar was saved but could not be linked, because its full path could not be resolved"
          : "the JSON sidecar could not be saved, so the prompt does not link one",
        shared ? "" : "the capture could not be added to Saved Shares"
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

  // Hand several saved shares to Claude Code in one go: every share's PNG into
  // one `shotback/batch-<ts>/` folder, one `batch.json` beside them holding
  // each capture's sidecar, and a prompt that leads with that JSON. The shares
  // are exported exactly as stored (their images are already annotated), so
  // nothing here re-renders or re-numbers them.
  const copyBatchForClaudeCode = async (ids: string[]): Promise<void> => {
    if (ids.length === 0) {
      state.setStatus({ kind: "error", message: "Select at least one saved share first." });
      return;
    }

    state.setIsBusy(true);
    state.setStatus(null);
    state.setShareUrl("");

    const folder = `shotback/batch-${Date.now()}`;
    try {
      const captures: Sidecar[] = [];
      const entries: Array<{ pageUrl: string; imagePath: string; annotationCount: number }> = [];

      // Sequential on purpose: the first share that cannot be written aborts
      // the batch, rather than leaving a prompt that points at missing files.
      for (const [index, id] of ids.entries()) {
        const share = await getLocalShare(id);
        if (!share) throw new Error(`Saved share ${index + 1} is no longer stored`);

        const imageName = `cap-${index}.png`;
        const blob = await (await fetch(share.imageDataUrl)).blob();
        const absolutePath = await downloadBlob(blob, `${folder}/${imageName}`);
        if (!absolutePath) {
          throw new Error(`Capture ${index + 1} could not be written to Downloads`);
        }

        const capture = buildSidecar({
          capturedAt: share.environment?.capturedAt ?? share.createdAt,
          pageUrl: share.pageUrl,
          generalFeedback: share.generalFeedback,
          annotations: share.annotations,
          image: await decodeImageSize(share.imageDataUrl),
          // Relative to the batch folder, so the folder stays portable.
          imagePath: imageName,
          environment: share.environment,
          imageFormat: "png"
        });
        captures.push(capture);
        entries.push({
          pageUrl: share.pageUrl,
          imagePath: toClaudePath(absolutePath),
          annotationCount: capture.annotations.length
        });
      }

      const batch = buildBatchSidecar(captures);
      const batchBlob = new Blob([JSON.stringify(batch, null, 2)], { type: "application/json" });
      const batchPath = await downloadBlob(batchBlob, `${folder}/batch.json`);
      if (!batchPath) throw new Error("The batch JSON could not be written to Downloads");

      await navigator.clipboard.writeText(buildBatchPrompt(entries, toClaudePath(batchPath)));
      state.setStatus({
        kind: "success",
        message: `Copied a Claude Code prompt for ${plural(
          entries.length,
          "saved capture"
        )} in ${folder}. Paste it into your session.`
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Batch export failed";
      state.setStatus({
        kind: "error",
        message: `${reason}. No prompt was copied; any files already written to Downloads/${folder} can be deleted.`
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
    copyBatchForClaudeCode,
    createShareUrl,
    savedShares,
    refreshSavedShares,
    removeSavedShare
  };
}
