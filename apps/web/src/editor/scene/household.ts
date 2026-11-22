import { Color, Group, MeshStandardMaterial, SpotLight } from 'three';
import { INTERIOR_CATALOG, type DisplaySettings, type FurnitureKind } from '@studio/model';
import type { SceneAssets } from './furniture';
import { box, cylinder } from './primitives';

function table(g: Group, a: SceneAssets, width: number, depth: number, height: number) {
  box(g, a.wood, width, 0.065, depth, 0, height - 0.033, 0, 0.022);
  for (const x of [-width / 2 + 0.09, width / 2 - 0.09]) {
    for (const z of [-depth / 2 + 0.07, depth / 2 - 0.07]) {
      box(g, a.walnut, 0.058, height - 0.065, 0.058, x, (height - 0.065) / 2, z, 0.01);
    }
  }
}

function cabinet(g: Group, a: SceneAssets, width: number, depth: number, height: number, rows: number, columns: number) {
  box(g, a.wood, width - 0.01, height - 0.09, depth - 0.048, 0, (height - 0.013) / 2, -0.011, 0.014);
  box(g, a.walnut, width - 0.08, 0.06, depth - 0.09, 0, 0.03, -0.02, 0.009);
  const panelW = (width - 0.04) / columns;
  const panelH = (height - 0.12) / rows;
  for (let col = 0; col < columns; col++) for (let row = 0; row < rows; row++) {
    const x = (col + 0.5 - columns / 2) * panelW;
    const y = 0.07 + (row + 0.5) * panelH;
    box(g, a.wood, panelW - 0.012, panelH - 0.012, 0.029, x, y, depth / 2 - 0.034, 0.008);
    box(g, a.black, Math.min(0.12, panelW / 3), 0.018, 0.021, x, y + panelH * 0.26, depth / 2 - 0.009, 0.006);
  }
  box(g, a.wood, width, 0.027, depth, 0, height - 0.014, 0, 0.009);
}

function diningChair(g: Group, a: SceneAssets) {
  for (const x of [-0.19, 0.19]) for (const z of [-0.2, 0.2]) {
    box(g, a.walnut, 0.043, 0.42, 0.043, x, 0.21, z);
  }
  box(g, a.wood, 0.48, 0.06, 0.49, 0, 0.44, 0, 0.02);
  box(g, a.linen, 0.44, 0.045, 0.44, 0, 0.48, 0.014, 0.018);
  box(g, a.wood, 0.47, 0.40, 0.075, 0, 0.67, -0.24, 0.024);
}

function officeChair(g: Group, a: SceneAssets) {
  cylinder(g, a.black, 0.035, 0.044, 0.32, 0, 0.22, 0);
  for (let leg = 0; leg < 5; leg++) {
    const angle = leg * Math.PI * 2 / 5;
    const x = Math.sin(angle), z = Math.cos(angle);
    box(g, a.black, 0.045, 0.045, 0.27, x * 0.13, 0.07, z * 0.13, 0.011).rotation.y = angle;
    cylinder(g, a.black, 0.033, 0.033, 0.039, x * 0.273, 0.037, z * 0.273);
  }
  box(g, a.sage, 0.53, 0.13, 0.51, 0, 0.47, 0, 0.055);
  box(g, a.sage, 0.5, 0.53, 0.12, 0, 0.76, -0.22, 0.052).rotation.x = -0.1;
  for (const x of [-0.28, 0.28]) box(g, a.black, 0.068, 0.1, 0.32, x, 0.64, 0, 0.017);
}

function sink(g: Group, a: SceneAssets, width: number, depth: number, height: number) {
  cabinet(g, a, width, depth, height, 1, 2);
  box(g, a.black, width * 0.62, 0.022, depth * 0.62, 0, height + 0.007, 0.023, 0.01);
  box(g, a.trim, width * 0.51, 0.018, depth * 0.45, 0, height + 0.016, 0.023, 0.007);
  cylinder(g, a.black, 0.017, 0.025, 0.16, 0, height + 0.08, -0.2);
  box(g, a.black, 0.033, 0.034, 0.15, 0, height + 0.145, -0.143, 0.01);
}

function tub(g: Group, a: SceneAssets, width: number, depth: number) {
  box(g, a.trim, width - 0.04, 0.14, depth - 0.04, 0, 0.10, 0, 0.05);
  for (const z of [-depth / 2 + 0.049, depth / 2 - 0.049]) {
    box(g, a.trim, width - 0.035, 0.44, 0.095, 0, 0.29, z, 0.042);
  }
  for (const x of [-width / 2 + 0.062, width / 2 - 0.062]) {
    box(g, a.trim, 0.12, 0.44, depth - 0.012, x, 0.29, 0, 0.048);
  }
  cylinder(g, a.black, 0.022, 0.026, 0.14, -width * 0.3, 0.44, -depth / 2 + 0.045);
}

