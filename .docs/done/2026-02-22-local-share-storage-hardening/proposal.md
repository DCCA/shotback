# Proposal: Local Share Storage Hardening

## Why
Shotback currently stores full annotated PNG data URLs directly in `chrome.storage.local` for each share. This inflates storage usage quickly and has no retention policy, which can degrade reliability for repeated use.

## Goal
Make local share storage durable by separating metadata from image payloads and adding automatic retention cleanup.

## Scope
- Move share image payload storage from `chrome.storage.local` data URLs to IndexedDB blobs.
- Keep share metadata in `chrome.storage.local`.
- Add retention policy and pruning behavior.
- Preserve compatibility with legacy shares already saved as data URLs.
- Add tests for new storage behaviors.

## Out of Scope
- Cloud hosting or external share URLs.
- Account/auth features.
- UI redesign outside required status messaging for storage errors.
