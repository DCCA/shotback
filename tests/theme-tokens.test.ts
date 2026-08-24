import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The dark tokens are written twice on purpose (see the long comment in
 * globals.css: `light-dark()` breaks the alpha modifiers and MV3 forbids the
 * inline pre-render script). Hand-kept duplication needs a guard, so this
 * parses both blocks out of the stylesheet and compares them property by
 * property - one drifted value fails here instead of in someone's dark theme.
 */
const css = readFileSync(
  fileURLToPath(new URL("../src/styles/globals.css", import.meta.url)),
  "utf8"
);

/** The declarations of the first block opened by `header`, as a property map. */
function blockDeclarations(header: string): Record<string, string> {
  const start = css.indexOf(header);
  expect(start, `block not found: ${header}`).toBeGreaterThan(-1);

  let depth = 0;
  let end = start;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}") depth--;
    if (depth === 0) {
      end = i;
      break;
    }
  }

  const body = css.slice(css.indexOf("{", start) + 1, end).replace(/\/\*[\s\S]*?\*\//g, "");
  const declarations: Record<string, string> = {};
  for (const line of body.split(";")) {
    const [property, ...rest] = line.split(":");
    if (rest.length === 0) continue;
    const name = property.trim();
    if (name) declarations[name] = rest.join(":").trim();
  }
  return declarations;
}

describe("dark theme tokens", () => {
  const explicit = blockDeclarations(".dark {");
  const media = blockDeclarations(":root:not(.light) {");

  it("declares the same values in the class block and the media block", () => {
    expect(explicit).toEqual(media);
  });

  it("actually parsed the tokens", () => {
    expect(Object.keys(explicit).length).toBeGreaterThan(20);
    expect(explicit["color-scheme"]).toBe("dark");
  });
});