export function addInteriorModel(g: Group, kind: FurnitureKind, a: SceneAssets) {
  const [w, d, h] = INTERIOR_CATALOG[kind].size;
  switch (kind) {
    case 'Side table': case 'Desk': case 'Dining table': case 'Bench':
      table(g, a, w, d, h);
      break;
    case 'Nightstand': case 'Dresser': case 'Media console': case 'Wardrobe': case 'Kitchen cabinet': case 'Kitchen island': {
      const rows = kind === 'Nightstand' ? 2 : kind === 'Dresser' ? 3 : 1;
      cabinet(g, a, w, d, h, rows, kind === 'Nightstand' ? 1 : 2);
      if (kind === 'Kitchen island' || kind === 'Kitchen cabinet') box(g, a.trim, w, 0.045, d, 0, h - 0.022, 0, 0.014);
      break;
    }
    case 'Bed':
      box(g, a.wood, w, 0.23, d, 0, 0.192, 0, 0.052);
      box(g, a.wood, w, 0.99, 0.108, 0, 0.535, -d / 2 + 0.055, 0.048);
      box(g, a.linen, w - 0.10, 0.22, d - 0.15, 0, 0.385, 0.04, 0.08);
      box(g, a.sage, w - 0.08, 0.105, d * 0.63, 0, 0.505, d * 0.125, 0.048);
      for (const x of [-w * 0.24, w * 0.24]) box(g, a.cream, w * 0.42, 0.13, 0.5, x, 0.55, -d * 0.317, 0.055);
      break;
    case 'Office chair': officeChair(g, a); break;
    case 'Dining chair': diningChair(g, a); break;
    case 'Bookshelf':
      for (const x of [-w / 2 + 0.024, w / 2 - 0.024]) box(g, a.wood, 0.045, h, d, x, h / 2, 0);
      box(g, a.walnut, w - 0.09, h - 0.05, 0.033, 0, h / 2, -d / 2 + 0.017);
      for (let shelf = 0; shelf < 5; shelf++) {
        const y = 0.077 + shelf * 0.413;
        box(g, a.wood, w - 0.07, 0.043, d, 0, y, 0);
        if (shelf < 4) for (let book = 0; book < 5; book++) {
          const height = 0.19 + (book % 3) * 0.046;
          box(g, [a.sage, a.rust, a.linen][(book + shelf) % 3], 0.049, height, 0.185,
            -0.265 + 0.051 * book + (shelf % 2) * 0.035, y + height / 2 + 0.022, -0.013);
        }
      }
      break;
    case 'Refrigerator':
      box(g, a.trim, w, h, d - 0.08, 0, h / 2, -0.035, 0.045);
      for (const [y, height] of [[h * 0.31, h * 0.61], [h * 0.795, h * 0.34]]) {
        box(g, a.trim, w - 0.018, height, 0.062, 0, y, d / 2 - 0.065, 0.021);
        box(g, a.black, 0.026, 0.29, 0.052, -w * 0.36, y, d / 2 - 0.027, 0.01);
      }
      break;
    case 'Range':
      box(g, a.trim, w, h - 0.04, d - 0.05, 0, (h - 0.04) / 2, -0.017, 0.019);
      box(g, a.black, w - 0.04, 0.055, d - 0.068, 0, h - 0.028, -0.009, 0.016);
      box(g, a.black, w - 0.09, 0.49, 0.022, 0, 0.37, d / 2 - 0.02, 0.021);
      box(g, a.walnut, w - 0.16, 0.03, 0.045, 0, 0.55, d / 2 - 0.024, 0.008);
      for (const x of [-w * 0.23, w * 0.23]) for (const z of [-d * 0.23, d * 0.23]) {
        cylinder(g, a.base, 0.112, 0.116, 0.012, x, h - 0.009, z);
      }
      break;
    case 'Kitchen sink': sink(g, a, w, d, h - 0.17); break;
    case 'Vanity':
      sink(g, a, w, d, 0.90);
      box(g, a.wood, 0.49, 0.58, 0.045, 0, 1.425, -d / 2 + 0.035, 0.02);
      box(g, a.trim, 0.435, 0.527, 0.023, 0, 1.425, -d / 2 + 0.061, 0.015);
      break;
    case 'Bathtub': tub(g, a, w, d); break;
    case 'Shower':
      box(g, a.trim, w, 0.13, d, 0, 0.065, 0, 0.026);
      box(g, a.trim, w - 0.065, h - 0.13, 0.065, 0, (h + 0.13) / 2, -d / 2 + 0.035, 0.013);
      for (const side of [-1, 1]) {
        box(g, a.black, 0.027, h - 0.09, 0.028, side * (w / 2 - 0.027), h / 2 + 0.03, d / 2 - 0.038);
      }
      box(g, a.black, w - 0.03, 0.027, 0.027, 0, h - 0.0135, d / 2 - 0.038);
      cylinder(g, a.black, 0.018, 0.018, 0.71, 0, 1.45, -d / 2 + 0.102);
      cylinder(g, a.black, 0.105, 0.105, 0.041, 0, 1.81, -d / 2 + 0.17);
      break;
    case 'Toilet':
      cylinder(g, a.trim, 0.152, 0.125, 0.32, 0, 0.16, 0.071, 1.2);
      cylinder(g, a.trim, 0.213, 0.165, 0.115, 0, 0.377, 0.078, 1.16);
      cylinder(g, a.cream, 0.197, 0.194, 0.027, 0, 0.447, 0.08, 1.17);
      box(g, a.trim, w - 0.03, 0.42, 0.23, 0, 0.60, -d / 2 + 0.12, 0.038);
      break;
    case 'Washing machine': case 'Dryer':
      box(g, a.trim, w, h, d - 0.057, 0, h / 2, -0.019, 0.028);
      cylinder(g, a.black, 0.236, 0.236, 0.04, 0, h * 0.46, d / 2 - 0.021).rotation.x = Math.PI / 2;
      cylinder(g, kind === 'Dryer' ? a.walnut : a.base, 0.189, 0.189, 0.018, 0, h * 0.46, d / 2 - 0.009).rotation.x = Math.PI / 2;
      box(g, a.black, w * 0.35, 0.06, 0.015, w * 0.2, h - 0.10, d / 2 - 0.036, 0.008);
      break;
    case 'Mirror':
      box(g, a.wood, w, h - 0.095, 0.075, 0, (h + 0.095) / 2, -0.014, 0.034);
      box(g, a.base, w - 0.064, h - 0.16, 0.021, 0, (h + 0.095) / 2, 0.032, 0.024);
      box(g, a.wood, w * 0.85, 0.095, 0.12, 0, 0.0475, 0, 0.012);
      break;
  }
}

