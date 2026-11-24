import {
  DEFAULT_WALL_THICKNESS, OPENING_EDGE_CLEARANCE, WALL_DEFAULT, dimensionError, isWallMount, planBounds, pointAlongWall,
  roomPlan, wallOffset, type Dimensions, type Opening, type OutlineVertex, type PlanWall, type Room, type Wall, type WallPaint,
} from './model';
import { PLAN_EPSILON, pointOnSegment, polygonError, samePoint, signedPlanArea } from './polygon';
import { resizeRoom } from './resize-room';

export function editableOutline(dimensions: Dimensions): OutlineVertex[] {
  return roomPlan(dimensions).edges.map(({ id, start, thickness }) => ({ ...start, wallId: id, thickness }));
}

export function clockwiseOutline(points: readonly OutlineVertex[]): OutlineVertex[] {
  if (signedPlanArea(points) >= 0) return [...points];
  // Preserve each wall's identity when its start and end reverse.
  return points.map((_, index) => {
    const i = (points.length - index) % points.length;
    const { x, z } = points[i];
    const { wallId, thickness } = points[(i + points.length - 1) % points.length];
    return { x, z, wallId, thickness };
  });
}

function onSameLine(before: PlanWall, after: PlanWall) {
  const parallel = Math.abs(before.tangent.x * after.tangent.z - before.tangent.z * after.tangent.x) < PLAN_EPSILON;
  const distance = Math.abs((after.start.x - before.start.x) * before.normal.x + (after.start.z - before.start.z) * before.normal.z);
  return parallel && distance < PLAN_EPSILON;
}

export function applyRoomOutline(base: Room, name: string, height: number, points: readonly OutlineVertex[]): { room: Room } | { error: string } {
  const invalid = polygonError(points);
  if (invalid) return { error: invalid };
  const outline = clockwiseOutline(points);
  const previous = editableOutline(base.dimensions);
  if (outline.length === previous.length && outline.every((point, index) => point.wallId === previous[index].wallId &&
    samePoint(point, previous[index]) && (point.thickness ?? DEFAULT_WALL_THICKNESS) === previous[index].thickness)) {
    const room = resizeRoom(base, name, height === base.dimensions.height ? base.dimensions : { ...base.dimensions, height });
    return room ? { room } : { error: 'The room contents cannot fit at this height.' };
  }

  const { length, width } = planBounds(outline);
  const dimensions: Dimensions = { length, width, height, outline };
  const error = dimensionError(dimensions);
  if (error) return { error };
  const oldPlan = roomPlan(base.dimensions);
  const nextPlan = roomPlan(dimensions);

  function host(id: Wall, offset: number, clearance: number) {
    const before = oldPlan.walls[id];
    const point = pointAlongWall(before, offset);
    const retained = nextPlan.walls[id];
    const segment = nextPlan.edges.find(edge => onSameLine(before, edge) && pointOnSegment(point, edge.start, edge.end) &&
      Math.abs(wallOffset(edge, point)) + clearance <= edge.span / 2 + PLAN_EPSILON);
    if (segment) return { wall: segment, offset: wallOffset(segment, point), reversed: before.tangent.x * segment.tangent.x + before.tangent.z * segment.tangent.z < 0 };
    if (retained) return { wall: retained, offset, reversed: false };
  }

  const openings: Opening[] = [];
  for (const opening of base.openings) {
    const placement = host(opening.wall, opening.offset, opening.width / 2 + OPENING_EDGE_CLEARANCE);
    if (!placement) return { error: 'A removed wall still has a door or window. Move it to another wall before changing the outline.' };
    const hinge = placement.reversed && opening.kind === 'Door' ? (opening.hinge === 'Right' ? 'Left' : 'Right') : opening.hinge;
    openings.push({ ...opening, wall: placement.wall.id, offset: placement.offset, hinge });
  }
  const lights: Room['lights'] = [];
  for (const light of base.lights) {
    if (!isWallMount(light.mount)) { lights.push(light); continue; }
    const before = oldPlan.walls[light.mount];
    const placement = host(light.mount, wallOffset(before, light), 0);
    if (!placement) return { error: 'A removed wall still has a fixture. Move it to another wall before changing the outline.' };
    lights.push({ ...light, ...pointAlongWall(placement.wall, placement.offset), mount: placement.wall.id });
  }

  const sourceIds = new Map(nextPlan.edges.map(edge => [edge.id, oldPlan.walls[edge.id]?.id ?? oldPlan.edges.find(before =>
    pointOnSegment(edge.start, before.start, before.end) && pointOnSegment(edge.end, before.start, before.end))?.id]));
  const walls = (paint: WallPaint, fallback?: WallPaint) => Object.fromEntries(nextPlan.edges.map(({ id }) => {
    const source = sourceIds.get(id);
    return [id, (source && paint[source]) || fallback?.[id] || { color: WALL_DEFAULT, finish: 'Matte' }];
  })) as WallPaint;
  const paint = walls(base.walls);
  const room = resizeRoom({ ...base, walls: paint, openings, lights, options: base.options.map(option => ({ ...option, walls: walls(option.walls, paint) })) },
    name, dimensions, false);
  return room ? { room } : { error: 'The new outline leaves too little space for the existing openings or furniture.' };
}
