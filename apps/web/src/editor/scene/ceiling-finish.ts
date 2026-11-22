import {
  CanvasTexture, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry, RepeatWrapping, SRGBColorSpace,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { CeilingFinish, Dimensions } from '@studio/model';

export function createCeilingFinish(dimensions: Dimensions, finish: CeilingFinish) {
  const { length, width, height } = dimensions;
  const group = new Group();
  const material = new MeshStandardMaterial({ color: '#f2e4cf', roughness: 0.87 });
  if (finish === '3D panels') {
    const columns = Math.ceil(length / 0.66);
    const rows = Math.ceil(width / 0.66);
    const tileWidth = length / columns;
    const tileDepth = width / rows;
    const geometry = new RoundedBoxGeometry(tileWidth - 0.017, 0.095, tileDepth - 0.017, 2, 0.038);
    const panels = new InstancedMesh(geometry, material, columns * rows);
    const matrix = new Matrix4();
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        matrix.makeTranslation((column + 0.5) * tileWidth - length / 2, height - 0.045, (row + 0.5) * tileDepth - width / 2);
        panels.setMatrixAt(row * columns + column, matrix);
      }
    }
    panels.receiveShadow = true;
    group.add(panels);
    return { group, dispose() { panels.dispose(); geometry.dispose(); material.dispose(); } };
  }

  const geometry = new PlaneGeometry(length, width);
  const map = patternTexture(finish, length, width);
  material.color.set('#ffffff');
  material.map = map;
  if (finish === 'Pressed tin') {
    material.metalness = 0.35;
    material.roughness = 0.46;
    material.bumpMap = map;
    material.bumpScale = 0.024;
  }
  const panel = new Mesh(geometry, material);
  panel.rotation.x = Math.PI / 2;
  panel.position.y = height - 0.002;
  panel.receiveShadow = true;
  group.add(panel);
  return { group, dispose() { geometry.dispose(); map.dispose(); material.dispose(); } };
}

function patternTexture(finish: CeilingFinish, length: number, width: number) {
  const surface = document.createElement('canvas');
  surface.width = surface.height = 128;
  const ctx = surface.getContext('2d')!;
  ctx.fillStyle = finish === 'Wallpaper' ? '#d8dcc2' : finish === 'Pressed tin' ? '#b6aa94' : '#f1e2cb';
  ctx.fillRect(0, 0, 128, 128);
  if (finish === 'Wallpaper') {
    ctx.strokeStyle = '#829579';
    ctx.lineWidth = 3;
    for (const x of [0, 64, 128]) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + 27, 35, x - 27, 93, x, 128);
      ctx.stroke();
      ctx.fillStyle = '#8c9d83';
      for (const y of [25, 62, 101]) {
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(x + 13 * side, y, 18, 7, side * -0.66, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  } else if (finish === 'Stencils' || finish === 'Pressed tin') {
    ctx.strokeStyle = finish === 'Stencils' ? '#a28669' : '#777568';
    ctx.lineWidth = 3;
    ctx.strokeRect(5, 5, 118, 118);
    ctx.translate(64, 64);
    for (let i = 0; i < 8; i++) {
      ctx.rotate(Math.PI / 4);
      ctx.beginPath();
      ctx.ellipse(0, 23, 8, 16, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (finish === 'Pressed tin') {
      ctx.strokeStyle = '#e2d6ba';
      ctx.strokeRect(-55, -55, 110, 110);
      ctx.beginPath();
      ctx.arc(0, 0, 44, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  const map = new CanvasTexture(surface);
  map.colorSpace = SRGBColorSpace;
  map.wrapS = map.wrapT = RepeatWrapping;
  map.repeat.set(Math.max(2, Math.round(length / 0.56)), Math.max(2, Math.round(width / 0.56)));
  map.anisotropy = 4;
  return map;
}
