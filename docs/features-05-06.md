# Multiple rooms and house assembly

The existing project model already stored a room collection, and the editor already selected rooms by ID. This implementation extends those paths rather than introducing a second store. All edits use project history, existing browser/account saving, and existing room inspectors.

## Data and implementation

Room now has optional `placement: { x, z, rotation }` (metres and degrees) and `visible`. Missing visibility means visible. On loading legacy projects, missing placements are assigned without changing dimensions, finishes, or contents. No database migration is needed because rooms are stored as JSON. API DTOs validate and preserve these fields. API project validation rejects overlapping explicitly positioned rooms and already rejects duplicate room IDs.

- `packages/studio/house.ts`: world transforms, polygon collision checks, legacy arrangement, wall snapping, split/deduplicated physical walls, paired doors, and polygon floor area.
- `apps/web/src/editor/room-explorer.tsx`: selection, properties, rename, deep copy, confirmed delete, visibility.
- `apps/web/src/editor/house-editor.tsx`: global floor plan, pointer dragging, position and rotation inputs, corridor creation, adjacent-room connection, dimensions and area.
- `apps/web/src/editor/house-preview.tsx`: orbitable house preview with one physical mesh per wall segment, separate facing paints, opening cutouts, floors and furniture.
- Editor, room factory, styles, model and API validation were extended to integrate these components. `tests/house.test.cjs` covers geometry and DTO persistence.

## Acceptance

Implemented: room creation, naming, selection, independent dimensions and materials, deep duplication, confirmed deletion, visibility, project explorer, room previews, project preview and legacy loading. At least one room is retained, matching existing editor assumptions.

Implemented: global dragging, rotation, wall snapping, partial shared wall detection, shared geometry deduplication, separate facing paint data, paired adjacent door creation, corridors as editable rooms, existing door/window positioning, collision rejection, house rendering, individual editing, polygon-based area and global bounding dimensions. Hidden rooms remain included in area and collision validation.

## Limits

House preview is a cutaway architectural overview: detailed wall decorations, lights, ceiling treatments and window/door models use the existing individual-room renderer. Shared boundaries use a fixed 0.12 m visual thickness in this overview. Individual room wall thicknesses remain preserved. Connections create paired room-local doors atomically and reject conflicts with existing openings/designs; subsequent individual door edits and room moves do not keep paired doors linked. Snapping aligns parallel walls; it does not automatically rotate rooms. Rename and delete use browser-native prompt/confirmation dialogs.

## Verification

`npm test` passes all five test files, including six new house tests. `npm run typecheck` passes both workspaces. Production API/web build passes. No lint script is configured. Browser interaction was not independently automated for these additions.
