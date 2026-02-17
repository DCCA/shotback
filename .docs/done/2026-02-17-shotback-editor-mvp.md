# Done: Shotback Editor MVP (2026-02-17)

## Summary
Implemented local-first Chrome extension workflow from capture through annotated sharing.

## Implemented
- Full-page capture and stitch flow
- Annotation drawing and moving
- Linked comments for selected areas
- Timeline view with per-item delete
- Local share URL generation and viewer page
- General feedback persisted and rendered in shared view

## Validation
- `npm run test` passed
- `npm run build` passed

## Notes
- Local share URLs require this extension and local storage data in the same browser profile.
