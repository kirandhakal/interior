import {
  BufferGeometry, DoubleSide, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial, PlaneGeometry, Vector3,
} from 'three';
import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';
import { DEFAULT_WALL_THICKNESS, WALLS, clamp, roomPlan, wallOffset, type Curtains, type Dimensions, type Opening, type Room, type Wall } from '@studio/model';
import type { SceneAssets } from './furniture';
import { planFace, planPrism } from './plan-mesh';
import { box, cylinder } from './primitives';
import { createSwing, type Swing } from './swing';
import { floorTexture } from './textures';

export const roughness = { Matte: 0.98, Eggshell: 0.65, Satin: 0.33 };

export function disposeGeometry(group: Group) {
  group.traverse(object => {
    if (object instanceof Mesh || object instanceof LineSegments) object.geometry.dispose();
  });
}

export function createFloor(dimensions: Dimensions, assets: SceneAssets) {
  const { inner, outer, bounds: { length, width } } = roomPlan(dimensions);
  const group = new Group();
  const slab = new Mesh(planPrism(outer, -0.23, 0.22), assets.base);
  slab.castShadow = slab.receiveShadow = true;
  const edge = new Mesh(planPrism(outer, -0.244, 0.039), assets.edge);
  edge.castShadow = edge.receiveShadow = true;
  const map = floorTexture(length, width);
  const material = new MeshStandardMaterial({ map, roughness: 0.83 });
  const floor = new Mesh(planFace(inner, 0), material);
  floor.receiveShadow = true;
  group.add(slab, edge, floor);
  return { group, dispose: () => { disposeGeometry(group); map.dispose(); material.dispose(); } };
}

export function createCeiling(dimensions: Dimensions) {
  const { height } = dimensions;
  const { inner, outer } = roomPlan(dimensions);
  const group = new Group();
  const plaster = new MeshStandardMaterial({ color: '#eee9df', roughness: 0.96 });
  const edge = new MeshStandardMaterial({ color: '#ddd5c7', roughness: 0.92 });
  const thickness = 0.095;
  const slab = new Mesh(planPrism(outer, height, thickness), plaster);
  slab.receiveShadow = true;
  group.add(slab);

  const corners = inner.map(point => new Vector3(point.x, height, point.z));
  const edges = corners.flatMap((point, index) => [point, corners[(index + 1) % corners.length]]);
  const boundaryStroke = new LineBasicMaterial({ color: '#465a3b', depthTest: false, depthWrite: false });
  const boundary = new LineSegments(new BufferGeometry().setFromPoints(edges), boundaryStroke);
  boundary.renderOrder = 2;
  boundary.visible = false;
  group.add(boundary);

  // Retain the wall-side section of the slab when the rest is cut away.
  const rim = new Map<Wall, Mesh>();
  for (const [index, wall] of WALLS.entries()) {
    const next = (index + 1) % WALLS.length;
    const mesh = new Mesh(planPrism([inner[index], inner[next], outer[next], outer[index]], height, thickness), edge);
    mesh.receiveShadow = true;
    group.add(mesh);
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

function createOpening(opening: Opening, a: SceneAssets, roomHeight: number, span: number, thickness: number) {
  const { width, height, offset, sill } = opening;
  const group = new Group();
  group.position.set(offset, sill, -DEFAULT_WALL_THICKNESS / 2);
  group.userData.hit = { type: 'opening', id: opening.id };
  const rail = 0.045;
  const swings: Swing[] = [];
  let curtains: ReturnType<typeof windowCurtains> | undefined;
  const frameDepth = thickness + 0.085;
  const frameZ = (DEFAULT_WALL_THICKNESS - thickness) / 2 + 0.005;
  for (const x of [-width / 2, width / 2]) box(group, a.trim, rail, height + rail, frameDepth, x, height / 2, frameZ);
  box(group, a.trim, width + rail, rail, frameDepth, 0, height, frameZ);
  if (opening.kind === 'Window') {
    box(group, a.trim, width + 0.10, 0.062, thickness + 0.12, 0, 0, frameZ + 0.026);
    const backdrop = new Mesh(new PlaneGeometry(width - 0.025, height - 0.035), a.glass);
    backdrop.position.set(0, height / 2, -thickness + 0.045);
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
  const { height } = room.dimensions;
  const { walls, outer } = roomPlan(room.dimensions);
  const plan = walls[wall];
  const { span, thickness, midpoint, tangent } = plan;
  const half = span / 2;
  const group = new Group();
  group.position.set(midpoint.x, 0, midpoint.z);
  group.rotation.y = -Math.atan2(tangent.z, tangent.x);
  group.userData.hit = { type: 'wall', wall };
  const material = new MeshStandardMaterial();
  const paint = room.walls[wall];
  material.color.set(paint.color);
  material.roughness = roughness[paint.finish];
  const left = -half;
  const right = half;
  const index = WALLS.indexOf(wall);
  const outerLeft = wallOffset(plan, outer[index]);
  const outerRight = wallOffset(plan, outer[(index + 1) % WALLS.length]);
  const section = (start: number, end: number) => [
    { x: start, z: 0 }, { x: end, z: 0 },
    { x: end === right ? outerRight : clamp(end, outerLeft, outerRight), z: -thickness },
    { x: start === left ? outerLeft : clamp(start, outerLeft, outerRight), z: -thickness },
  ];
  const solid = (start: number, end: number, bottom: number, top: number) => {
    const mesh = new Mesh(planPrism(section(start, end), bottom, top - bottom), material);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  };
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
      if (o.sill > bottom) solid(start, end, bottom, o.sill);
      bottom = o.sill + o.height;
    }
    if (height > bottom) solid(start, end, bottom, height);
    if (voids.every(o => o.sill >= 0.105)) box(group, a.trim, size, 0.105, 0.026, mid, 0.0525, 0.011);
  }
  const openingModels = new Map(openings.map(opening => [opening.id, createOpening(opening, a, height, span, thickness)]));
  for (const model of openingModels.values()) group.add(model.group);
  const outlineGeometry = planPrism(section(left, right), 0, height);
  const edges = new EdgesGeometry(outlineGeometry);
  outlineGeometry.dispose();
  const stroke = new LineBasicMaterial({ color: '#596449', transparent: true, opacity: 0.72 });
  const outline = new LineSegments(edges, stroke);
  outline.visible = false;
  group.add(outline);
  const normal = new Vector3(plan.normal.x, 0, plan.normal.z);
  return { group, outline, material, openings, openingModels, normal, dispose() {
    disposeGeometry(group);
    for (const model of openingModels.values()) model.dispose();
    material.dispose();
    stroke.dispose();
  } };
}
