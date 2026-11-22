import {
  WALLS, fitCeilingDecor, fitFurniture, fitLight, fitOpening, furnitureFitsRoom, openingFits,
  type Dimensions, type Furniture, type FurnitureKind,
  type Opening, type OpeningKind, type Project, type Room, type Wall, type WallPaint,
} from '@studio/model';
import type { InteriorPlacement } from './interior-placement';

export const WALL_DEFAULT = '#EAE4D8';
export const PRESETS = [
  { name: 'Living room', length: 5.8, width: 4.4, height: 2.85 },
  { name: 'Bedroom', length: 4.2, width: 3.5, height: 2.65 },
  { name: 'Home office', length: 3.6, width: 3, height: 2.6 },
  { name: 'Custom room', length: 4, width: 3.5, height: 2.6 },
];

export function newRoom(id: string, name: string, dimensions: Dimensions): Room {
  return {
    id, name, dimensions,
    walls: Object.fromEntries(WALLS.map(wall => [wall, { color: WALL_DEFAULT, finish: 'Matte' }])) as WallPaint,
    daylight: 'Afternoon', openings: [], furniture: [], lights: [], options: [],
  };
}

export function starterProject(): Project {
  const { name, ...dimensions } = PRESETS[0];
  const room = newRoom('living-room', name, dimensions);
  room.walls.north.color = '#A4AB94';
  room.walls.west.color = '#F0E9DC';
  room.options.push({ id: "linen-paint", name: "Linen White", walls: { ...room.walls, north: { ...room.walls.north, color: "#F0E9DC" } } });
  room.openings.push(
    { id: 'picture-window', kind: 'Window', wall: 'west', offset: -0.6, sill: 0.72, width: 2.25, height: 1.6 },
    { id: 'entry-door', kind: 'Door', wall: 'east', offset: 1.13, sill: 0, width: 0.87, height: 2.1 },
  );
  room.furniture.push(
    { id: 'sofa', kind: 'Sofa', x: -0.12, z: -1.52, rotation: 0 },
    { id: 'artwork', kind: 'Wall art', x: -0.13, z: -2.14, rotation: 0 },
    { id: 'rug', kind: 'Rug', x: 0.02, z: -0.02, rotation: 0 },
    { id: 'table', kind: 'Coffee table', x: 0.1, z: -0.02, rotation: 0 },
    { id: 'armchair', kind: 'Armchair', x: 1.82, z: 0.63, rotation: 228 },
    { id: 'floor-plant', kind: 'Plant', x: -2.24, z: -1.54, rotation: 0 },
    { id: 'console', kind: 'Sideboard', x: -2.52, z: 0.81, rotation: 90 },
  );
  return { name: 'My home', rooms: [room] };
}

export function resizeRoom(room: Room, name: string, dimensions: Dimensions): Room | undefined {
  const updated = { ...room, name, dimensions, openings: room.openings.map(opening => fitOpening(dimensions, opening)) };
  if (!updated.openings.every(opening => openingFits(updated, opening))) return;
  const furniture = room.furniture.map(item => fitFurniture(dimensions, item));
  if (furniture.some(item => !furnitureFitsRoom(dimensions, item))) return;
  return { ...updated, furniture, lights: room.lights.map(light => fitLight(dimensions, light)),
    ceilingDecor: room.ceilingDecor?.map(item => fitCeilingDecor(dimensions, item)) };
}

export function addOpening(room: Room, kind: OpeningKind, wall: Wall): Opening | undefined {
  const base = { id: crypto.randomUUID(), kind, wall, width: kind === 'Door' ? 0.9 : 1.2,
    height: kind === 'Door' ? 2.05 : 1.1, sill: kind === 'Door' ? 0 : 0.85 };
  const offsets = [0, -0.55, 0.55, -1.1, 1.1, -1.65, 1.65, -2.2, 2.2, -3, 3, -4, 4, -6, 6, -8, 8];
  return offsets.map(offset => fitOpening(room.dimensions, { ...base, offset }))
    .find(opening => openingFits(room, opening));
}

export function addFurniture(room: Room, kind: FurnitureKind, placement?: InteriorPlacement): Furniture | undefined {
  const positions = [[0, 0], [1, 1], [-1, 1], [1, -1], [-1, -1], [0, 1.5], [1.8, 0], [-1.8, 0]];
  const id = crypto.randomUUID();
  const seed = fitFurniture(room.dimensions, { id, kind, x: 0, z: 0, rotation: 0 });
  if (!furnitureFitsRoom(room.dimensions, seed)) return;
  if (placement) return fitFurniture(room.dimensions, { ...seed, ...placement });
  const candidates = positions.map(([x, z]) => fitFurniture(room.dimensions, { ...seed, x, z }));
  return candidates.find(item => room.furniture.every(other => Math.hypot(item.x - other.x, item.z - other.z) > 0.65)) ?? candidates[0];
}
