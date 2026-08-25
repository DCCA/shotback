#!/usr/bin/env node
/**
 * Fail the build if `dist/content.js` is not a classic script.
 *
 * The manifest declares exactly one `"type": "module"` entry - the service
 * worker. The content script is a *classic* script, so a top-level `import`
 * or `export` in it is not a slow path or a warning: Chrome refuses to
 * execute the file at all. The script then silently never loads on any page
 * and every capture fails with "Receiving end does not exist", nowhere near
 * the change that caused it.
 *
 * Vite produces exactly that the moment a module `src/content.ts` imports is
 * also imported by the editor: the shared module becomes its own chunk and
 * `content.js` is emitted with an import of it. Nothing else in the gate can
 * see it - typecheck, lint, unit tests and the build itself are all green -
 * which is why this runs right after `vite build`, inside `npm run check`.
 *
 * See the `src/lib/dom-context.ts` note: that module must stay the content
 * script's only non-type import.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

/**
 * True when `source` carries a top-level ES module statement. Covers every
 * form a bundler emits: named (`import{a}from"x"`), side-effect
 * (`import"x"`), default (`import a from"x"`), namespace (`import*as a`),
 * dynamic (`import("x")`, which MV3's CSP blocks in a content script anyway)
 * and any `export`. Deliberately a lexical check rather than a parse: it runs
 * on minified output where a parser would be the heavier dependency, and a
 * false positive here is a comment away from being fixed while a false
 * negative ships a dead extension.
 */
export function hasModuleSyntax(source) {
  return /(^|[;}\s])(import\s*[{*"'`(]|import\s+[A-Za-z_$]|export[\s{*])/.test(source);
}

// Deliberately not an argv parameter: it has one job on one known path, and
// npm forwards stray args into nested `npm run` calls (which made
// `npm run test:e2e` hand this script the word "test" as a filename).
const file = path.join("dist", "content.js");

try {
  const source = await readFile(file, "utf8");
  if (hasModuleSyntax(source)) {
    const line = source.split("\n").find((text) => hasModuleSyntax(text)) ?? "";
    console.error(
      `\n${file} is an ES module, but the manifest loads it as a classic content script.\n` +
        `Chrome will refuse to run it, so the content script never loads and every capture\n` +
        `fails with "Receiving end does not exist".\n\n` +
        `  ${line.slice(0, 160)}\n\n` +
        `Cause: a module src/content.ts imports is now imported by the editor too, so Vite\n` +
        `emitted it as a shared chunk. Move the shared helper out of the content script's\n` +
        `import graph (see the note in src/lib/dom-context.ts).\n`
    );
    process.exit(1);
  }
} catch (error) {
  console.error(`Could not read ${file}: ${error.message}`);
  process.exit(1);
}
