import type { Annotation } from "@/types/annotation";

/** Short, human-readable summary of a single annotation for timeline rows. */
export function annotationSummary(annotation: Annotation): string {
  if (annotation.tool === "text") return annotation.text;
  return annotation.comment?.trim() || "(no comment)";
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
