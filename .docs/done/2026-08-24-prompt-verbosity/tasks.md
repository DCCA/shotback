# Tasks: Prompt verbosity levels

- [x] **1. `src/lib/prefs.ts` RED -> GREEN**
  - [x] 1.1 `tests/prefs.test.ts` against a recording `chrome.storage.local`
        get/set stub: empty default, stored round trip, corrupt/null stored
        value tolerated, merge-on-write.
  - [x] 1.2 RED: module did not exist - `Cannot find module '../src/lib/prefs'`.
  - [x] 1.3 `getPrefs()`/`setPrefs(partial)`; GREEN: `7 passed (7)`.
- [x] **2. `src/lib/feedback.ts` verbosity levels RED -> GREEN**
  - [x] 2.1 `tests/feedback.test.ts`: three full-string snapshots per builder
        (compact/standard/detailed) over one fixed input covering environment,
        geometry, context (including a component chain) and diagnostics;
        updated the three existing Diagnostics-block tests to pass
        `verbosity: "detailed"` (the level it moved into) and added two
        "omits Diagnostics at standard" guards.
  - [x] 2.2 RED: `8 failed | 29 passed (37)`.
  - [x] 2.3 `Verbosity` type, `formatAreaComments`/`contextLines` gated by it;
        both builders take an optional `verbosity` (default `"standard"`).
        GREEN: `37 passed (37)`.
- [x] **3. Editor wiring**
  - [x] 3.1 `use-editor-state.ts` - `promptVerbosity` state, loaded from
        `getPrefs()` on mount, `setPromptVerbosity` persists via `setPrefs`.
  - [x] 3.2 `sidebar.tsx` - "Prompt detail" `Select` (Compact/Standard/
        Detailed), same `id`/`aria-labelledby` pattern as the other selects.
  - [x] 3.3 `use-exports.ts` - `verbosity: state.promptVerbosity` on both
        builder calls.
- [x] **4. e2e RED -> GREEN**
  - [x] 4.1 Extended the `smooth` capture test: default (standard) copy no
        longer expects `Diagnostics:`; switch to Compact, copy, assert the
        prompt lacks `Environment:`; switch to Detailed, copy, assert it
        contains `Diagnostics:` (reusing the existing failing-request
        fixture); reset to Standard.
  - [x] 4.2 RED (implementation stashed): `not.toContain("Diagnostics:")`
        failed - the pre-change code still puts Diagnostics in the default
        prompt.
  - [x] 4.3 Found and fixed a real race while getting the Compact assertion
        green: `prepareExternalLlmPackage` never reset `status` to `null`, so
        two `copyCloudPrompt()` calls in a row could pass the "Prompt copied"
        wait on stale text from the *first* copy and read the clipboard before
        the second `writeText` landed. Fixed by clearing status up front, like
        `createShareUrl`/`copyForClaudeCode` already do.
  - [x] 4.4 GREEN: `6 passed (6)`.
- [x] **5. Gate**
  - [x] 5.1 `npm run check` green (typecheck, lint, 152 unit tests, build).
  - [x] 5.2 `npm run format:check` green.
  - [x] 5.3 `npm run test:e2e` green, `6 passed (6)`.
  - [x] 5.4 Colour-literal grep: zero hits. No em dashes on any added line.
- [x] **6. Docs**
  - [x] 6.1 `CLAUDE.md` - outputs paragraph + `src/lib/feedback.ts`/new
        `src/lib/prefs.ts` entries in the pure-helpers list.
  - [x] 6.2 `README.md` - a sentence on the three levels.
  - [x] 6.3 This change folder, filed straight to `done/`.
