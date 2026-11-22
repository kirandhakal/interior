import {
  Group, Mesh, MeshStandardMaterial, PlaneGeometry, SphereGeometry,
} from 'three';
import { getDisplay, hasDisplay, INTERIOR_CATALOG, type Furniture, type FurnitureKind } from '@studio/model';
import { box, cylinder } from './primitives';
import { addDevice, addInteriorModel } from './household';
import { artTexture, rugTexture, windowTexture } from './textures';

const material = (color: string, roughness = 0.85) => new MeshStandardMaterial({ color, roughness });

export function createAssets() {
  const rug = rugTexture();
  const artwork = artTexture();
  const window = windowTexture();
  return {
    wood: material('#996940'), walnut: material('#614431'), black: material('#34362e'),
    linen: material('#e3d3bd'), linenLight: material('#ecdeca'), sage: material('#899371'),
    rust: material('#b98169'), clay: material('#b48268'), cream: material('#e5d8c2'),
    leaf: ['#5b6b45', '#788656', '#495f42'].map(color => material(color)),
    rug: new MeshStandardMaterial({ map: rug, roughness: 1 }),
    art: new MeshStandardMaterial({ map: artwork, roughness: 0.83 }),
    glass: new MeshStandardMaterial({ map: window, emissive: '#cbd3c4', emissiveIntensity: 0.22, roughness: 1 }),
    trim: material('#e9e4d8'), edge: material('#ece9df'), base: material('#d6cbbb'),
    textures: [rug, artwork, window],
  };
}

export type SceneAssets = ReturnType<typeof createAssets>;

function plant(group: Group, a: SceneAssets) {
  cylinder(group, a.clay, 0.205, 0.14, 0.31, 0, 0.155, 0);
  cylinder(group, a.walnut, 0.176, 0.176, 0.02, 0, 0.305, 0);
  for (let i = 0; i < 20; i++) {
    const angle = i * 2.39996;
    const reach = 0.08 + 0.11 * (i % 5) / 4;
    const level = 0.42 + 0.041 * i;
    const x = Math.sin(angle) * reach;
    const z = Math.cos(angle) * reach;
    const stem = cylinder(group, a.leaf[2], 0.008, 0.012, level - 0.26, x / 2, (level + 0.26) / 2, z / 2);
    stem.rotation.x = z * 1.1;
    stem.rotation.z = -x * 1.1;
    const leaf = new Mesh(new SphereGeometry(1, 12, 7), a.leaf[i % 3]);
    leaf.position.set(x, level, z);
    leaf.scale.set(0.073, 0.035, 0.145);
    leaf.rotation.set(0.44, angle, (i % 3 - 1) * 0.4);
    leaf.castShadow = true;
    group.add(leaf);
  }
}

function sofa(group: Group, a: SceneAssets) {
  for (const x of [-1.0, 1.0]) {
    for (const z of [-0.35, 0.35]) cylinder(group, a.walnut, 0.055, 0.035, 0.13, x, 0.065, z);
  }
  box(group, a.linen, 2.42, 0.27, 0.98, 0, 0.245, 0, 0.09);
  box(group, a.linen, 2.35, 0.62, 0.23, 0, 0.53, -0.35, 0.09);
  for (const side of [-1, 1]) {
    box(group, a.linen, 0.23, 0.43, 0.94, side * 1.085, 0.46, 0, 0.105);
    box(group, a.linenLight, 0.95, 0.18, 0.66, side * 0.48, 0.41, 0.12, 0.07);
    const back = box(group, a.linenLight, 0.97, 0.41, 0.22, side * 0.48, 0.668, -0.22, 0.09);
    back.rotation.x = -0.12;
    const cushion = box(group, side > 0 ? a.rust : a.sage, 0.37, 0.37, 0.17, side * 0.75, 0.668, -0.042, 0.08);
    cushion.rotation.set(-0.24, side * 0.15, side * 0.19);
  }
  box(group, a.cream, 0.29, 0.31, 0.16, -0.41, 0.62, 0.04, 0.065).rotation.z = -0.2;
}

function armchair(group: Group, a: SceneAssets) {
  for (const x of [-0.31, 0.31]) for (const z of [-0.31, 0.31]) {
    cylinder(group, a.walnut, 0.036, 0.027, 0.21, x, 0.105, z);
  }
  box(group, a.wood, 0.86, 0.10, 0.83, 0, 0.235, 0, 0.03);
  box(group, a.sage, 0.71, 0.21, 0.67, 0, 0.36, 0.04, 0.088);
  box(group, a.sage, 0.78, 0.55, 0.22, 0, 0.57, -0.28, 0.095).rotation.x = -0.13;
  for (const x of [-0.407, 0.407]) {
    box(group, a.wood, 0.098, 0.11, 0.87, x, 0.59, -0.01, 0.035);
    box(group, a.wood, 0.063, 0.29, 0.069, x, 0.44, 0.29, 0.018);
  }
}

