import type { CaptureEnvironment } from "@/lib/capture";
import { describeGeometry, numberAnnotations } from "@/lib/numbering";
import type { Annotation } from "@/types/annotation";

/** Short, human-readable summary of a single annotation for timeline rows. */
export function annotationSummary(annotation: Annotation): string {
  if (annotation.tool === "text") return annotation.text;
  return annotation.comment?.trim() || "(no comment)";
}

/**
 * The note an annotation contributes to the prompt list and to the exported
 * legend, placeholders included. Both call this so their wording cannot drift.
 */
export function noteText(annotation: Annotation): string {
  if (annotation.tool === "text") return annotation.text.trim() || "(empty)";
  return annotation.comment?.trim() || "(no comment)";
}

/**
 * Numbered, tool-tagged list of area comments shared by the prompt builders.
 * The numbers come from `numberAnnotations`, so they match the pins drawn on
 * the image and the numbers shown in the comment timeline. When an image size
 * is given, each line also carries the annotation's geometry (px and % of
 * page) so an agent can locate it without opening the picture.
 */
function formatAreaComments(
  annotations: Annotation[],
  image?: { width: number; height: number }
): string {
  const comments = numberAnnotations(annotations)
    .map(({ n, annotation }) => {
      const line = `${n}. [${annotation.tool}] ${noteText(annotation)}`;
      return image ? `${line} - ${describeGeometry(annotation, image)}` : line;
    })
    .join("\n");

  return comments || "(none)";
}

/**
 * The captured tab's context, as prompt lines. Empty when no environment was
 * captured (a share restored from before this existed), so those prompts keep
 * exactly the shape they had.
 */
function environmentLines(environment?: CaptureEnvironment): string[] {
  if (!environment) return [];

  return [
    "",
    "Environment:",
    `- Page title: ${environment.pageTitle.trim() || "(untitled)"}`,
    `- Viewport: ${environment.viewport.width}x${environment.viewport.height} @${environment.devicePixelRatio}x`,
    `- Color scheme: ${environment.colorScheme}`,
    `- Scroller: ${environment.scroller}`,
    `- User agent: ${environment.userAgent}`,
    `- Captured at: ${environment.capturedAt}`,
    ""
  ];
}

/**
 * Build the structured prompt handed to an external/cloud LLM alongside the
 * downloaded annotated image. Kept pure so it can be unit tested.
 */
export function buildExternalLlmPrompt(params: {
  pageUrl: string;
  generalFeedback: string;
  annotations: Annotation[];
  environment?: CaptureEnvironment;
  image?: { width: number; height: number };
}): string {
  return [
    "Please review this screenshot and provide feedback.",
    "",
    `Page URL: ${params.pageUrl || "(unknown)"}`,
    ...environmentLines(params.environment),
    `General feedback context: ${params.generalFeedback.trim() || "(none)"}`,
    "",
    "Area comments:",
    formatAreaComments(params.annotations, params.image)
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
  environment?: CaptureEnvironment;
  image?: { width: number; height: number };
}): string {
  return [
    `Review this screenshot: ${params.filePath}`,
    "",
    `Page URL: ${params.pageUrl || "(unknown)"}`,
    ...environmentLines(params.environment),
    `General feedback context: ${params.generalFeedback.trim() || "(none)"}`,
    "",
    "Area comments:",
    formatAreaComments(params.annotations, params.image)
  ].join("\n");
}
