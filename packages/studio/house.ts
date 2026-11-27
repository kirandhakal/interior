import { roomPlan, openingFits, LIMITS, type Room, type PlanPoint, type Wall } from './model';
import { planArea, pointOnSegment, segmentsCross } from './polygon';
import { wallDesignsError } from './wall-design';

export const pose = (room: Room) => room.placement ?? { x: 0, z: 0, rotation: 0 };
export function world(room: Room, p: PlanPoint): PlanPoint {
  const t = pose(room), a = t.rotation * Math.PI / 180;
  return { x: t.x + p.x * Math.cos(a) - p.z * Math.sin(a), z: t.z + p.x * Math.sin(a) + p.z * Math.cos(a) };
}
export const footprint = (room: Room) => roomPlan(room.dimensions).inner.map(p => world(room, p));
export function bounds(points: PlanPoint[]) {
  const xs = points.map(p => p.x), zs = points.map(p => p.z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}
function inside(p: PlanPoint, points: PlanPoint[]) {
  if (points.some((a, i) => pointOnSegment(p, a, points[(i + 1) % points.length]))) return false;
  let hit = false;
  points.forEach((a, i) => { const b = points[(i + 1) % points.length];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) hit = !hit;
  }); return hit;
}
export function overlaps(a: Room, b: Room) {
  const x = footprint(a), y = footprint(b);
  return x.some((p, i) => y.some((q, j) => segmentsCross(p, x[(i + 1) % x.length], q, y[(j + 1) % y.length]))) ||
    x.some(p => inside(p, y)) || y.some(p => inside(p, x)) ||
    x.some((p, i) => inside({ x: (p.x + x[(i + 1) % x.length].x) / 2, z: (p.z + x[(i + 1) % x.length].z) / 2 }, y)) ||
    y.some((p, i) => inside({ x: (p.x + y[(i + 1) % y.length].x) / 2, z: (p.z + y[(i + 1) % y.length].z) / 2 }, x)) ||
    (x.every(p => y.some(q => Math.hypot(p.x - q.x, p.z - q.z) < 1e-6)));
}
export function layoutError(rooms: Room[]) {
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++)
    if (overlaps(rooms[i], rooms[j])) return `${rooms[i].name} overlaps ${rooms[j].name}.`;
}
export function arrangeLegacy(rooms: Room[]): Room[] {
  const placed: Room[] = [];
  for (const room of rooms) {
    if (room.placement) { placed.push(room); continue; }
    const b = bounds(footprint(room));
    const right = placed.length ? Math.max(...placed.flatMap(r => footprint(r).map(p => p.x))) + 1 : b.minX;
    placed.push({ ...room, placement: { x: right - b.minX, z: 0, rotation: 0 } });
  } return placed;
}
export function snapRoom(room: Room, others: Room[], tolerance = 0.25) {
  let best = room, distance = tolerance;
  for (const a of roomPlan(room.dimensions).edges) for (const other of others) for (const b of roomPlan(other.dimensions).edges) {
    const a0 = world(room, a.start), a1 = world(room, a.end), b0 = world(other, b.start), b1 = world(other, b.end);
    const dx = a1.x - a0.x, dz = a1.z - a0.z, len = Math.hypot(dx, dz);
    if (Math.abs(dx * (b1.z - b0.z) - dz * (b1.x - b0.x)) > 1e-5) continue;
    const d = ((b0.x - a0.x) * -dz + (b0.z - a0.z) * dx) / len;
    const t0 = ((b0.x-a0.x)*dx+(b0.z-a0.z)*dz)/len;
    const t1 = ((b1.x-a0.x)*dx+(b1.z-a0.z)*dz)/len;
    if (Math.min(len, Math.max(t0,t1)) - Math.max(0, Math.min(t0,t1)) < 0.1) continue;
    if (Math.abs(d) < distance) {
      const next = { ...room, placement: { ...pose(room), x: pose(room).x - dz / len * d, z: pose(room).z + dx / len * d } };
      if (!others.some(r => overlaps(next, r))) { best = next; distance = Math.abs(d); }
    }
  } return best;
}
export type WallSide = { room: Room; wall: Wall };
export type PhysicalWall = { start: PlanPoint; end: PlanPoint; sides: WallSide[] };
// Split collinear edges at every endpoint; each resulting physical segment has at most two surfaces.
export function physicalWalls(rooms: Room[]): PhysicalWall[] {
  const edges = rooms.flatMap(room => roomPlan(room.dimensions).edges.map(e => ({ start: world(room, e.start), end: world(room, e.end), side: { room, wall: e.id } })));
  const segments = new Map<string, PhysicalWall>();
  const key = (p: PlanPoint) => `${(Math.round(p.x * 1e5) / 1e5).toFixed(5)},${(Math.round(p.z * 1e5) / 1e5).toFixed(5)}`;
  for (const e of edges) {
    const dx = e.end.x - e.start.x, dz = e.end.z - e.start.z, l2 = dx * dx + dz * dz;
    const ts = [0, 1, ...edges.flatMap(q => [q.start, q.end]).filter(p => pointOnSegment(p, e.start, e.end)).map(p => ((p.x - e.start.x) * dx + (p.z - e.start.z) * dz) / l2)].sort((a,b) => a-b);
    for (let i = 1; i < ts.length; i++) {
      if (ts[i] - ts[i-1] < 1e-6) continue;
      const start = { x: e.start.x + dx * ts[i-1], z: e.start.z + dz * ts[i-1] }, end = { x: e.start.x + dx * ts[i], z: e.start.z + dz * ts[i] };
      const id = [key(start), key(end)].sort().join('/');
      const existing = segments.get(id);
      if (existing) existing.sides.push(e.side); else segments.set(id, { start, end, sides: [e.side] });
    }
  } return [...segments.values()];
}
export function connectRooms(segment: PhysicalWall): Room[] {
  if (segment.sides.length !== 2) throw new Error('Select a shared wall.');
  const length = Math.hypot(segment.end.x-segment.start.x, segment.end.z-segment.start.z);
  if (length < 1.15) throw new Error('Shared wall needs at least 1.15 m for a door.');
  const connectionId = crypto.randomUUID();
  return segment.sides.map(({ room, wall }) => {
    const e = roomPlan(room.dimensions).walls[wall], a = world(room, e.start), b = world(room, e.end);
    const mid = { x: (segment.start.x+segment.end.x)/2, z: (segment.start.z+segment.end.z)/2 };
    const offset = ((mid.x-a.x)*(b.x-a.x)+(mid.z-a.z)*(b.z-a.z))/e.span-e.span/2;
    const opening = { id: crypto.randomUUID(), connectionId, kind: 'Door' as const, wall, offset, width: 0.9, height: Math.min(2.05, room.dimensions.height - 0.1), sill: 0 };
    const next = { ...room, openings: [...room.openings, opening] };
    if (room.openings.length >= LIMITS.openings || !openingFits(room, opening) || wallDesignsError(next)) throw new Error('Door conflicts with existing openings or decorations. Move those items first.');
    return next;
  });
}
export const totalArea = (rooms: Room[]) => rooms.reduce((sum, room) => sum + planArea(roomPlan(room.dimensions).inner), 0);

