# Spec: Local Share Storage Hardening

### Requirement: Split Share Storage
The system SHALL store local share metadata in `chrome.storage.local` and image payloads in IndexedDB as blobs.

#### Scenario: Save a new share
- GIVEN a captured and annotated screenshot
- WHEN the user generates a local share
- THEN metadata is persisted in `chrome.storage.local`
- AND the image payload is persisted in IndexedDB
- AND the metadata contains a reference key to the blob payload

### Requirement: Share Retrieval
The system SHALL load metadata and payload together when opening a viewer URL.

#### Scenario: Open existing share
- GIVEN a valid share ID
- WHEN the viewer loads the share
- THEN metadata is loaded from `chrome.storage.local`
- AND the image blob is loaded from IndexedDB
- AND the viewer renders the annotated image and metadata values

### Requirement: Legacy Share Compatibility
The system MUST support shares saved before this change that contain `imageDataUrl` in `chrome.storage.local`.

#### Scenario: Open legacy share
- GIVEN a share record with embedded `imageDataUrl`
- WHEN the viewer loads the share
- THEN the viewer successfully renders the image
- AND the system migrates the image payload to IndexedDB
- AND subsequent reads use blob-backed storage

### Requirement: Retention Policy
The system SHALL automatically prune stored shares based on count and age limits.

#### Scenario: Count limit exceeded
- GIVEN existing shares at or above the configured max count
- WHEN a new share is saved
- THEN the oldest shares are deleted until count is within limit
- AND associated IndexedDB blobs are also deleted

#### Scenario: Age limit exceeded
- GIVEN shares older than configured max age
- WHEN pruning runs
- THEN expired shares are removed
- AND associated IndexedDB blobs are also removed

### Requirement: Failure Safety
The system MUST avoid dangling metadata or dangling payload blobs when save operations partially fail.

#### Scenario: Blob write fails
- GIVEN a failure while writing image payload to IndexedDB
- WHEN save is attempted
- THEN metadata is not committed as a successful share
- AND a clear error is returned to the caller

#### Scenario: Metadata write fails after blob write
- GIVEN payload write succeeds but metadata write fails
- WHEN save is attempted
- THEN the newly written payload blob is deleted best-effort
- AND a clear error is returned to the caller

### Requirement: Test Coverage
The system SHOULD include automated tests for storage split behavior, retention pruning, and legacy migration.

#### Scenario: Storage module validation
- GIVEN the storage module test suite
- WHEN tests run
- THEN save, load, delete, prune, and legacy migration paths are covered
