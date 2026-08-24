import { numberAnnotations } from "@/lib/numbering";
import type { Annotation } from "@/types/annotation";

/** Short, human-readable summary of a single annotation for timeline rows. */
export function annotationSummary(annotation: Annotation): string {
  if (annotation.tool === "text") return annotation.text;
  return annotation.comment?.trim() || "(no comment)";
}

/**
 * Numbered, tool-tagged list of area comments shared by the prompt builders.
 * The numbers come from `numberAnnotations`, so they match the pins drawn on
 * the image and the numbers shown in the comment timeline.
 */
function formatAreaComments(annotations: Annotation[]): string {
  const comments = numberAnnotations(annotations)
    .map(({ n, annotation }) => {
      if (annotation.tool === "text") {
        return `${n}. [text] ${annotation.text || "(empty)"}`;
      }

      return `${n}. [${annotation.tool}] ${annotation.comment?.trim() || "(no comment)"}`;
    })
    .join("\n");

  return comments || "(none)";
}

/**
 * Build the structured prompt handed to an external/cloud LLM alongside the
 * downloaded annotated image. Kept pure so it can be unit tested.
 */
export function buildExternalLlmPrompt(params: {
  pageUrl: string;
  generalFeedback: string;
  annotations: Annotation[];
}): string {
  return [
    "Please review this screenshot and provide feedback.",
    "",
    `Page URL: ${params.pageUrl || "(unknown)"}`,
    `General feedback context: ${params.generalFeedback.trim() || "(none)"}`,
    "",
    "Area comments:",
    formatAreaComments(params.annotations)
  ].join("\n");
}

/**
 * Build the prompt copied to the clipboard for a Claude Code session. Leads with
 * the saved file's path so Claude can read the image directly from disk (e.g. a
 * Windows Downloads path translated to its WSL `/mnt/...` equivalent).
 */
export function buildClaudeCodePrompt(params: {
  filePath: string;
  pageUrl: string;
  generalFeedback: string;
  annotations: Annotation[];
}): string {
  return [
    `Review this screenshot: ${params.filePath}`,
    "",
    `Page URL: ${params.pageUrl || "(unknown)"}`,
    `General feedback context: ${params.generalFeedback.trim() || "(none)"}`,
    "",
    "Area comments:",
    formatAreaComments(params.annotations)
  ].join("\n");
}
