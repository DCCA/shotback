# Design: Local Share Storage Hardening

## Summary
Introduce a dual-store approach:
- `chrome.storage.local` for share metadata records.
- IndexedDB for image blobs.

This keeps local-first behavior while reducing storage pressure from base64 payloads.

## Data Model

### Metadata (`chrome.storage.local`)
- Key: `share:<id>`
- Value:
  - `id: string`
  - `pageUrl: string`
  - `annotations: Annotation[]`
  - `generalFeedback: string`
  - `createdAt: string` (ISO timestamp)
  - `imageBlobKey: string`
  - `imageByteSize: number`
  - `schemaVersion: 2`

### Payloads (IndexedDB)
- Database: `shotback`
- Object store: `shareImages`
- Record:
  - key: `imageBlobKey` (same as metadata field)
  - value: `Blob` (PNG)

## Public Interface Changes

Update `src/lib/localStore.ts`:
- `saveLocalShare(input): Promise<LocalShareMeta>`
- `getLocalShare(id): Promise<ResolvedLocalShare | null>`
- `deleteLocalShare(id): Promise<void>`
- `listLocalShares(): Promise<LocalShareMeta[]>`
- `pruneLocalShares(policy?): Promise<{ deletedCount: number }>`

Add helper module `src/lib/shareDb.ts`:
- `putImageBlob(key: string, blob: Blob): Promise<void>`
- `getImageBlob(key: string): Promise<Blob | null>`
- `deleteImageBlob(key: string): Promise<void>`

## Retention Defaults
- `MAX_SHARE_COUNT = 50`
- `MAX_SHARE_AGE_DAYS = 30`
- Pruning order:
  1. Remove shares older than `MAX_SHARE_AGE_DAYS`.
  2. If count still exceeds limit, remove oldest by `createdAt`.

## Core Flows

### Save Flow
1. Export annotated image data URL.
2. Convert data URL to blob.
3. Generate `imageBlobKey`.
4. Write blob to IndexedDB.
5. Write metadata to `chrome.storage.local`.
6. Run prune routine.
7. Return metadata.

Rollback behavior:
- If blob write fails: abort and return error.
- If metadata write fails after blob write: delete blob best-effort, then return error.

### Read Flow
1. Read metadata from `chrome.storage.local`.
2. If `schemaVersion: 2`, read blob via `imageBlobKey`.
3. Convert blob to data URL for existing viewer rendering path.
4. Return combined `ResolvedLocalShare`.

### Legacy Migration Flow (`schemaVersion` absent or `1`)
1. Detect legacy record with `imageDataUrl`.
2. Convert `imageDataUrl` to blob.
3. Write blob to IndexedDB and write v2 metadata.
4. Remove inline `imageDataUrl` from metadata record.
5. Continue returning resolved share.

Migration should be lazy and performed on read to minimize one-time risk.

## Error Handling
- Preserve existing user-facing behavior in editor/viewer.
- Return explicit errors from storage layer for:
  - missing blob for existing metadata
  - write failures
  - migration failures

## Testing Strategy
- Extend storage tests in `tests/`:
  - save and retrieve v2 record
  - delete removes metadata and blob
  - prune by age
  - prune by count
  - legacy migration from inline data URL
  - rollback path when metadata write fails

Use deterministic timestamps in tests to validate sort/prune order.

## Risks and Mitigations
- Risk: IndexedDB access failures in extension pages.
  - Mitigation: explicit errors and fallback message path.
- Risk: orphaned blobs from unexpected runtime interruption.
  - Mitigation: periodic prune scans metadata and deletes unreferenced blobs when feasible.
