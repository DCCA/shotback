# Design: World-Class Hardening Sweep

## Toolchain versions
Chosen for mutual compatibility and stability over bleeding edge:

- Vite `^8`, Vitest `^4`, `@vitejs/plugin-react` `^6` (clears rollup/esbuild/
  postcss/yaml advisories).
- TypeScript `5.9.x` (not 6.0: keeps `typescript-eslint` 8 in its supported
  range `>=4.8.4 <6.1.0` with margin).
- ESLint `9` flat config + `typescript-eslint` `8` + `eslint-plugin-react-hooks`
  `6` + `eslint-config-prettier` to defer formatting to Prettier.
- `@types/node` `^22` to match the Node 22 dev / Node 20 CI runtime.

## Type-checking
`tsc --noEmit` failed because:
- node-context files (`vite.config.ts`, `tests/localStore.test.ts`) used
  `node:*` modules, `__dirname`, and the `NodeJS` namespace without node types;
- tests used the ambient `chrome` namespace as a *type* (`as unknown as chrome`)
  which is illegal — `chrome` is a value namespace.

Fix: add `node` to `compilerOptions.types`, add `@types/node`, and change the
test casts to `typeof chrome`. A single root `tsconfig.json` keeps the setup
simple (the project is small); `skipLibCheck` is enabled to avoid third-party
`.d.ts` noise.

## Arrow-head color bug
The SVG `<marker>` polygon uses `fill="currentColor"`, but the referencing
`<line>` never sets `color`, so heads inherit the page's default text color
instead of the annotation color. Fix: set `color` on the line via inline style
so `currentColor` resolves per annotation. The exported (canvas) path already
draws heads correctly and is unchanged.

## Permissions
Capture relies on `activeTab` + `scripting` + `tabs` + `captureVisibleTab`, plus
a static content script. Reducing `host_permissions`/`content_scripts` from
`<all_urls>` risks breaking capture and cannot be verified from CI, so those are
left intact and documented. `web_accessible_resources` is **removed entirely**:
`editor.html`/`viewer.html` open as top-level `chrome-extension://` pages, so
their `assets/*` chunks load as same-origin extension resources and never need to
be web-accessible; the content script injects no extension resources into pages.
The block was therefore dead config whose only effect was exposing `assets/*` to
every origin (an extension-fingerprinting vector). See `SECURITY.md` for the
shipped rationale.

## Local-share management
`listLocalShares()` / `deleteLocalShare()` already exist but have no UI. Add a
collapsible "Saved shares" panel to the editor that lists recent shares (page,
timestamp, size), opens the viewer, and deletes entries. Pure read/delete over
existing storage APIs — no schema change.
