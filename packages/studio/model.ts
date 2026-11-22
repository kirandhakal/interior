import { INTERIOR_CATALOG, type FurnitureKind } from './interior';
import { CEILING_CATALOG, type CeilingDecor, type CeilingFinish } from './ceiling';
export { DEFAULT_DISPLAY, FURNITURE, FURNITURE_SCALE, INTERIOR_CATALOG, INTERIOR_CATEGORIES, getDisplay, hasDisplay, type FurnitureKind } from './interior';
export * from './ceiling';

export const WALLS = ['north', 'east', 'south', 'west'] as const;
export const FINISHES = ['Matte', 'Eggshell', 'Satin'] as const;
export const DAYLIGHTS = ['Morning', 'Afternoon', 'Evening', 'Night'] as const;
export const OPENINGS = ['Door', 'Window'] as const;
export const CEILING_LIGHTS = ['Chandelier', 'Pendant light', 'Fairy lights'] as const;
export const LIGHTS = ['Bulb', 'Floor lamp', 'Wall sconce', 'Ceiling light', 'Spotlight', 'LED strip', ...CEILING_LIGHTS] as const;
export const LIGHT_MOUNTS = ['Ceiling', 'Floor', 'Free', ...WALLS] as const;
export const MAX_LIGHT_LUMENS = 20000;

export type Wall = typeof WALLS[number];
export type Finish = typeof FINISHES[number];
export type Daylight = typeof DAYLIGHTS[number];
export type OpeningKind = typeof OPENINGS[number];
export type LightKind = typeof LIGHTS[number];
export type LightMount = typeof LIGHT_MOUNTS[number];
export type Dimensions = { length: number; width: number; height: number };
export type Paint = { color: string; finish: Finish };
export type WallPaint = Record<Wall, Paint>;
export type Opening = { id: string; kind: OpeningKind; wall: Wall; offset: number; sill: number; width: number; height: number };
export type DisplaySettings = { enabled: boolean; brightness: number; color: string; count: number };
export type Furniture = {
  id: string; kind: FurnitureKind; x: number; z: number; rotation: number;
  scale?: number; color?: string; display?: DisplaySettings;
};
export type Light = {
  id: string; kind: LightKind; x: number; y: number; z: number;
  brightness: number; warmth: number; direction: number; tilt: number;
  mount?: LightMount; lumens?: number; enabled?: boolean;
};
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
  ceilingFinish?: CeilingFinish;
  ceilingDecor?: CeilingDecor[];
};
export type Project = { name: string; rooms: Room[] };
export type SavedProject = Project & { id: string; version: number; updatedAt: string };
export type ProjectSummary = Omit<SavedProject, 'rooms'> & { roomCount: number };
export type Account = { email: string };

export const WALL_LABELS: Record<Wall, string> = {
  north: 'North wall', east: 'East wall', south: 'South wall', west: 'West wall',
};
export const LIGHT_MOUNT_LABELS: Record<LightMount, string> = {
  ...WALL_LABELS, Ceiling: 'Ceiling', Floor: 'Floor', Free: 'Freestanding position',
};
export const FIXTURE_MOUNTS: Record<LightKind, readonly LightMount[]> = {
  Bulb: ['Ceiling', ...WALLS, 'Free'],
  'Floor lamp': ['Floor'],
  'Wall sconce': WALLS,
  'Ceiling light': ['Ceiling', 'Free'],
  Spotlight: ['Ceiling', ...WALLS, 'Free'],
  'LED strip': ['Ceiling', ...WALLS],
  Chandelier: ['Ceiling'],
  'Pendant light': ['Ceiling'],
  'Fairy lights': ['Ceiling'],
};
export const isWallMount = (mount: LightMount | undefined): mount is Wall =>
  mount === 'north' || mount === 'east' || mount === 'south' || mount === 'west';
export const isPointFixture = (kind: LightKind) => kind === 'Bulb' || kind === 'Floor lamp' || kind === 'Chandelier' || kind === 'Fairy lights';
export const lightLumens = (light: Light) => light.lumens ?? Math.round(light.brightness * 0.39 * Math.PI);
export const DIMENSION_BOUNDS = { length: [1.2, 18], width: [1.2, 18], height: [2, 6] } as const;
export const LIMITS = { rooms: 30, openings: 18, furniture: 60, lights: 8, ceilingDecor: 24, options: 12, name: 80 };
export const HEX_COLOR = /^#[\da-f]{6}$/i;
export const wallSpan = (dimensions: Dimensions, wall: Wall) =>
  wall === 'north' || wall === 'south' ? dimensions.length : dimensions.width;
export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const round = (value: number) => Math.round(value * 1000) / 1000;

export function ceilingDecorBounds(dimensions: Dimensions, item: CeilingDecor) {
  const [width, depth] = CEILING_CATALOG[item.kind].size;
  const angle = item.rotation * Math.PI / 180;
  const sin = Math.abs(Math.sin(angle));
  const cos = Math.abs(Math.cos(angle));
  const length = width * cos + depth * sin;
  const span = width * sin + depth * cos;
  const scale = Math.min(item.scale, (dimensions.length - 0.04) / length, (dimensions.width - 0.04) / span);
  return { scale, x: (dimensions.length - length * scale) / 2, z: (dimensions.width - span * scale) / 2 };
}

export function fitCeilingDecor(dimensions: Dimensions, item: CeilingDecor): CeilingDecor {
  const { x, z } = ceilingDecorBounds(dimensions, item);
  return { ...item, x: round(clamp(item.x, -x, x)), z: round(clamp(item.z, -z, z)) };
}

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
  const [width, depth, height] = INTERIOR_CATALOG[item.kind].size;
  const scale = item.scale ?? 1;
  const angle = item.rotation * Math.PI / 180;
  const sin = Math.abs(Math.sin(angle));
  const cos = Math.abs(Math.cos(angle));
  return { length: (width * cos + depth * sin) * scale, width: (width * sin + depth * cos) * scale, height: height * scale };
}

export function furnitureFitsRoom(dimensions: Dimensions, item: Furniture) {
  const footprint = furnitureFootprint(item);
  return footprint.length <= dimensions.length + 0.002 && footprint.width <= dimensions.width + 0.002 &&
    (item.kind === 'Wall art' || footprint.height <= dimensions.height + 0.002);
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
  const mount = light.mount ?? 'Free';
  const margin = mount === 'Floor' ? 0.24 : light.kind === 'Fairy lights' ? 0.58
    : light.kind === 'Chandelier' || light.kind === 'LED strip' ? 0.44 : light.kind === 'Pendant light' ? 0.28 : 0.12;
  const halfLength = dimensions.length / 2;
  const halfWidth = dimensions.width / 2;
  let x = round(clamp(light.x, -halfLength + margin, halfLength - margin));
  let z = round(clamp(light.z, -halfWidth + margin, halfWidth - margin));
  let y = round(clamp(light.y, 0.25, dimensions.height - 0.1));
  switch (mount) {
    case 'north': z = -halfWidth; break;
    case 'south': z = halfWidth; break;
    case 'east': x = halfLength; break;
    case 'west': x = -halfLength; break;
    case 'Ceiling': y = dimensions.height; break;
    case 'Floor': y = 0; break;
    case 'Free':
      // Preserve the placement rules for projects saved before fixtures had mounts.
      x = round(clamp(light.x, -halfLength + 0.1, halfLength - 0.1));
      z = round(clamp(light.z, -halfWidth + 0.1, halfWidth - 0.1));
      break;
  }
  return { ...light, x, y, z };
}
