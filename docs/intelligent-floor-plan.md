# Intelligent floor plan implementation

## Baseline audit

The application uses Next/React/Three.js, shared TypeScript domain modules, a Nest API,
and project-level snapshot history. `Room.spaceType` already includes Corridor.
`dimensions.outline` supports concave polygons with stable wall IDs. Existing outline
editing preserves wall attachments or refuses incompatible edits. `connectionId`
pairs openings across shared walls. API DTOs and JSON project storage retain these fields.

Implemented: manual polygon drawing, vertex insertion/removal, wall dimensions and
thickness, placement/rotation, independent wall finishes and contents, 2D/3D views,
shared doors, atomic project history, legacy placement migration.
Partial: snapping (fixed grid/angle and parallel wall translation), selection (one
entity), validation (strict polygon crossings/containment), connection updates
(reject disconnected doorways), draft dragging.
Missing: automatic routing, rough correction preview, multi-selection and groups,
intersection-area overlays, actionable conflict solutions, layout candidate engine,
configurable contextual snapping, dependency-aware transforms, contextual menus.

Overlap errors originate in `house.layoutError`, called at house-editor commit and
API validation. The editor discards invalid drag drafts and prints a generic error.
The current overlap test uses vertices, edge midpoints and strict intersections;
it needs exact intersection-area coverage for coincident/subdivided boundaries.
Connections are physical shared-wall openings, not mere proximity. Separating them
is correctly rejected but currently offers no recovery workflow.

## Implementation sequence and verification gates

1. Corridor generation module, selected-room UI and candidate preview; reuse Room,
   outline rendering and explicit opening pairs. Test routing, obstacles, multiple
   destinations, persistence and existing room preservation.
2. Drawing-assistance module with configurable tolerances and preview/reject; test
   rough orthogonal geometry and preservation of intentional angles.
3. Transform module and selection controls; extend persisted lock/group metadata
   only with matching API validation. Verify attachments and grouped transforms.
4. Polygon intersection, spatial broad phase and structured collision reports;
   verify concave shapes, shared boundaries and draft overlays.
5. Conflict resolution UI over retained proposals, with keyboard access and explicit
   apply/cancel. Verify invalid operations never enter project history.
6. Deterministic candidate optimization preserving dimensions and locked entities;
   test whole-layout validity and impossible arrangements.
7. Snapping module with configurable grid/vertex/edge/angle settings and guides.
8. Connection management using stable paired opening IDs; dependency-aware atomic
   moves and explicit disconnection, with attachment validation.
9. Context toolbar, properties, context menu and keyboard interactions.
10. Persistence and history integration audit, compatibility, failure recovery,
    import/export and end-to-end regression verification.

Each gate requires focused geometry/integration tests, type checking and production
build verification. Browser checks cover UI behavior. No lint script or linter is
configured at baseline; report that explicitly rather than claiming lint passed.
Do not mark a task complete until all its acceptance checks have evidence.

## Model and module decisions

Keep Room as the authoritative spatial entity; corridor geometry uses the same
outline, wall paints, lights and decorations. Avoid a parallel corridor store.
Generated proposals remain component-local until explicitly applied as one history
operation. Stable connection IDs remain paired on actual shared-wall openings.
Geometry, routing, correction, transforms, snapping and optimization belong in
separate shared domain modules; interactive controls remain in the web editor.

## Existing workspace changes

Six staged files predate this task: globals.css, editor.tsx, house-editor.tsx,
house.ts, house-attachments.cjs and house.test.cjs. Preserve that staged baseline
and exclude it from feature commits.
