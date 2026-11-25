import { roomPlan, wallOffset, type Dimensions, type Opening, type Room, type Wall } from './model';

export const WALL_SURFACES = ['Interior', 'Exterior'] as const;
export type WallSurface = typeof WALL_SURFACES[number];
export type WallPoint = { u: number; v: number; depth: number };
export type WorldPoint = { x: number; y: number; z: number };

/** Meters; origin is the visible lower-left corner, U right, V up,
 * depth toward the viewer. Exterior U reverses and includes the miter joins. */
export function wallSurfaceFrame(dimensions: Dimensions, id: Wall, surface: WallSurface) {
  const wall = roomPlan(dimensions).walls[id];
  if (!wall) throw new Error(`Unknown wall: ${id}`);
  const exterior = surface === 'Exterior';
  const start = exterior ? wall.outerEnd : wall.start;
  const end = exterior ? wall.outerStart : wall.end;
  const sign = exterior ? -1 : 1;
  return {
    id, surface, wall, origin: { x: start.x, y: 0, z: start.z },
    horizontal: { x: sign * wall.tangent.x, z: sign * wall.tangent.z },
    normal: { x: -sign * wall.normal.x, z: -sign * wall.normal.z },
    width: Math.hypot(end.x - start.x, end.z - start.z), height: dimensions.height,
  };
}
export type WallSurfaceFrame = ReturnType<typeof wallSurfaceFrame>;

export function wallLocalToWorld(frame: WallSurfaceFrame, point: WallPoint): WorldPoint {
  return { x: frame.origin.x + frame.horizontal.x * point.u + frame.normal.x * point.depth,
    y: point.v, z: frame.origin.z + frame.horizontal.z * point.u + frame.normal.z * point.depth };
}

export function worldToWallLocal(frame: WallSurfaceFrame, point: WorldPoint): WallPoint {
  const x = point.x - frame.origin.x;
  const z = point.z - frame.origin.z;
  return { u: x * frame.horizontal.x + z * frame.horizontal.z, v: point.y,
    depth: x * frame.normal.x + z * frame.normal.z };
}

/** Projects the same opening through the wall; no project objects are copied or moved. */
export function openingOnSurface(frame: WallSurfaceFrame, opening: Opening) {
  const half = opening.width / 2;
  const outerLeft = wallOffset(frame.wall, frame.wall.outerStart);
  const outerRight = wallOffset(frame.wall, frame.wall.outerEnd);
  // Match the wall renderer's clipped exterior aperture at concave joins.
  const left = frame.surface === 'Interior' ? opening.offset - half
    : Math.min(outerRight, Math.max(outerLeft, opening.offset - half));
  const right = frame.surface === 'Interior' ? opening.offset + half
    : Math.min(outerRight, Math.max(outerLeft, opening.offset + half));
  return { opening, u: frame.surface === 'Interior' ? left + frame.wall.span / 2 : outerRight - right,
    v: opening.sill, width: right - left, height: opening.height };
}

export function isolateWall(room: Room, id: Wall, surface: WallSurface) {
  const frame = wallSurfaceFrame(room.dimensions, id, surface);
  const openings = room.openings.filter(opening => opening.wall === id);
  const apertures = openings.map(opening => openingOnSurface(frame, opening));
  return { room, id, surface, frame, paint: room.walls[id], openings, apertures,
    grossArea: frame.width * frame.height,
    netArea: frame.width * frame.height - apertures.reduce((area, opening) => area + opening.width * opening.height, 0) };
}
export type IsolatedWall = ReturnType<typeof isolateWall>;

export function wallPointIsPaintable(wall: IsolatedWall, point: WallPoint) {
  return Number.isFinite(point.u) && Number.isFinite(point.v) && Number.isFinite(point.depth) && Math.abs(point.depth) < 1e-6 &&
    point.u >= 0 && point.u <= wall.frame.width && point.v >= 0 && point.v <= wall.frame.height &&
    !wall.apertures.some(opening => point.u >= opening.u && point.u <= opening.u + opening.width &&
      point.v >= opening.v && point.v <= opening.v + opening.height);
}
