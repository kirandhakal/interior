import type { PlanPoint } from './dimensions';

export const PLAN_EPSILON = 1e-7;
export const MIN_PLAN_WALL = 0.1;
export const MAX_PLAN_VERTICES = 64;
export const MAX_PLAN_COORDINATE = 18;

export const pointDistance = (a: PlanPoint, b: PlanPoint) => Math.hypot(b.x - a.x, b.z - a.z);
export const samePoint = (a: PlanPoint, b: PlanPoint) => pointDistance(a, b) <= PLAN_EPSILON;
export const turn = (a: PlanPoint, b: PlanPoint, c: PlanPoint) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);

export function signedPlanArea(points: readonly PlanPoint[]) {
  return points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point.x * next.z - point.z * next.x;
  }, 0) / 2;
}

export const planArea = (points: readonly PlanPoint[]) => Math.abs(signedPlanArea(points));

export function planPerimeter(points: readonly PlanPoint[], closed = true) {
  return points.reduce((length, point, index) => length + (index + 1 < points.length || closed
    ? pointDistance(point, points[(index + 1) % points.length]) : 0), 0);
}

export function nearestOnSegment(point: PlanPoint, a: PlanPoint, b: PlanPoint) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return { x: a.x + dx * t, z: a.z + dz * t };
}

export const pointOnSegment = (point: PlanPoint, a: PlanPoint, b: PlanPoint) => samePoint(point, nearestOnSegment(point, a, b));

export function segmentsCross(a: PlanPoint, b: PlanPoint, c: PlanPoint, d: PlanPoint) {
  const opposite = (first: number, second: number) => Math.min(first, second) < -PLAN_EPSILON && Math.max(first, second) > PLAN_EPSILON;
  return opposite(turn(a, b, c), turn(a, b, d)) && opposite(turn(c, d, a), turn(c, d, b));
}

export function segmentsIntersect(a: PlanPoint, b: PlanPoint, c: PlanPoint, d: PlanPoint) {
  return segmentsCross(a, b, c, d) || pointOnSegment(a, c, d) || pointOnSegment(b, c, d) ||
    pointOnSegment(c, a, b) || pointOnSegment(d, a, b);
}

export function polygonError(points: readonly PlanPoint[], closed = true): string | undefined {
  if (points.length > MAX_PLAN_VERTICES) return `A room can have up to ${MAX_PLAN_VERTICES} vertices.`;
  if (closed && points.length < 3) return 'A room needs at least three vertices.';
  if (points.some(({ x, z }) => !Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > MAX_PLAN_COORDINATE || Math.abs(z) > MAX_PLAN_COORDINATE)) {
    return `Draw within ${MAX_PLAN_COORDINATE} m of the origin on each axis.`;
  }
  if (points.some((point, index) => points.slice(0, index).some(other => samePoint(other, point)))) return 'Vertices must be at different positions.';

  const count = Math.max(0, points.length - (closed ? 0 : 1));
  for (let i = 0; i < count; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (pointDistance(a, b) < MIN_PLAN_WALL - PLAN_EPSILON) return `Walls must be at least ${MIN_PLAN_WALL} m long.`;
    for (let j = i + 1; j < count; j++) {
      const c = points[j];
      const d = points[(j + 1) % points.length];
      if (j === i + 1 || (closed && i === 0 && j === count - 1)) {
        const [first, joint, last] = j === i + 1 ? [a, b, d] : [c, d, b];
        if (pointOnSegment(first, joint, last) || pointOnSegment(last, first, joint)) return 'Adjacent walls cannot overlap.';
      } else if (segmentsIntersect(a, b, c, d)) return 'Walls cannot cross or touch a nonadjacent wall.';
    }
  }
  if (closed && planArea(points) < MIN_PLAN_WALL ** 2) return 'The room needs a nonzero floor area.';
}

export function polygonContains(points: readonly PlanPoint[], point: PlanPoint, includeBoundary = true) {
  let inside = false;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (pointOnSegment(point, a, b)) return includeBoundary;
    if ((a.z > point.z) !== (b.z > point.z) && point.x < a.x + (b.x - a.x) * (point.z - a.z) / (b.z - a.z)) inside = !inside;
  }
  return inside;
}

export function polygonContainsFootprint(points: readonly PlanPoint[], footprint: readonly PlanPoint[]) {
  const sides = footprint.map((point, index) => [point, footprint[(index + 1) % footprint.length]] as const);
  if (!sides.every(([a, b]) => polygonContains(points, a) && polygonContains(points, { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }))) return false;
  return points.every((a, index) => {
    const b = points[(index + 1) % points.length];
    return !polygonContains(footprint, a, false) && sides.every(([c, d]) => !segmentsCross(a, b, c, d));
  });
}

export const wallHeading = (start: PlanPoint, end: PlanPoint) => (Math.atan2(end.z - start.z, end.x - start.x) * 180 / Math.PI + 360) % 360;

export function wallEndpoint(start: PlanPoint, length: number, heading: number): PlanPoint {
  const radians = heading * Math.PI / 180;
  return { x: start.x + Math.cos(radians) * length, z: start.z + Math.sin(radians) * length };
}

export function snapPlanPoint(point: PlanPoint, grid: number, angle: number, anchor?: PlanPoint): PlanPoint {
  if (anchor && angle) {
    const length = pointDistance(anchor, point);
    const heading = Math.round(wallHeading(anchor, point) / angle) * angle;
    return wallEndpoint(anchor, grid ? Math.round(length / grid) * grid : length, heading);
  }
  if (!grid) return point;
  return { x: Math.round(point.x / grid) * grid, z: Math.round(point.z / grid) * grid };
}