/** Keep a physical doorway consistent when either room-local surface is edited. */
export function updateHouseRoom(rooms: Room[], next: Room): Room[] {
  const previous = rooms.find(r => r.id === next.id);
  let result = rooms.map(r => r.id === next.id ? next : r);
  for (const old of previous?.openings ?? []) {
    if (!old.connectionId) continue;
    const opening = next.openings.find(o => o.id === old.id);
    result = result.map(other => {
      if (other.id === next.id) return other;
      const partner = other.openings.find(o => o.connectionId === old.connectionId);
      if (!partner) return other;
      if (!opening) return { ...other, openings: other.openings.filter(o => o.id !== partner.id) };
      const edge = roomPlan(next.dimensions).walls[opening.wall];
      const point = world(next, { x: edge.midpoint.x + edge.tangent.x * opening.offset, z: edge.midpoint.z + edge.tangent.z * opening.offset });
      const target = roomPlan(other.dimensions).walls[partner.wall];
      const a = world(other, target.start), b = world(other, target.end);
      if (!pointOnSegment(point, a, b)) throw new Error('This move would disconnect a doorway. Remove the connecting door before moving or rotating this room.');
      const offset = ((point.x-a.x)*(b.x-a.x)+(point.z-a.z)*(b.z-a.z))/target.span-target.span/2;
      const mirrored = { ...partner, kind: opening.kind, offset, width: opening.width, height: opening.height, sill: opening.sill, openAngle: opening.openAngle };
      const updated = { ...other, openings: other.openings.map(o => o.id === partner.id ? mirrored : o) };
      if (!openingFits(updated, mirrored) || wallDesignsError(updated)) throw new Error('The doorway conflicts with items in the adjacent room. Move those items first.');
      return updated;
    });
  }
  const error = layoutError(result) ?? connectionError(result);
  if (error) throw new Error(error);
  return result;
}

export function connectionError(rooms: Room[]) {
  const connections = new Map<string, { room: Room; opening: Room['openings'][number] }[]>();
  for (const room of rooms) for (const opening of room.openings) if (opening.connectionId) {
    const entries = connections.get(opening.connectionId) ?? []; entries.push({ room, opening }); connections.set(opening.connectionId, entries);
  }
  for (const entries of connections.values()) {
    if (entries.length !== 2 || entries[0].room.id === entries[1].room.id) return 'A connected door must belong to two adjacent rooms.';
    const points = entries.map(({room,opening}) => {
      const e = roomPlan(room.dimensions).walls[opening.wall];
      return e && world(room, { x:e.midpoint.x+e.tangent.x*opening.offset,z:e.midpoint.z+e.tangent.z*opening.offset });
    });
    if (!points[0] || !points[1] || Math.hypot(points[0].x-points[1].x,points[0].z-points[1].z)>1e-5) return 'Connected doorways must align.';
    const [a,b] = entries.map(e=>e.opening);
    const shared = physicalWalls(entries.map(e=>e.room)).filter(s=>s.sides.length===2);
    const edge = roomPlan(entries[0].room.dimensions).walls[a.wall];
    const ends = [-1,1].map(sign=>world(entries[0].room,{x:edge.midpoint.x+edge.tangent.x*(a.offset+sign*a.width/2),z:edge.midpoint.z+edge.tangent.z*(a.offset+sign*a.width/2)}));
    if (!shared.some(s=>s.sides.every(side=>entries.some(e=>e.room.id===side.room.id&&e.opening.wall===side.wall)) && ends.every(p=>pointOnSegment(p,s.start,s.end)))) return 'Connected doors must fit within a shared wall.';
    if (a.kind!==b.kind || a.width!==b.width || a.height!==b.height || a.sill!==b.sill) return 'Connected doorway dimensions must match.';
  }
}
