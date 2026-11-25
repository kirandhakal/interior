import { FINISHES, HEX_COLOR, roomWallIds, type Paint, type Room, type Wall } from './model';
import { isolateWall, WALL_SURFACES, type WallSurface } from './wall-surface';

export const WALL_ITEM_KINDS = ['Paint section', 'Wall art', 'Mirror', 'Shelf', 'Wall panel'] as const;
export type WallItemKind = typeof WALL_ITEM_KINDS[number];
export type WallItem = {
  id: string; name: string; kind: WallItemKind; u: number; v: number;
  width: number; height: number; rotation: number; depth: number; color: string; finish: Paint['finish'];
};
export type WallDesign = { wall: Wall; surface: WallSurface; paint?: Paint; items: WallItem[] };
export const MAX_WALL_ITEMS = 80;
export const WALL_ITEM_PRESETS: Record<WallItemKind, Pick<WallItem, 'width' | 'height' | 'depth' | 'color'>> = {
  'Paint section': { width: 1.2, height: 1, depth: 0, color: '#A4AB94' },
  'Wall art': { width: 0.7, height: 0.9, depth: 0.035, color: '#B98169' },
  Mirror: { width: 0.65, height: 0.9, depth: 0.025, color: '#CAB899' },
  Shelf: { width: 1, height: 0.08, depth: 0.22, color: '#996940' },
  'Wall panel': { width: 0.6, height: 1.2, depth: 0.025, color: '#D5C3A8' },
};
export const getWallDesign = (room: Room, wall: Wall, surface: WallSurface): WallDesign =>
  room.wallDesigns?.find(design => design.wall === wall && design.surface === surface) ?? { wall, surface, items: [] };

export function setWallDesign(room: Room, design: WallDesign): Room {
  design = { ...design, items: [...design.items.filter(item => item.kind === 'Paint section'), ...design.items.filter(item => item.kind !== 'Paint section')] };
  let designs = (room.wallDesigns ?? []).filter(value => value.wall !== design.wall || value.surface !== design.surface);
  // Keep interior paint in the existing source of truth so palette editing and paint comparisons still work.
  if (design.surface === 'Interior' && design.paint) {
    const exterior = getWallDesign(room, design.wall, 'Exterior');
    if (!exterior.paint) {
      designs = designs.filter(value => value.wall !== design.wall || value.surface !== 'Exterior');
      designs.push({ ...exterior, paint: { ...room.walls[design.wall] } });
    }
    const { paint, ...interior } = design;
    return { ...room, walls: { ...room.walls, [design.wall]: paint }, wallDesigns: [...designs, interior] };
  }
  return { ...room, wallDesigns: [...designs, design] };
}

/** Conservative rotated bounds keep wall-mounted objects clear of openings. */
export function wallItemBounds(item: WallItem) {
  const angle = item.rotation * Math.PI / 180;
  const w = Math.abs(Math.cos(angle)) * item.width + Math.abs(Math.sin(angle)) * item.height;
  const h = Math.abs(Math.sin(angle)) * item.width + Math.abs(Math.cos(angle)) * item.height;
  return { u: item.u + (item.width - w) / 2, v: item.v + (item.height - h) / 2, width: w, height: h };
}

export function wallItemContains(item: WallItem, point: { u: number; v: number }) {
  const angle = item.rotation * Math.PI / 180;
  const x = point.u - item.u - item.width / 2;
  const y = point.v - item.v - item.height / 2;
  return Math.abs(x * Math.cos(angle) + y * Math.sin(angle)) <= item.width / 2 &&
    Math.abs(-x * Math.sin(angle) + y * Math.cos(angle)) <= item.height / 2;
}

type SurfacePoint = { u: number; v: number };
type SurfaceRect = SurfacePoint & { width: number; height: number };

/** Subtract opening rectangles from a rotated paint patch without painting across the voids.
 * Each clipping step partitions a convex polygon into disjoint convex pieces. */
