import { Plane, Vector3, type Ray } from 'three';
import { FIXTURE_MOUNTS, isWallMount, type Dimensions, type LightKind, type Wall } from '@studio/model';
import type { LightPlacement } from '../lighting/fixtures';

const up = new Vector3(0, 1, 0);

export function fixturePlacement(ray: Ray, dimensions: Dimensions, kind: LightKind, surface?: { wall: Wall; point: Vector3 }): LightPlacement | undefined {
  if (surface && FIXTURE_MOUNTS[kind].includes(surface.wall)) {
    const { point, wall } = surface;
    return { x: point.x, y: point.y, z: point.z, mount: wall };
  }

  const mount = FIXTURE_MOUNTS[kind][0];
  if (isWallMount(mount)) return;
  const y = mount === 'Floor' ? 0 : dimensions.height;
  const point = new Vector3();
  const plane = new Plane(up, -y);
  function hitsRoom() {
    return ray.intersectPlane(plane, point) && Math.abs(point.x) <= dimensions.length / 2 && Math.abs(point.z) <= dimensions.width / 2;
  }
  if (!hitsRoom()) {
    if (mount !== 'Ceiling') return;
    // A cutaway room also lets the user pick a ceiling location above a point on the floor.
    plane.constant = 0;
    if (!hitsRoom()) return;
  }
  return { x: point.x, y, z: point.z, mount };
}
