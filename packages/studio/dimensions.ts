export const WALLS = ['north', 'east', 'south', 'west'] as const;
export type Wall = typeof WALLS[number];
export type Dimensions = {
  // The north and east spans are also the room-level length and width, in meters.
  length: number;
  width: number;
  height: number;
  southLength?: number;
  westLength?: number;
  wallThickness?: Partial<Record<Wall, number>>;
};

export const DIMENSION_BOUNDS = { length: [1.2, 18], width: [1.2, 18], height: [2, 6] } as const;
export const WALL_THICKNESS_BOUNDS = [0.05, 0.6] as const;
export const DEFAULT_WALL_THICKNESS = 0.16;
export const MIN_CORNER_ANGLE = 15;
export const MAX_ROOM_COORDINATE = DIMENSION_BOUNDS.length[1];
export const OPENING_EDGE_CLEARANCE = 0.08;
export const OPENING_GAP = 0.04;
export const PLACEMENT_TOLERANCE = 0.002;

export type PlanPoint = { x: number; z: number };

export function wallSpan(dimensions: Dimensions, wall: Wall) {
  switch (wall) {
    case 'north': return dimensions.length;
    case 'east': return dimensions.width;
    case 'south': return dimensions.southLength ?? dimensions.length;
    case 'west': return dimensions.westLength ?? dimensions.width;
  }
}

export const wallThickness = (dimensions: Dimensions, wall: Wall) => dimensions.wallThickness?.[wall] ?? DEFAULT_WALL_THICKNESS;

export function setWallSpan(dimensions: Dimensions, wall: Wall, span: number): Dimensions {
  switch (wall) {
    case 'north': return { ...dimensions, length: span, southLength: wallSpan(dimensions, 'south') };
    case 'east': return { ...dimensions, width: span, westLength: wallSpan(dimensions, 'west') };
    case 'south': return { ...dimensions, southLength: span };
    case 'west': return { ...dimensions, westLength: span };
  }
}

export function setRoomDimension(dimensions: Dimensions, key: 'length' | 'width' | 'height', value: number): Dimensions {
  if (key === 'length' && dimensions.southLength !== undefined && inBounds(dimensions.length, DIMENSION_BOUNDS.length)) {
    return { ...dimensions, length: value, southLength: (dimensions.southLength / dimensions.length) * value };
  }
  if (key === 'width' && dimensions.westLength !== undefined && inBounds(dimensions.width, DIMENSION_BOUNDS.width)) {
    return { ...dimensions, width: value, westLength: (dimensions.westLength / dimensions.width) * value };
  }
  return { ...dimensions, [key]: value };
}

export function inBounds(value: number, [min, max]: readonly [number, number]) {
  return Number.isFinite(value) && value >= min && value <= max;
}

const dot = (a: PlanPoint, b: PlanPoint) => a.x * b.x + a.z * b.z;
const subtract = (a: PlanPoint, b: PlanPoint): PlanPoint => ({ x: a.x - b.x, z: a.z - b.z });
const interpolate = (a: PlanPoint, b: PlanPoint, t: number): PlanPoint => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
const cross = (a: PlanPoint, b: PlanPoint) => a.x * b.z - a.z * b.x;

function corners(dimensions: Dimensions): PlanPoint[] {
  const [north, east, south, west] = WALLS.map(wall => wallSpan(dimensions, wall));
  if (north === south && east === west) {
    return [
      { x: -north / 2, z: -east / 2 }, { x: north / 2, z: -east / 2 },
      { x: north / 2, z: east / 2 }, { x: -north / 2, z: east / 2 },
    ];
  }

  // A cyclic quadrilateral fixes the angles deterministically for four side lengths.
  // The triangles on either side of the NW–SE diagonal have supplementary opposite angles.
  const cosine = (north ** 2 + east ** 2 - south ** 2 - west ** 2) / (2 * (north * east + south * west));
  const se = { x: north - east * cosine, z: east * Math.sqrt(1 - cosine ** 2) };
  const diagonal = Math.hypot(se.x, se.z);
  const along = (west ** 2 + diagonal ** 2 - south ** 2) / (2 * diagonal);
  const across = Math.sqrt(Math.max(0, west ** 2 - along ** 2));
  const sw = { x: (se.x * along - se.z * across) / diagonal, z: (se.z * along + se.x * across) / diagonal };
  const points = [{ x: 0, z: 0 }, { x: north, z: 0 }, se, sw];
  const bounds = planBounds(points);
  return points.map(point => subtract(point, bounds.center));
}

export function dimensionError(dimensions: Dimensions) {
  if (!inBounds(dimensions.height, DIMENSION_BOUNDS.height) || WALLS.some(wall =>
    !inBounds(wallSpan(dimensions, wall), DIMENSION_BOUNDS.length) || !inBounds(wallThickness(dimensions, wall), WALL_THICKNESS_BOUNDS))) {
    return 'Enter dimensions within the allowed ranges.';
  }

  const spans = WALLS.map(wall => wallSpan(dimensions, wall));
  if (Math.max(...spans) * 2 >= spans.reduce((total, span) => total + span, 0)) {
    return 'Each wall must be shorter than the other three walls combined.';
  }

  const points = corners(dimensions);
  const minimumSine = Math.sin(MIN_CORNER_ANGLE * Math.PI / 180);
  if (points.some((point, index) => {
    const incoming = subtract(point, points[(index + 3) % 4]);
    const outgoing = subtract(points[(index + 1) % 4], point);
    const sine = cross(incoming, outgoing) / (Math.hypot(incoming.x, incoming.z) * Math.hypot(outgoing.x, outgoing.z));
    return !(sine + 1e-10 >= minimumSine);
  })) {
    return `Room corners must be between ${MIN_CORNER_ANGLE}° and ${180 - MIN_CORNER_ANGLE}°.`;
  }
  const { edges, outer } = roomPlan(dimensions);
  if (edges.some((wall, index) => dot(subtract(outer[(index + 1) % 4], outer[index]), wall.tangent) <= 1e-10)) {
    return 'The wall thicknesses leave too little space at a corner.';
  }
}