function classicFurniture(kind: FurnitureKind, a: SceneAssets) {
  const g = new Group();
  switch (kind) {
    case 'Sofa': sofa(g, a); break;
    case 'Armchair': armchair(g, a); break;
    case 'Coffee table':
      cylinder(g, a.wood, 0.61, 0.61, 0.075, 0, 0.42, 0, 0.66);
      for (const [x, z] of [[-0.37, -0.11], [0.36, -0.11], [0, 0.24]]) {
        cylinder(g, a.walnut, 0.055, 0.042, 0.39, x, 0.195, z);
      }
      box(g, a.sage, 0.28, 0.029, 0.20, -0.19, 0.473, 0.04, 0.007).rotation.y = 0.12;
      box(g, a.cream, 0.224, 0.024, 0.16, -0.19, 0.495, 0.052, 0.006).rotation.y = -0.09;
      cylinder(g, a.clay, 0.08, 0.067, 0.06, 0.23, 0.486, -0.09);
      cylinder(g, a.cream, 0.077, 0.074, 0.011, 0.23, 0.521, -0.09);
      break;
    case 'Rug': {
      const [width, depth] = INTERIOR_CATALOG.Rug.size;
      const mesh = new Mesh(new PlaneGeometry(width, depth), a.rug);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.009;
      mesh.receiveShadow = true;
      g.add(mesh);
      break;
    }
    case 'Plant': plant(g, a); break;
    case 'Sideboard':
      box(g, a.wood, 1.38, 0.43, 0.47, 0, 0.365, 0, 0.023);
      for (const x of [-0.46, 0, 0.46]) {
        box(g, a.wood, 0.437, 0.38, 0.026, x, 0.36, 0.23, 0.015);
        box(g, a.walnut, 0.12, 0.022, 0.028, x, 0.43, 0.256, 0.009);
      }
      for (const x of [-0.56, 0.56]) for (const z of [-0.15, 0.15]) cylinder(g, a.walnut, 0.031, 0.028, 0.16, x, 0.08, z);
      cylinder(g, a.cream, 0.113, 0.126, 0.13, 0.40, 0.64, 0);
      cylinder(g, a.clay, 0.061, 0.069, 0.23, -0.40, 0.70, -0.06);
      break;
    case 'Wall art': {
      box(g, a.walnut, 1.25, 0.75, 0.053, 0, 1.92, 0, 0.012);
      const art = new Mesh(new PlaneGeometry(1.195, 0.695), a.art);
      art.position.set(0, 1.92, 0.028);
      art.receiveShadow = true;
      g.add(art);
      break;
    }
    default: addInteriorModel(g, kind, a);
  }
  return g;
}

export function createFurniture(item: Furniture, assets: SceneAssets) {
  const tinted = item.color ? (item.kind === 'Rug' ? assets.rug.clone() : new MeshStandardMaterial({ roughness: 0.78 })) : undefined;
  if (tinted && item.color) tinted.color.set(item.color);
  const palette = tinted ? {
    ...assets, wood: tinted, linen: tinted, linenLight: tinted, sage: tinted, clay: tinted, trim: tinted,
    walnut: item.kind === 'Wall art' ? tinted : assets.walnut,
    black: hasDisplay(item.kind) ? tinted : assets.black,
    rug: item.kind === 'Rug' ? tinted : assets.rug,
  } : assets;
  const group = classicFurniture(item.kind, palette);
  const display = item.display ?? getDisplay(item.kind);
  const device = item.kind === 'TV' || item.kind === 'Desktop PC' ? addDevice(group, item.kind, display, palette) : undefined;
  return {
    group,
    kind: item.kind,
    color: item.color,
    screens: hasDisplay(item.kind) ? display.count : undefined,
    update(value: Furniture, height: number) {
      const scale = value.scale ?? 1;
      group.scale.setScalar(scale);
      const y = value.kind === 'Wall art' ? Math.min(0, height - 2.35 * scale) : 0;
      group.position.set(value.x, y, value.z);
      group.rotation.y = value.rotation * Math.PI / 180;
      device?.update(value.display ?? getDisplay(value.kind));
    },
    dispose() {
      group.traverse(child => { if (child instanceof Mesh) child.geometry.dispose(); });
      tinted?.dispose();
      device?.dispose();
    },
  };
}
