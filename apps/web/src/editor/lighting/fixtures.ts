import { FIXTURE_MOUNTS, fitLight, isWallMount, type Light, type LightKind, type LightMount, type Room, type Wall } from '@studio/model';

export const FIXTURE_DRAG_TYPE = 'application/x-room-paint-fixture';

export type LightPlacement = Pick<Light, 'x' | 'y' | 'z'> & { mount: LightMount };

const defaultLumens: Record<LightKind, number> = {
  Bulb: 800,
  'Floor lamp': 650,
  'Wall sconce': 350,
  'Ceiling light': 950,
  Spotlight: 420,
  'LED strip': 720,
  Chandelier: 1600,
  'Pendant light': 800,
  'Fairy lights': 230,
};

export function newFixture(room: Room, kind: LightKind, wall: Wall, placement?: LightPlacement): Light {
  const available = FIXTURE_MOUNTS[kind];
  const mount = placement?.mount ?? (kind === 'Wall sconce' ? wall : available[0]);
  const { height } = room.dimensions;
  const position = placement ?? {
    x: Math.sin(room.lights.length) * 0.85,
    y: isWallMount(mount) ? height * 0.7 : height - 0.2,
    z: 0.15,
  };
  return fitLight(room.dimensions, {
    id: crypto.randomUUID(), kind, mount,
    x: position.x, y: position.y, z: position.z,
    brightness: 60, lumens: defaultLumens[kind], warmth: 3300, direction: 0,
    tilt: isWallMount(mount) ? 55 : kind === 'Spotlight' ? 20 : 0,
  });
}
