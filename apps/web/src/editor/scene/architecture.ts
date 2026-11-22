import {
  BoxGeometry, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial, PlaneGeometry, Vector3,
} from 'three';
import { WALLS, wallSpan, type Dimensions, type Opening, type Room, type Wall } from '@studio/model';
import type { SceneAssets } from './furniture';
import { box } from './primitives';
import { floorTexture } from './textures';

export const WALL_THICKNESS = 0.16;
export const wallNormals: Record<Wall, Vector3> = {
  north: new Vector3(0, 0, -1), east: new Vector3(1, 0, 0),
  south: new Vector3(0, 0, 1), west: new Vector3(-1, 0, 0),
};
const wallAngles: Record<Wall, number> = { north: 0, east: -Math.PI / 2, south: Math.PI, west: Math.PI / 2 };
export const roughness = { Matte: 0.98, Eggshell: 0.65, Satin: 0.33 };

export function disposeGeometry(group: Group) {
  group.traverse(object => {
    if (object instanceof Mesh || object instanceof LineSegments) object.geometry.dispose();
  });
}

export function createFloor(dimensions: Dimensions, assets: SceneAssets) {
  const { length, width } = dimensions;
  const group = new Group();
  box(group, assets.base, length + WALL_THICKNESS, 0.22, width + WALL_THICKNESS, 0, -0.12, 0, 0.025);
  box(group, assets.edge, length + WALL_THICKNESS + 0.028, 0.039, width + WALL_THICKNESS + 0.028, 0, -0.224, 0, 0.016);
  const map = floorTexture(length, width);
  const material = new MeshStandardMaterial({ map, roughness: 0.83 });
  const floor = new Mesh(new PlaneGeometry(length + WALL_THICKNESS, width + WALL_THICKNESS), material);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  return { group, dispose: () => { disposeGeometry(group); map.dispose(); material.dispose(); } };
}

export function createCeiling({ length, width, height }: Dimensions) {
  const group = new Group();
  const plaster = new MeshStandardMaterial({ color: '#eee9df', roughness: 0.96 });
  const edge = new MeshStandardMaterial({ color: '#ddd5c7', roughness: 0.92 });
  const thickness = 0.095;
  const slab = box(group, plaster, length + WALL_THICKNESS * 2, thickness, width + WALL_THICKNESS * 2,
    0, height + thickness / 2, 0);
  slab.castShadow = false;

  // Retain the wall-side section of the slab when the rest is cut away.
  const rim = new Map<Wall, Mesh>();
  for (const wall of WALLS) {
    const normal = wallNormals[wall];
    const northSouth = normal.z !== 0;
    const strip = 0.34;
    const mesh = box(group, edge, northSouth ? length + WALL_THICKNESS * 2 : strip, thickness,
      northSouth ? strip : width, normal.x * (length / 2 + WALL_THICKNESS - strip / 2),
      height + thickness / 2, normal.z * (width / 2 + WALL_THICKNESS - strip / 2));
    mesh.castShadow = false;
    rim.set(wall, mesh);
  }
  return { group, slab, rim, dispose: () => { disposeGeometry(group); plaster.dispose(); edge.dispose(); } };
}

function createOpening(opening: Opening, a: SceneAssets) {
  const { width, height, offset, sill } = opening;
  const group = new Group();
  group.position.set(offset, sill, 0);
  group.userData.hit = { type: 'opening', id: opening.id };
  const rail = 0.045;
  for (const x of [-width / 2, width / 2]) box(group, a.trim, rail, height + rail, 0.245, x, height / 2, 0.005);
  box(group, a.trim, width + rail, rail, 0.245, 0, height, 0.005);
  if (opening.kind === 'Window') {
    box(group, a.trim, width + 0.10, 0.062, 0.28, 0, 0, 0.031);
    const pane = new Mesh(new PlaneGeometry(width - 0.03, height - 0.035), a.glass);
    pane.position.set(0, height / 2, -0.09);
    group.add(pane);
    box(group, a.trim, 0.042, height, 0.105, 0, height / 2, 0.009);
    box(group, a.trim, width, 0.038, 0.105, 0, height * 0.64, 0.009);
  } else {
    const slab = box(group, a.wood, width - 0.055, height - 0.045, 0.05, 0, height / 2, 0.018);
    slab.castShadow = true;
    for (const y of [height * 0.28, height * 0.73]) {
      box(group, a.walnut, width - 0.20, height * 0.34, 0.015, 0, y, 0.042, 0.008);
      box(group, a.wood, width - 0.23, height * 0.32, 0.019, 0, y, 0.044, 0.006);
    }
    box(group, a.black, 0.104, 0.027, 0.069, width / 2 - 0.12, height * 0.47, 0.07, 0.008);
  }
  return group;
}

export function createWall(room: Room, wall: Wall, openings: Opening[], a: SceneAssets) {
  const { length, width, height } = room.dimensions;
  const span = wallSpan(room.dimensions, wall);
  const half = span / 2;
  const group = new Group();
  const normal = wallNormals[wall];
  group.position.set(normal.x * (length + WALL_THICKNESS) / 2, 0, normal.z * (width + WALL_THICKNESS) / 2);
  group.rotation.y = wallAngles[wall];
  group.userData.hit = { type: 'wall', wall };
  const material = new MeshStandardMaterial();
  const paint = room.walls[wall];
  material.color.set(paint.color);
  material.roughness = roughness[paint.finish];
  const left = -half - WALL_THICKNESS;
  const right = half + WALL_THICKNESS;
  const cuts = [left, ...openings.flatMap(o => [o.offset - o.width / 2, o.offset + o.width / 2]), right].sort((a, b) => a - b);
  for (let i = 0; i < cuts.length - 1; i++) {
    const start = cuts[i];
    const end = cuts[i + 1];
    const size = end - start;
    if (size < 0.0001) continue;
    const mid = (start + end) / 2;
    const voids = openings.filter(o => Math.abs(mid - o.offset) < o.width / 2).sort((a, b) => a.sill - b.sill);
    let bottom = 0;
    for (const o of voids) {
      if (o.sill > bottom) box(group, material, size, o.sill - bottom, WALL_THICKNESS, mid, (o.sill + bottom) / 2, 0);
      bottom = o.sill + o.height;
    }
    if (height > bottom) box(group, material, size, height - bottom, WALL_THICKNESS, mid, (height + bottom) / 2, 0);
    if (voids.every(o => o.sill >= 0.105)) box(group, a.trim, size, 0.105, 0.026, mid, 0.0525, 0.091);
  }
  for (const opening of openings) group.add(createOpening(opening, a));
  const outlineGeometry = new BoxGeometry(span + WALL_THICKNESS, height, WALL_THICKNESS);
  const edges = new EdgesGeometry(outlineGeometry);
  outlineGeometry.dispose();
  const stroke = new LineBasicMaterial({ color: '#596449', transparent: true, opacity: 0.72 });
  const outline = new LineSegments(edges, stroke);
  outline.position.y = height / 2;
  outline.visible = false;
  group.add(outline);
  return { group, outline, material, openings, dispose: () => { disposeGeometry(group); material.dispose(); stroke.dispose(); } };
}