export function planBounds(points: readonly PlanPoint[]) {
  const xs = points.map(point => point.x);
  const zs = points.map(point => point.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return { minX, maxX, minZ, maxZ, length: maxX - minX, width: maxZ - minZ,
    center: { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 } };
}

function planWall(start: PlanPoint, end: PlanPoint, thickness: number) {
  const span = Math.hypot(end.x - start.x, end.z - start.z);
  const tangent = { x: (end.x - start.x) / span, z: (end.z - start.z) / span };
  return { start, end, span, thickness, tangent, normal: { x: tangent.z, z: -tangent.x }, midpoint: interpolate(start, end, 0.5) };
}

export type PlanWall = ReturnType<typeof planWall>;

export function pointAlongWall(wall: PlanWall, offset: number, outward = 0): PlanPoint {
  return { x: wall.midpoint.x + wall.tangent.x * offset + wall.normal.x * outward,
    z: wall.midpoint.z + wall.tangent.z * offset + wall.normal.z * outward };
}

export const wallOffset = (wall: PlanWall, point: PlanPoint) => dot(subtract(point, wall.midpoint), wall.tangent);

function buildPlan(dimensions: Dimensions) {
  const inner = corners(dimensions);
  const edges = WALLS.map((wall, index) => planWall(inner[index], inner[(index + 1) % 4], wallThickness(dimensions, wall)));
  const outer = edges.map((current, index) => {
    const previous = edges[(index + 3) % 4];
    const first = pointAlongWall(previous, previous.span / 2, previous.thickness);
    const second = pointAlongWall(current, -current.span / 2, current.thickness);
    const along = cross(subtract(second, first), current.tangent) / cross(previous.tangent, current.tangent);
    return { x: first.x + previous.tangent.x * along, z: first.z + previous.tangent.z * along };
  });
  const [north, east, south, west] = edges;
  const center = inner.reduce((point, vertex) => ({ x: point.x + vertex.x / 4, z: point.z + vertex.z / 4 }), { x: 0, z: 0 });
  return { inner, outer, edges, walls: { north, east, south, west }, bounds: planBounds(inner), outerBounds: planBounds(outer), center };
}

const cachedPlans = new WeakMap<Dimensions, ReturnType<typeof buildPlan>>();

export function roomPlan(dimensions: Dimensions) {
  let plan = cachedPlans.get(dimensions);
  if (!plan) {
    plan = buildPlan(dimensions);
    cachedPlans.set(dimensions, plan);
  }
  return plan;
}

export function roomMeasurements(dimensions: Dimensions, openings: readonly { width: number; height: number }[] = []) {
  const { inner } = roomPlan(dimensions);
  const floorArea = planArea(inner);
  const perimeter = WALLS.reduce((sum, wall) => sum + wallSpan(dimensions, wall), 0);
  const wallArea = perimeter * dimensions.height;
  const openingArea = openings.reduce((sum, opening) => sum + opening.width * opening.height, 0);
  return { floorArea, perimeter, wallArea, netWallArea: wallArea - openingArea };
}

export const planArea = (points: readonly PlanPoint[]) =>
  Math.abs(points.reduce((sum, point, index) => sum + cross(point, points[(index + 1) % points.length]), 0)) / 2;

export function clipPlan(points: readonly PlanPoint[], wall: PlanWall, clearance = 0) {
  const clipped: PlanPoint[] = [];
  for (const [index, start] of points.entries()) {
    const end = points[(index + 1) % points.length];
    const a = dot(subtract(start, wall.start), wall.normal) + clearance;
    const b = dot(subtract(end, wall.start), wall.normal) + clearance;
    if (a <= 0) clipped.push(start);
    if ((a < 0 && b > 0) || (a > 0 && b < 0)) clipped.push(interpolate(start, end, a / (a - b)));
  }
  return clipped;
}

export function roomContains(dimensions: Dimensions, point: PlanPoint) {
  return roomPlan(dimensions).edges.every(wall => dot(subtract(point, wall.start), wall.normal) <= 1e-10);
}

export function placementPoint(dimensions: Dimensions, point: PlanPoint, clearance: (wall: PlanWall) => number) {
  const { inner, edges } = roomPlan(dimensions);
  if (edges.every(wall => dot(subtract(point, wall.start), wall.normal) + clearance(wall) <= 1e-10)) return point;
  const positions = edges.reduce((polygon, wall) => clipPlan(polygon, wall, clearance(wall)), inner);
  let nearest: PlanPoint | undefined;
  let distance = Infinity;
  for (const [index, start] of positions.entries()) {
    const end = positions[(index + 1) % positions.length];
    const edge = subtract(end, start);
    const scale = dot(edge, edge);
    const along = scale ? Math.min(1, Math.max(0, dot(subtract(point, start), edge) / scale)) : 0;
    const candidate = interpolate(start, end, along);
    const delta = subtract(point, candidate);
    const squaredDistance = dot(delta, delta);
    if (squaredDistance < distance) {
      distance = squaredDistance;
      nearest = candidate;
    }
  }
  return nearest;
}
