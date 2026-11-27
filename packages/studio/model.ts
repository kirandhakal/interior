import { INTERIOR_CATALOG, type FurnitureKind } from './interior';
import type { WallDesign } from './wall-design';
import { CEILING_CATALOG, type CeilingDecor, type CeilingFinish } from './ceiling';
import {
  WALLS, OPENING_EDGE_CLEARANCE, OPENING_GAP, PLACEMENT_TOLERANCE, findPlanPosition, isWallId, placementPoint, pointAlongWall,
  roomPlan, roomWallIds, wallOffset, wallSpan, type Dimensions, type PlanPoint, type PlanWall, type Wall,
} from './dimensions';
import { polygonContainsFootprint } from './polygon';
export { DEFAULT_DISPLAY, FURNITURE, FURNITURE_SCALE, INTERIOR_CATALOG, INTERIOR_CATEGORIES, getDisplay, hasCabinetDoors, hasDisplay, type FurnitureKind } from './interior';
export * from './ceiling';
export * from './dimensions';

export const FINISHES = ['Matte', 'Eggshell', 'Satin', 'Gloss'] as const;
export const DAYLIGHTS = ['Morning', 'Afternoon', 'Evening', 'Night'] as const;
export const OPENINGS = ['Door', 'Window', 'Passage'] as const;
export const CEILING_LIGHTS = ['Chandelier', 'Pendant light', 'Fairy lights'] as const;
export const LIGHTS = ['Bulb', 'Floor lamp', 'Wall sconce', 'Ceiling light', 'Spotlight', 'LED strip', ...CEILING_LIGHTS] as const;
export const LIGHT_MOUNTS = ['Ceiling', 'Floor', 'Free', ...WALLS] as const;
export const MAX_LIGHT_LUMENS = 20000;

export type Finish = typeof FINISHES[number];
export type Daylight = typeof DAYLIGHTS[number];
export type OpeningKind = typeof OPENINGS[number];
export type LightKind = typeof LIGHTS[number];
export type LightMount = typeof LIGHT_MOUNTS[number] | Wall;
export type Paint = { color: string; finish: Finish };
export type WallPaint = Record<string, Paint>;
export const HINGE_SIDES = ['Left', 'Right'] as const;
export const CURTAIN_LENGTHS = ['Sill', 'Floor'] as const;
export type Curtains = { color: string; drawn: number; length: typeof CURTAIN_LENGTHS[number] };
export type Opening = {
  id: string; kind: OpeningKind; wall: Wall; offset: number; sill: number; width: number; height: number;
  connectionId?: string;
  openAngle?: number; hinge?: typeof HINGE_SIDES[number]; curtains?: Curtains;
};
export type DisplaySettings = { enabled: boolean; brightness: number; color: string; count: number };
export type Furniture = {
  id: string; kind: FurnitureKind; x: number; z: number; rotation: number;
  scale?: number; color?: string; display?: DisplaySettings; doorAngle?: number;
};
export type Light = {
  id: string; kind: LightKind; x: number; y: number; z: number;
  brightness: number; warmth: number; direction: number; tilt: number;
  mount?: LightMount; lumens?: number; enabled?: boolean;
};
export type PaintOption = { id: string; name: string; walls: WallPaint };
export const SPACE_TYPES = ['Room', 'Corridor', 'Passage', 'Balcony', 'Stairs', 'Bathroom', 'Open space'] as const;
export type SpaceType = typeof SPACE_TYPES[number];
export type Room = {
  spaceType?: SpaceType;
  floorColor?: string;
  floorMaterial?: 'Wood' | 'Tile' | 'Concrete';
  id: string;
  name: string;
  visible?: boolean;
  placement?: { x: number; z: number; rotation: number };
  dimensions: Dimensions;
  walls: WallPaint;
  daylight: Daylight;
  openings: Opening[];
  furniture: Furniture[];
  lights: Light[];
  options: PaintOption[];
  ceilingFinish?: CeilingFinish;
  ceilingDecor?: CeilingDecor[];
  wallDesigns?: WallDesign[];
};
export type Project = { name: string; rooms: Room[] };
export type SavedProject = Project & { id: string; version: number; updatedAt: string };
export type ProjectSummary = Omit<SavedProject, 'rooms'> & { roomCount: number };
export type Account = { email: string };

