import {
  BoxGeometry, BufferGeometry, DoubleSide, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial, PlaneGeometry, Vector3,
} from 'three';
import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';
import { WALLS, wallSpan, type Curtains, type Dimensions, type Opening, type Room, type Wall } from '@studio/model';
import type { SceneAssets } from './furniture';
import { box, cylinder } from './primitives';
import { createSwing, type Swing } from './swing';
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

  const corners = [
    new Vector3(-length / 2, height, -width / 2), new Vector3(length / 2, height, -width / 2),
    new Vector3(length / 2, height, width / 2), new Vector3(-length / 2, height, width / 2),
  ];
  const edges = corners.flatMap((point, index) => [point, corners[(index + 1) % corners.length]]);
  const boundaryStroke = new LineBasicMaterial({ color: '#465a3b', depthTest: false, depthWrite: false });
  const boundary = new LineSegments(new BufferGeometry().setFromPoints(edges), boundaryStroke);
  boundary.renderOrder = 2;
  boundary.visible = false;
  group.add(boundary);

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
  return { group, slab, rim, boundary, dispose: () => { disposeGeometry(group); plaster.dispose(); edge.dispose(); boundaryStroke.dispose(); } };
}

function windowCurtains(opening: Opening, roomHeight: number, span: number, a: SceneAssets) {
  const group = new Group();
  group.position.z = 0.205;
  const extension = Math.min(0.15, Math.max(0, span / 2 - Math.abs(opening.offset) - opening.width / 2));
  const half = opening.width / 2 + extension;
  const top = Math.min(opening.height + 0.13, roomHeight - opening.sill - 0.03);
  const material = new MeshStandardMaterial({ roughness: 0.98, side: DoubleSide });
  const rod = cylinder(group, a.black, 0.012, 0.012, half * 2, 0, top, 0);
  rod.rotation.z = Math.PI / 2;
  const panels = [-1, 1].map(side => {
    const geometry = new ParametricGeometry((u, v, target) => {
      target.set(u - 0.5, -v + Math.cos(u * 9 * Math.PI * 2) * v ** 6 * 0.006,
        Math.sin(u * 9 * Math.PI * 2) * (0.025 + v * 0.013));
    }, 54, 12);
    const panel = new Mesh(geometry, material);
    panel.castShadow = true;
    panel.receiveShadow = true;
    group.add(panel);
    return { panel, side };
  });
  return {
    group, material,
    update(value: Curtains) {
      material.color.set(value.color);
      const width = Math.min(half, 0.18 + value.drawn / 100 * (half - 0.18));
      const bottom = value.length === 'Floor' ? 0.04 - opening.sill : Math.max(0.04 - opening.sill, -0.10);
      for (const { panel, side } of panels) {
        panel.position.set(side * (half - width / 2), top - 0.015, 0);
        panel.scale.set(width, top - 0.015 - bottom, 1);
      }
    },
  };
}

function createOpening(opening: Opening, a: SceneAssets, roomHeight: number, span: number) {
  const { width, height, offset, sill } = opening;
  const group = new Group();
  group.position.set(offset, sill, 0);
  group.userData.hit = { type: 'opening', id: opening.id };
  const rail = 0.045;
  const swings: Swing[] = [];
  let curtains: ReturnType<typeof windowCurtains> | undefined;
  for (const x of [-width / 2, width / 2]) box(group, a.trim, rail, height + rail, 0.245, x, height / 2, 0.005);
  box(group, a.trim, width + rail, rail, 0.245, 0, height, 0.005);
  if (opening.kind === 'Window') {
    box(group, a.trim, width + 0.10, 0.062, 0.28, 0, 0, 0.031);
    const backdrop = new Mesh(new PlaneGeometry(width - 0.025, height - 0.035), a.glass);
    backdrop.position.set(0, height / 2, -0.115);
    group.add(backdrop);
    const sashWidth = width / 2 - 0.039;
    const sashHeight = height - 0.058;
    for (const direction of [-1, 1] as const) {
      const swing = createSwing(group, -direction * (width / 2 - 0.026), 0.068, direction, sashWidth, a.swingMark);
      swings.push(swing);
      const x = direction * sashWidth / 2;
      const pane = new Mesh(new PlaneGeometry(sashWidth - 0.021, sashHeight - 0.024), a.glazing);
      pane.position.set(x, height / 2, 0);
      swing.pivot.add(pane);
      for (const y of [0.029, height - 0.029, height * 0.64]) box(swing.pivot, a.trim, sashWidth, 0.029, 0.046, x, y, 0);
      for (const edge of [0.012, sashWidth - 0.012]) box(swing.pivot, a.trim, 0.027, sashHeight, 0.046, direction * edge, height / 2, 0);
      box(swing.pivot, a.black, 0.016, 0.083, 0.035, direction * (sashWidth - 0.024), height * 0.48, 0.034, 0.005);
    }
  } else {
    const direction = opening.hinge === 'Right' ? -1 : 1;
    const leafWidth = width - 0.055;
    const swing = createSwing(group, -direction * leafWidth / 2, 0.071, direction, leafWidth, a.swingMark);
    swings.push(swing);
    const x = direction * leafWidth / 2;
    box(swing.pivot, a.wood, leafWidth, height - 0.045, 0.05, x, height / 2, 0);
    for (const y of [height * 0.28, height * 0.73]) {
      box(swing.pivot, a.walnut, width - 0.20, height * 0.34, 0.015, x, y, 0.024, 0.008);
      box(swing.pivot, a.wood, width - 0.23, height * 0.32, 0.019, x, y, 0.026, 0.006);
    }
    box(swing.pivot, a.black, 0.104, 0.027, 0.10, direction * (leafWidth - 0.09), height * 0.47, 0, 0.008);
  }
  return {
    group,
    update(value: Opening) {
      for (const swing of swings) swing.setAngle(value.openAngle ?? 0);
      if (value.curtains && opening.kind === 'Window') {
        if (!curtains) {
          curtains = windowCurtains(opening, roomHeight, span, a);
          group.add(curtains.group);
        }
        curtains.group.visible = true;
        curtains.update(value.curtains);
      } else if (curtains) curtains.group.visible = false;
    },
    showSwingGuide(show: boolean) { for (const swing of swings) swing.showGuide(show); },
    tickSwing(progress: number) {
      let moving = false;
      for (const swing of swings) if (swing.advance(progress)) moving = true;
      return moving;
    },
    dispose() { curtains?.material.dispose(); },
  };
}

export function sameOpeningGeometry(a: Opening, b: Opening) {
  return a.id === b.id && a.kind === b.kind && a.offset === b.offset && a.sill === b.sill && a.width === b.width && a.height === b.height && a.hinge === b.hinge;
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
  const openingModels = new Map(openings.map(opening => [opening.id, createOpening(opening, a, height, span)]));
  for (const model of openingModels.values()) group.add(model.group);
  const outlineGeometry = new BoxGeometry(span + WALL_THICKNESS, height, WALL_THICKNESS);
  const edges = new EdgesGeometry(outlineGeometry);
  outlineGeometry.dispose();
  const stroke = new LineBasicMaterial({ color: '#596449', transparent: true, opacity: 0.72 });
  const outline = new LineSegments(edges, stroke);
  outline.position.y = height / 2;
  outline.visible = false;
  group.add(outline);
  return { group, outline, material, openings, openingModels, dispose() {
    disposeGeometry(group);
    for (const model of openingModels.values()) model.dispose();
    material.dispose();
    stroke.dispose();
  } };
}
