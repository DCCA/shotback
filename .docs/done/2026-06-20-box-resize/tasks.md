# Tasks: Box Resize After Creation

## 1. Interaction and Rendering
- [x] 1.1 Add resize helper module for box handles, crossing normalization, and constraints
- [x] 1.2 Add editor resize state and pointer lifecycle wiring
- [x] 1.3 Render resize handles for selected boxes in move mode
- [x] 1.4 Keep existing box move behavior when dragging body area

## 2. Validation
- [x] 2.1 Add unit tests for crossing and clamp behavior
- [x] 2.2 Run `npm run test`
- [x] 2.3 Run `npm run build`

## 3. Manual Verification
- [ ] 3.1 Verify box create -> resize from corners/edges -> move
- [ ] 3.2 Verify crossing past opposite edges remains smooth
- [ ] 3.3 Verify export/share still include resized annotations correctly
