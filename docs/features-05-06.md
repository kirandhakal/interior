# Multiple rooms and house assembly

The existing project model already stored a room collection, and the editor already selected rooms by ID. This implementation extends those paths rather than introducing a second store. All edits use project history, existing browser/account saving, and existing room inspectors.

## Data and implementation

Room now has optional `placement: { x, z, rotation }` (metres and degrees) and `visible`. Missing visibility means visible. On loading legacy projects, missing placements are assigned without changing dimensions, finishes, or contents. No database migration is needed because rooms are stored as JSON. API DTOs validate and preserve these fields. API project validation rejects overlapping explicitly positioned rooms and already rejects duplicate room IDs.

- `packages/studio/house.ts`: world transforms, polygon collision checks, legacy arrangement, wall snapping, split/deduplicated physical walls, paired doors, synchronized connection edits and deletion, connection validation, and polygon floor area.
- `apps/web/src/editor/room-explorer.tsx`: selection, properties, rename, deep copy, confirmed delete, visibility.
- `apps/web/src/editor/house-editor.tsx`: global floor plan, pointer dragging, position and rotation inputs, corridor creation, adjacent-room connection, dimensions and area.
- `apps/web/src/editor/house-preview.tsx`: orbitable house preview with one physical mesh per wall segment, separate facing paints, opening cutouts, floors and furniture.
- Editor, room factory, styles, model and API validation were extended to integrate these components. `tests/house.test.cjs` covers geometry and DTO persistence.

## Acceptance

Implemented: room creation, naming, selection, independent dimensions and materials, deep duplication, confirmed deletion, visibility, project explorer, room previews, project preview and legacy loading. At least one room is retained, matching existing editor assumptions.

Implemented: global dragging, rotation, wall snapping, partial shared wall detection, shared geometry deduplication, separate facing paint data, paired adjacent door creation, corridors as editable rooms, existing door/window positioning, collision rejection, house rendering, individual editing, polygon-based area and global bounding dimensions. Hidden rooms remain included in area and collision validation.

## Limits

House preview is a cutaway architectural overview with floors, furniture, fixtures, ceiling decorations, interior wall decorations, and painted wall geometry. Door/window openings are cut out; detailed frames, glazing and animated door leaves remain in the individual room renderer. Wall thickness follows the maximum thickness of the adjoining room surfaces. Ceiling slabs are omitted so interiors remain visible.

Connections have persisted IDs. Editing or deleting either connected opening updates its partner atomically. Moves that disconnect a doorway are rejected with instructions to remove the connecting door first. Duplicate rooms clear connection IDs; removing a room leaves its neighbour's doorway as an independent opening. Snapping aligns parallel walls; it does not automatically rotate rooms. Rename and delete use browser-native prompt/confirmation dialogs.

## Verification

`npm test` passes all five test files, including eight new house tests. `npm run typecheck` passes both workspaces. Production API/web build passes. No lint script is configured. A headless Chrome check passed for house navigation, creating paired doors, saving both connection IDs, and opening the 3D house preview without page errors (`tests/browser/house-assembly.cjs`).

## Finding and using the house editor

Click **Whole house** in the workspace header or **House layout & preview** in the sidebar. The house editor opens in top view. **Add five-room example** appends the reference arrangement (living room, bedroom, kitchen, hallway, bathroom) with four hallway connections; existing rooms remain intact. The example is 12 × 8 metres with 96 m² floor area.

For a custom layout, add rooms or a corridor, drag parallel walls together until they snap, select a room, and use **Connect to … with door** below the plan. Existing connections are labelled. **Edit selected room** opens its individual design, and **Doors & windows** opens its openings inspector. Switch to **House 3D** to inspect the complete assembly.

The example layout has unit coverage for independent IDs, collision-free placement, area, and all four synchronized doors. The browser check also verifies adding and saving it through the UI.