export function addDevice(g: Group, kind: 'TV' | 'Desktop PC', display: DisplaySettings, a: SceneAssets) {
  const screenMaterial = new MeshStandardMaterial({ color: '#151922', roughness: 0.38 });
  const color = new Color();
  const screen = (width: number, height: number, x: number, y: number, z: number) => {
    box(g, a.black, width, height, 0.046, x, y, z, 0.014);
    box(g, screenMaterial, width - 0.039, height - 0.039, 0.008, x, y + 0.003, z + 0.025, 0.008);
  };
  const beam = new SpotLight('#a9ccf5', 0, 7, 1.09, 0.82, 2);
  if (kind === 'TV') {
    for (const x of [-0.48, 0.48]) box(g, a.black, 0.14, 0.067, 0.35, x, 0.034, 0, 0.01);
    box(g, a.black, 0.075, 0.61, 0.082, 0, 0.326, -0.08, 0.01);
    screen(1.38, 0.79, 0, 0.985, -0.055);
    beam.position.set(0, 0.99, -0.019);
  } else {
    table(g, a, 1.62, 0.74, 0.75);
    box(g, a.black, 0.21, 0.49, 0.43, 0.58, 0.26, -0.12, 0.022);
    box(g, a.sage, 0.019, 0.22, 0.014, 0.62, 0.29, 0.097, 0.005);
    box(g, a.black, 0.43, 0.022, 0.135, -0.04, 0.762, 0.139, 0.012);
    box(g, a.black, 0.07, 0.026, 0.104, 0.28, 0.766, 0.15, 0.013);
    const width = display.count === 3 ? 0.48 : display.count === 2 ? 0.57 : 0.63;
    const height = width * 0.59;
    for (let index = 0; index < display.count; index++) {
      const x = (index - (display.count - 1) / 2) * (width + 0.028);
      box(g, a.black, width * 0.54, 0.03, 0.16, x, 0.765, -0.163, 0.01);
      box(g, a.black, 0.046, 0.24, 0.042, x, 0.877, -0.213, 0.01);
      screen(width, height, x, 0.91 + height / 2, -0.208);
    }
    beam.position.set(0, 1.08, -0.172);
  }
  beam.target.position.set(0, beam.position.y - 0.23, 2);
  g.add(beam, beam.target);
  return {
    update(settings: DisplaySettings) {
      const strength = settings.enabled ? settings.brightness / 100 : 0;
      color.set(settings.color);
      screenMaterial.emissive.copy(color);
      screenMaterial.emissiveIntensity = strength * 1.36;
      beam.color.copy(color);
      beam.intensity = strength * (kind === 'TV' ? 42 : 23 * settings.count);
      beam.visible = strength > 0;
    },
    dispose() { screenMaterial.dispose(); beam.dispose(); },
  };
}