export function wallPaintPolygons(item: WallItem, openings: readonly SurfaceRect[]): SurfacePoint[][] {
  const angle = item.rotation * Math.PI / 180;
  const c = Math.cos(angle); const s = Math.sin(angle);
  let polygons = [[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => ({
    u: item.u + item.width / 2 + c * x * item.width / 2 - s * y * item.height / 2,
    v: item.v + item.height / 2 + s * x * item.width / 2 + c * y * item.height / 2,
  }))];
  const clip = (polygon: SurfacePoint[], axis: 'u' | 'v', value: number, sign: number) => {
    const result: SurfacePoint[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]; const b = polygon[(i + 1) % polygon.length];
      const da = (a[axis] - value) * sign; const db = (b[axis] - value) * sign;
      if (da >= 0) result.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
        const t = da / (da - db);
        result.push({ u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t });
      }
    }
    return result;
  };
  for (const opening of openings) {
    const cuts: ['u' | 'v', number, number][] = [['u', opening.u, 1], ['u', opening.u + opening.width, -1],
      ['v', opening.v, 1], ['v', opening.v + opening.height, -1]];
    polygons = polygons.flatMap(polygon => {
      const pieces: SurfacePoint[][] = [];
      let inside = polygon;
      for (const [axis, value, sign] of cuts) {
        const outside = clip(inside, axis, value, -sign);
        if (outside.length >= 3) pieces.push(outside);
        inside = clip(inside, axis, value, sign);
        if (!inside.length) break;
      }
      return pieces;
    });
  }
  return polygons.filter(polygon => Math.abs(polygon.reduce((area, p, i) => {
    const q = polygon[(i + 1) % polygon.length]; return area + p.u * q.v - q.u * p.v;
  }, 0)) > 1e-10);
}

/** Resize from the upper-right corner with the opposite rotated corner fixed. */
export function resizeWallItem(item: WallItem, point: { u: number; v: number }): WallItem {
  const a = item.rotation * Math.PI / 180;
  const c = Math.cos(a); const s = Math.sin(a);
  const anchorU = item.u + item.width / 2 - c * item.width / 2 + s * item.height / 2;
  const anchorV = item.v + item.height / 2 - s * item.width / 2 - c * item.height / 2;
  const x = point.u - anchorU; const y = point.v - anchorV;
  const width = Math.max(0.02, x * c + y * s);
  const height = Math.max(0.02, -x * s + y * c);
  return { ...item, width, height, u: anchorU + (c * width - s * height) / 2 - width / 2,
    v: anchorV + (s * width + c * height) / 2 - height / 2 };
}

export function wallItemError(room: Room, wall: Wall, surface: WallSurface, item: WallItem): string | undefined {
  if (![item.u, item.v, item.width, item.height, item.rotation, item.depth].every(Number.isFinite) ||
    item.u < 0 || item.v < 0 || item.width < 0.02 || item.height < 0.02 || item.depth < 0 || item.depth > 0.6 || item.rotation < 0 || item.rotation > 360 ||
    !WALL_ITEM_KINDS.includes(item.kind) || !HEX_COLOR.test(item.color) || !FINISHES.includes(item.finish) ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(item.id) || !item.name.trim() || item.name.length > 80) return 'Enter a valid name, color and dimensions (at least 0.02 m).';
  const isolated = isolateWall(room, wall, surface);
  const bounds = wallItemBounds(item);
  if (bounds.u < -1e-8 || bounds.v < -1e-8 || bounds.u + bounds.width > isolated.frame.width + 1e-8 ||
    bounds.v + bounds.height > isolated.frame.height + 1e-8) return 'This item extends past the wall. Adjust its position, size or rotation.';
  if (item.kind !== 'Paint section' && isolated.apertures.some(opening => bounds.u < opening.u + opening.width - 1e-8 && bounds.u + bounds.width > opening.u + 1e-8 &&
    bounds.v < opening.v + opening.height - 1e-8 && bounds.v + bounds.height > opening.v + 1e-8)) {
    return 'This item overlaps a door or window. Move or resize it to keep the opening clear.';
  }
}

