export const WALLS = ['north', 'east', 'south', 'west'] as const;
export const FINISHES = ['Matte', 'Eggshell', 'Satin'] as const;
export const DAYLIGHTS = ['Morning', 'Afternoon', 'Evening', 'Night'] as const;
export const FURNITURE = ['Sofa', 'Armchair', 'Coffee table', 'Rug', 'Plant', 'Sideboard', 'Wall art'] as const;
export const OPENINGS = ['Door', 'Window'] as const;
export const LIGHTS = ['Ceiling light', 'Spotlight'] as const;

export type Wall = typeof WALLS[number];
export type Finish = typeof FINISHES[number];
export type Daylight = typeof DAYLIGHTS[number];
export type FurnitureKind = typeof FURNITURE[number];
export type OpeningKind = typeof OPENINGS[number];
export type LightKind = typeof LIGHTS[number];
export type Dimensions = { length: number; width: number; height: number };
export type Paint = { color: string; finish: Finish };
export type WallPaint = Record<Wall, Paint>;
export type Opening = { id: string; kind: OpeningKind; wall: Wall; offset: number; sill: number; width: number; height: number };
export type Furniture = { id: string; kind: FurnitureKind; x: number; z: number; rotation: number };
export type Light = { id: string; kind: LightKind; x: number; y: number; z: number; brightness: number; warmth: number; direction: number; tilt: number };
export type PaintOption = { id: string; name: string; walls: WallPaint };
export type Room = {
  id: string;
  name: string;
  dimensions: Dimensions;
  walls: WallPaint;
  daylight: Daylight;
  openings: Opening[];
  furniture: Furniture[];
  lights: Light[];
  options: PaintOption[];
};
export type Project = { name: string; rooms: Room[] };
export type SavedProject = Project & { id: string; version: number; updatedAt: string };
export type ProjectSummary = Omit<SavedProject, 'rooms'> & { roomCount: number };
export type Account = { email: string };

export const WALL_LABELS: Record<Wall, string> = {
  north: 'North wall', east: 'East wall', south: 'South wall', west: 'West wall',
};
export const FURNITURE_SIZE: Record<FurnitureKind, [number, number]> = {
  Sofa: [2.42, 0.99], Armchair: [0.92, 0.94], 'Coffee table': [1.24, 0.81],
  Rug: [2.75, 2.01], Plant: [0.62, 0.62], Sideboard: [1.38, 0.55], 'Wall art': [1.25, 0.06],
};
export const DIMENSION_BOUNDS = { length: [1.2, 18], width: [1.2, 18], height: [2, 6] } as const;
export const LIMITS = { rooms: 30, openings: 18, furniture: 30, lights: 8, options: 12, name: 80 };
export const HEX_COLOR = /^#[\da-f]{6}$/i;
export const wallSpan = (dimensions: Dimensions, wall: Wall) =>
  wall === 'north' || wall === 'south' ? dimensions.length : dimensions.width;
export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const round = (value: number) => Math.round(value * 1000) / 1000;

export function openingFits(room: Room, opening: Opening) {
  const edge = wallSpan(room.dimensions, opening.wall) / 2 - 0.08;
  if (Math.abs(opening.offset) + opening.width / 2 > edge + 0.002 ||
      opening.sill + opening.height > room.dimensions.height - 0.08 + 0.002 ||
      (opening.kind === 'Door' && opening.sill !== 0)) return false;
  return room.openings.every(other => other.id === opening.id || other.wall !== opening.wall ||
    Math.abs(other.offset - opening.offset) >= (other.width + opening.width) / 2 + 0.04 - 0.002 ||
    opening.sill + opening.height + 0.04 - 0.002 <= other.sill ||
    other.sill + other.height + 0.04 - 0.002 <= opening.sill);
}

export function fitOpening(dimensions: Dimensions, opening: Opening): Opening {
  const span = wallSpan(dimensions, opening.wall);
  const width = clamp(opening.width, 0.4, span - 0.16);
  const height = clamp(opening.height, 0.4, dimensions.height - 0.08);
  const offsetLimit = (span - width) / 2 - 0.08;
  const sill = opening.kind === 'Door' ? 0 : clamp(opening.sill, 0, dimensions.height - height - 0.08);
  return { ...opening, width, height, offset: round(clamp(opening.offset, -offsetLimit, offsetLimit)), sill: round(sill) };
}

function furnitureFootprint(item: Furniture) {
  const [width, depth] = FURNITURE_SIZE[item.kind];
  const angle = item.rotation * Math.PI / 180;
  const sin = Math.abs(Math.sin(angle));
  const cos = Math.abs(Math.cos(angle));
  return { length: width * cos + depth * sin, width: width * sin + depth * cos };
}

export function furnitureFitsRoom(dimensions: Dimensions, item: Furniture) {
  const footprint = furnitureFootprint(item);
  return footprint.length <= dimensions.length + 0.002 && footprint.width <= dimensions.width + 0.002;
}

export function furnitureBounds(dimensions: Dimensions, item: Furniture) {
  const footprint = furnitureFootprint(item);
  return { x: Math.max(0, (dimensions.length - footprint.length) / 2), z: Math.max(0, (dimensions.width - footprint.width) / 2) };
}

export function fitFurniture(dimensions: Dimensions, item: Furniture): Furniture {
  const lengthwise = { ...item, rotation: 0 };
  const fitted = furnitureFitsRoom(dimensions, item) ? item
    : furnitureFitsRoom(dimensions, lengthwise) ? lengthwise : { ...item, rotation: 90 };
  const { x, z } = furnitureBounds(dimensions, fitted);
  return { ...fitted, x: round(clamp(item.x, -x, x)), z: round(clamp(item.z, -z, z)) };
}

export function fitLight(dimensions: Dimensions, light: Light): Light {
  return {
    ...light,
    x: round(clamp(light.x, -dimensions.length / 2 + 0.1, dimensions.length / 2 - 0.1)),
    z: round(clamp(light.z, -dimensions.width / 2 + 0.1, dimensions.width / 2 - 0.1)),
    y: round(clamp(light.y, 0.25, dimensions.height - 0.1)),
  };
}
