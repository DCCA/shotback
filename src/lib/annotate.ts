import type { Annotation } from "@/types/annotation";

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string
): void {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = 10;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

function drawCommentLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string
): void {
  const label = text.trim();
  if (!label) return;

  ctx.font = "14px sans-serif";
  const paddingX = 8;
  const paddingY = 6;
  const textWidth = ctx.measureText(label).width;
  const boxWidth = textWidth + paddingX * 2;
  const boxHeight = 24;

  const boxX = Math.max(0, x);
  const boxY = Math.max(0, y - boxHeight);

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

  ctx.fillStyle = color;
  ctx.fillText(label, boxX + paddingX, boxY + paddingY + 10);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = words[0];

  for (let i = 1; i < words.length; i += 1) {
    const next = `${current} ${words[i]}`;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
    } else {
      lines.push(current);
      current = words[i];
    }
  }

  lines.push(current);
  return lines;
}

export async function exportAnnotatedImage(
  baseDataUrl: string,
  annotations: Annotation[],
  options?: { generalFeedback?: string }
): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Failed to load base image"));
    i.src = baseDataUrl;
  });

  const generalFeedback = options?.generalFeedback?.trim() ?? "";
  const hasGeneralFeedback = generalFeedback.length > 0;

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to create canvas context");

  let footerHeight = 0;
  let feedbackLines: string[] = [];
  if (hasGeneralFeedback) {
    const maxTextWidth = Math.max(200, img.width - 40);
    ctx.font = "15px sans-serif";
    feedbackLines = wrapText(ctx, generalFeedback, maxTextWidth);
    const titleHeight = 24;
    const lineHeight = 22;
    const padding = 14;
    footerHeight = titleHeight + feedbackLines.length * lineHeight + padding * 2;
    canvas.height = img.height + footerHeight;
  }

  ctx.drawImage(img, 0, 0);

  for (const a of annotations) {
    ctx.strokeStyle = a.color;
    ctx.fillStyle = a.color;
    ctx.lineWidth = 3;

    if (a.tool === "box") {
      ctx.strokeRect(a.x, a.y, a.width, a.height);
      if (a.comment) {
        drawCommentLabel(ctx, a.comment, a.x, a.y, a.color);
      }
      continue;
    }

    if (a.tool === "arrow") {
      ctx.beginPath();
      ctx.moveTo(a.x1, a.y1);
      ctx.lineTo(a.x2, a.y2);
      ctx.stroke();
      drawArrowHead(ctx, a.x1, a.y1, a.x2, a.y2, a.color);
      if (a.comment) {
        drawCommentLabel(ctx, a.comment, Math.min(a.x1, a.x2), Math.min(a.y1, a.y2), a.color);
      }
      continue;
    }

    ctx.font = "16px sans-serif";
    ctx.fillText(a.text, a.x, a.y);
  }

  if (hasGeneralFeedback) {
    const top = img.height;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, top, canvas.width, footerHeight);
    ctx.strokeStyle = "#d1d5db";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, top);
    ctx.lineTo(canvas.width, top);
    ctx.stroke();

    const left = 16;
    let y = top + 28;
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 15px sans-serif";
    ctx.fillText("General Feedback", left, y);
    y += 24;

    ctx.font = "15px sans-serif";
    ctx.fillStyle = "#1f2937";
    for (const line of feedbackLines) {
      ctx.fillText(line, left, y);
      y += 22;
    }
  }

  return canvas.toDataURL("image/png");
}
