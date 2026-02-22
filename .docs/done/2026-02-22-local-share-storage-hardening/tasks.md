# Tasks: Local Share Storage Hardening

## 1. Storage Model and Types
- [x] 1.1 Add v2 metadata type definitions in `src/lib/localStore.ts`.
- [x] 1.2 Add blob store helper module `src/lib/shareDb.ts`.
- [x] 1.3 Add schema version marker and blob key generation strategy.

## 2. Save/Read/Delete Flows
- [x] 2.1 Update save flow to write blob payload + metadata reference.
- [x] 2.2 Update read flow to resolve metadata + blob into viewer-compatible image data.
- [x] 2.3 Add delete flow that removes both metadata and blob.
- [x] 2.4 Add rollback logic for partial save failures.

## 3. Legacy Migration
- [x] 3.1 Detect legacy records containing inline `imageDataUrl`.
- [x] 3.2 Implement lazy migration to v2 blob-backed records on first read.
- [x] 3.3 Remove legacy inline payload after successful migration.

## 4. Retention and Pruning
- [x] 4.1 Add `pruneLocalShares` with default policy (`50` shares, `30` days).
- [x] 4.2 Trigger prune during save flow.
- [x] 4.3 Ensure prune deletes matching blob records.

## 5. Tests
- [x] 5.1 Add unit tests for v2 save/get/delete.
- [x] 5.2 Add unit tests for prune by count and age.
- [x] 5.3 Add unit tests for legacy migration.
- [x] 5.4 Add unit tests for rollback behavior on metadata write failure.

## 6. Validation
- [x] 6.1 Run `npm run test`.
- [x] 6.2 Run `npm run build`.
- [x] 6.3 Manually verify editor share creation and viewer link behavior with new storage.
