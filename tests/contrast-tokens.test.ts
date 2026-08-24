import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// WCAG AA text contrast for `--muted-foreground` against every background it
// is actually painted on, read straight out of globals.css so the test fails
// the moment a token drifts back under 4.5:1 - no separate copy of the values
// to fall out of sync with the source.

const CSS_PATH = fileURLToPath(new URL("../src/styles/globals.css", import.meta.url));

interface Hsl {
  h: number;
  s: number;
  l: number;
}

/** Pull one `--token: H S% L%` declaration out of a CSS block's raw text. */
function readToken(block: string, name: string): Hsl {
  const match = block.match(new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`));
  if (!match) throw new Error(`--${name} not found`);
  return { h: Number(match[1]), s: Number(match[2]), l: Number(match[3]) };
}

/** The light `:root {}` block and the `.dark {}` block - not the duplicate
 * `@media (prefers-color-scheme: dark)` block, which the file's own comment
 * (and `tests/theme-tokens.test.ts`) says is kept in sync with `.dark` by hand. */
function extractBlock(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`${selector} block not found`);
  const end = css.indexOf("\n}", start);
  return css.slice(start, end);
}

function hslToRgb({ h, s, l }: Hsl): [number, number, number] {
  const sf = s / 100;
  const lf = l / 100;
  const k = (n: number): number => (n + h / 30) % 12;
  const a = sf * Math.min(lf, 1 - lf);
  const f = (n: number): number => lf - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

function srgbToLinear(c: number): number {
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two HSL tokens, 1:1 (no contrast) to 21:1. */
function contrast(a: Hsl, b: Hsl): number {
  const la = relativeLuminance(hslToRgb(a));
  const lb = relativeLuminance(hslToRgb(b));
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

const AA_TEXT = 4.5;

describe("muted-foreground contrast (AA, 4.5:1)", () => {
  const css = readFileSync(CSS_PATH, "utf8");
  const light = extractBlock(css, ":root");
  const dark = extractBlock(css, ".dark");

  it.each(["muted", "background", "card"])("clears AA against light --%s", (name) => {
    const fg = readToken(light, "muted-foreground");
    const bg = readToken(light, name);
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(["muted", "background", "card"])("clears AA against dark --%s", (name) => {
    const fg = readToken(dark, "muted-foreground");
    const bg = readToken(dark, name);
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});