export function wallDesignsError(room: Room): string | undefined {
  const keys = new Set<string>();
  for (const design of room.wallDesigns ?? []) {
    const key = design.wall + '/' + design.surface;
    if (!roomWallIds(room.dimensions).includes(design.wall) || !WALL_SURFACES.includes(design.surface)) return 'A wall design references a missing wall or surface.';
    if (keys.has(key)) return 'Each wall surface can have only one design.';
    keys.add(key);
    if (design.paint && (!HEX_COLOR.test(design.paint.color) || !FINISHES.includes(design.paint.finish))) return 'Invalid surface paint.';
    if (design.items.length > MAX_WALL_ITEMS) return `A wall face can contain up to ${MAX_WALL_ITEMS} items.`;
    if (new Set(design.items.map(item => item.id)).size !== design.items.length) return 'Design item IDs must be unique.';
    for (const item of design.items) {
      const error = wallItemError(room, design.wall, design.surface, item);
      if (error) return `${item.name}: ${error}`;
    }
  }
}

export function placeWallItem(room: Room, wall: Wall, surface: WallSurface, kind: WallItemKind, id: string): WallItem | undefined {
  const { frame } = isolateWall(room, wall, surface);
  const preset = WALL_ITEM_PRESETS[kind];
  const scale = Math.min(1, frame.width / preset.width, frame.height / preset.height);
  const item: WallItem = { ...preset, width: preset.width * scale, height: preset.height * scale,
    id, name: kind, kind, rotation: 0, finish: 'Matte', u: 0, v: 0 };
  const positions = [{ u: (frame.width - item.width) / 2, v: (frame.height - item.height) / 2 }];
  for (let y = 0; y <= 16; y++) for (let x = 0; x <= 24; x++) positions.push({ u: x / 24 * (frame.width - item.width), v: y / 16 * (frame.height - item.height) });
  const candidates = positions.map(position => ({ ...item, ...position })).filter(value => !wallItemError(room, wall, surface, value));
  const occupied = getWallDesign(room, wall, surface).items.filter(value => value.kind !== 'Paint section').map(wallItemBounds);
  return candidates.find(value => kind === 'Paint section' || occupied.every(other =>
    value.u + value.width + 0.04 <= other.u || value.u >= other.u + other.width + 0.04 ||
    value.v + value.height + 0.04 <= other.v || value.v >= other.v + other.height + 0.04)) ?? candidates[0];
}

export function copyWallDesign(source: Room, sourceWall: Wall, sourceSurface: WallSurface, destination: Room,
  wall: Wall, surface: WallSurface, sizing: 'Actual size' | 'Scale to fit', mode: 'Replace' | 'Merge', newId: () => string): { room: Room } | { error: string } {
  if (source.id === destination.id && sourceWall === wall && sourceSurface === surface) return { error: 'Choose a different wall or surface.' };
  const design = getWallDesign(source, sourceWall, sourceSurface);
  const from = isolateWall(source, sourceWall, sourceSurface).frame;
  const to = isolateWall(destination, wall, surface).frame;
  const scale = sizing === 'Scale to fit' ? Math.min(to.width / from.width, to.height / from.height) : 1;
  const items = design.items.map(item => ({ ...item, id: newId(), u: item.u * scale, v: item.v * scale,
    width: item.width * scale, height: item.height * scale }));
  const existing = getWallDesign(destination, wall, surface);
  const next = setWallDesign(destination, { wall, surface, paint: { ...(design.paint ?? source.walls[sourceWall]) },
    items: mode === 'Merge' ? [...existing.items, ...items] : items });
  const error = wallDesignsError(next);
  return error ? { error: `Cannot copy: ${error}` } : { room: next };
}
