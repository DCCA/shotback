# Design: Box Resize After Creation

## Approach
1. Add a pure resize helper in `src/lib/boxResize.ts` that:
   - applies pointer deltas to the active box edge/corner
   - normalizes sides when crossing occurs
   - flips active handle orientation when crossing occurs
   - enforces minimum size and image bounds
2. Extend editor interaction state with `ResizeState` for active handle drags.
3. Render eight resize handles for selected box annotations in move mode.
4. Wire pointer handlers:
   - handle pointer down starts resize
   - canvas pointer move applies resize helper output
   - pointer up/leave finalizes resize
5. Keep move behavior unchanged for box-body drags and preserve inline comment anchoring.
6. Add focused unit tests for resize math and crossing behavior.

## Rationale
- A pure helper isolates complex crossing/clamp logic and is easy to test.
- Handle-based resize keeps interaction explicit and avoids accidental transforms.
- Incremental pointer deltas keep resizing smooth while allowing handle flips.

## Risks
- Pointer interaction conflicts between move and resize if event propagation is not handled correctly.
- Bound/min constraints can create edge-case jumps if normalization order is wrong.

## Mitigations
- Stop propagation on handle pointer-down targets.
- Test both single-axis and dual-axis crossings plus min/bounds clamps.