export const WALL_LABELS: Record<string, string> = {
  north: 'North wall', east: 'East wall', south: 'South wall', west: 'West wall',
};
export const LIGHT_MOUNT_LABELS: Record<string, string> = {
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
export const isWallMount = isWallId;
export const wallLabel = (dimensions: Dimensions, wall: Wall) => dimensions.outline
  ? `Wall ${roomWallIds(dimensions).indexOf(wall) + 1}` : WALL_LABELS[wall];
export const lightMountLabel = (dimensions: Dimensions, mount: LightMount) => isWallMount(mount)
  ? wallLabel(dimensions, mount) : LIGHT_MOUNT_LABELS[mount];

export function fixtureMounts(kind: LightKind, dimensions: Dimensions): readonly LightMount[] {
  const mounts = FIXTURE_MOUNTS[kind];
  if (!dimensions.outline) return mounts;
  const firstWall = mounts.findIndex(isWallMount);
  if (firstWall === -1) return mounts;
  return [...mounts.slice(0, firstWall), ...roomWallIds(dimensions), ...mounts.slice(firstWall).filter(mount => !isWallMount(mount))];
}
export const isPointFixture = (kind: LightKind) => kind === 'Bulb' || kind === 'Floor lamp' || kind === 'Chandelier' || kind === 'Fairy lights';
export const lightLumens = (light: Light) => light.lumens ?? Math.round(light.brightness * 0.39 * Math.PI);
export const LIMITS = { rooms: 30, openings: 18, furniture: 60, lights: 8, ceilingDecor: 24, options: 12, name: 80 };
export const HEX_COLOR = /^#[\da-f]{6}$/i;
export const WALL_DEFAULT = '#EAE4D8';
export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function footprintClearance(width: number, depth: number, rotation: number, scale: number, margin = 0) {
  const angle = rotation * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return ({ normal }: PlanWall) => scale / 2 * (
    width * Math.abs(normal.x * cos - normal.z * sin) + depth * Math.abs(normal.x * sin + normal.z * cos)
  ) + margin;
}

function footprintPosition(dimensions: Dimensions, point: PlanPoint, width: number, depth: number, rotation: number, scale: number, margin = 0) {
  if (!dimensions.outline) return placementPoint(dimensions, point, footprintClearance(width, depth, rotation, scale, margin));
  const outline = dimensions.outline;
  const radians = rotation * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const x = width * scale / 2 + margin;
  const z = depth * scale / 2 + margin;
  const corners = [[-x, -z], [x, -z], [x, z], [-x, z]].map(([x, z]) => ({ x: x * cos + z * sin, z: z * cos - x * sin }));
  return findPlanPosition(outline, point, center => polygonContainsFootprint(outline, corners.map(point => ({ x: point.x + center.x, z: point.z + center.z }))));
}

export function ceilingDecorScale(dimensions: Dimensions, item: CeilingDecor) {
  const [width, depth] = CEILING_CATALOG[item.kind].size;
  const center = roomPlan(dimensions).center;
  const fits = (scale: number) => footprintPosition(dimensions, center, width, depth, item.rotation, scale, 0.02);
  if (fits(item.scale)) return item.scale;
  let low = 0;
  let high = item.scale;
  for (let i = 0; i < (dimensions.outline ? 14 : 32); i++) {
    const middle = (low + high) / 2;
    if (fits(middle)) low = middle;
    else high = middle;
  }
  return low;
}

export function fitCeilingDecor(dimensions: Dimensions, item: CeilingDecor): CeilingDecor {
  const [width, depth] = CEILING_CATALOG[item.kind].size;
  const scale = ceilingDecorScale(dimensions, item);
  const point = footprintPosition(dimensions, item, width, depth, item.rotation, scale, 0.02);
  return point && point !== item ? { ...item, ...point } : item;
}

export function openingFits(room: Room, opening: Opening) {
  const edge = wallSpan(room.dimensions, opening.wall) / 2 - OPENING_EDGE_CLEARANCE;
  if (opening.width < 0.4 || Math.abs(opening.offset) + opening.width / 2 > edge + PLACEMENT_TOLERANCE ||
      opening.sill + opening.height > room.dimensions.height - OPENING_EDGE_CLEARANCE + PLACEMENT_TOLERANCE ||
      (opening.kind !== 'Window' && opening.sill !== 0)) return false;
  return room.openings.every(other => other.id === opening.id || other.wall !== opening.wall ||
    Math.abs(other.offset - opening.offset) >= (other.width + opening.width) / 2 + OPENING_GAP - PLACEMENT_TOLERANCE ||
    !openingsShareHeight(opening, other));
}

export const openingsShareHeight = (first: Opening, second: Opening) =>
  first.sill + first.height + OPENING_GAP - PLACEMENT_TOLERANCE > second.sill &&
  second.sill + second.height + OPENING_GAP - PLACEMENT_TOLERANCE > first.sill;

export function fitOpening(dimensions: Dimensions, opening: Opening): Opening {
  const span = wallSpan(dimensions, opening.wall);
  const width = clamp(opening.width, 0.4, span - 2 * OPENING_EDGE_CLEARANCE);
  const height = clamp(opening.height, 0.4, dimensions.height - OPENING_EDGE_CLEARANCE);
  const offsetLimit = (span - width) / 2 - OPENING_EDGE_CLEARANCE;
  const sill = opening.kind !== 'Window' ? 0 : clamp(opening.sill, 0, dimensions.height - height - OPENING_EDGE_CLEARANCE);
  return { ...opening, width, height, offset: clamp(opening.offset, -offsetLimit, offsetLimit), sill };
}

function furniturePosition(dimensions: Dimensions, item: Furniture): PlanPoint | undefined {
  const [width, depth, height] = INTERIOR_CATALOG[item.kind].size;
  const scale = item.scale ?? 1;
  if (item.kind !== 'Wall art' && scale * height > dimensions.height + PLACEMENT_TOLERANCE) return;
  return footprintPosition(dimensions, item, width, depth, item.rotation, scale);
}

export function furnitureFitsRoom(dimensions: Dimensions, item: Furniture) {
  return furniturePosition(dimensions, item) !== undefined;
}

export function furniturePlacementFits(dimensions: Dimensions, item: Furniture) {
  const position = furniturePosition(dimensions, item);
  if (position && Math.hypot(position.x - item.x, position.z - item.z) <= PLACEMENT_TOLERANCE) return true;
  const [width, depth, height] = INTERIOR_CATALOG[item.kind].size;
  const scale = item.scale ?? 1;
  if (item.kind !== 'Wall art' && scale * height > dimensions.height + PLACEMENT_TOLERANCE) return false;
  return footprintPosition(dimensions, item, width, depth, item.rotation, scale, -PLACEMENT_TOLERANCE) === item;
}

export function fitFurniture(dimensions: Dimensions, item: Furniture): Furniture {
  for (const rotation of [item.rotation, 0, 90]) {
    const rotated = rotation === item.rotation ? item : { ...item, rotation };
    const position = furniturePosition(dimensions, rotated);
    if (position) return position === rotated ? rotated : { ...rotated, ...position };
  }
  return item;
}

export function fitLight(dimensions: Dimensions, light: Light): Light {
  const mount = light.mount ?? 'Free';
  const margin = mount === 'Floor' ? 0.24 : light.kind === 'Fairy lights' ? 0.58
    : light.kind === 'Chandelier' || light.kind === 'LED strip' ? 0.44 : light.kind === 'Pendant light' ? 0.28 : mount === 'Free' ? 0.1 : 0.12;
  const y = mount === 'Ceiling' ? dimensions.height : mount === 'Floor' ? 0 : clamp(light.y, 0.25, dimensions.height - 0.1);
  if (isWallMount(mount) && roomPlan(dimensions).walls[mount]) {
    const wall = roomPlan(dimensions).walls[mount];
    const limit = Math.max(0, wall.span / 2 - margin);
    const point = pointAlongWall(wall, clamp(wallOffset(wall, light), -limit, limit));
    return { ...light, ...point, y };
  }
  const point = placementPoint(dimensions, light, () => margin) ?? placementPoint(dimensions, light, () => 0) ?? roomPlan(dimensions).center;
  return { ...light, x: point.x, z: point.z, y };
}
