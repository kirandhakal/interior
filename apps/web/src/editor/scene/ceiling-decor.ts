import {
  CatmullRomCurve3, CylinderGeometry, DoubleSide, ExtrudeGeometry, Float32BufferAttribute, Group, IcosahedronGeometry,
  Mesh, MeshStandardMaterial, Shape, SphereGeometry, TorusGeometry, TubeGeometry, Vector3, type BufferGeometry,
} from 'three';
import { ceilingDecorScale, type CeilingDecor, type Dimensions } from '@studio/model';
import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';
import { disposeGeometry } from './architecture';
import { box, cylinder } from './primitives';

export function createCeilingDecor(kind: CeilingDecor['kind']) {
  const group = new Group();
  const finish = new MeshStandardMaterial({ roughness: 0.8, side: DoubleSide });
  const cord = new MeshStandardMaterial({ color: '#615145', roughness: 0.84 });
  const accent = new MeshStandardMaterial({ color: '#e0bb86', roughness: 0.73, side: DoubleSide });
  const leaves = new MeshStandardMaterial({ color: '#527344', roughness: 0.84 });

  function add(geometry: BufferGeometry, material: MeshStandardMaterial, x = 0, y = 0, z = 0) {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  function line(points: Vector3[], radius = 0.009, material = cord) {
    add(new TubeGeometry(new CatmullRomCurve3(points), Math.max(8, points.length * 2), radius, 5), material);
  }

  function hanger(depth: number) {
    cylinder(group, cord, 0.034, 0.034, 0.025, 0, -0.013, 0);
    cylinder(group, cord, 0.008, 0.008, depth, 0, -depth / 2, 0);
  }

  function leaf(x: number, y: number, z: number, angle: number, material = leaves) {
    const mesh = add(new SphereGeometry(1, 8, 6), material, x, y, z);
    mesh.scale.set(0.035, 0.088, 0.019);
    mesh.rotation.set(angle * 0.53, angle, Math.sin(angle) * 1.05);
  }

  function fabric(surface: ConstructorParameters<typeof ParametricGeometry>[0], material = finish) {
    add(new ParametricGeometry(surface, 32, 24), material);
  }

  switch (kind) {
    case 'Ceiling fan': {
      cord.color.set('#403b36');
      cord.metalness = 0.52;
      cord.roughness = 0.42;
      cylinder(group, cord, 0.104, 0.091, 0.044, 0, -0.022, 0);
      cylinder(group, cord, 0.019, 0.019, 0.13, 0, -0.106, 0);
      cylinder(group, cord, 0.103, 0.117, 0.078, 0, -0.199, 0);
      add(new SphereGeometry(0.118, 24, 12), cord, 0, -0.234).scale.y = 0.34;
      cylinder(group, accent, 0.037, 0.031, 0.015, 0, -0.272, 0);
      const blade = new Shape();
      blade.moveTo(0.08, -0.026);
      blade.quadraticCurveTo(0.32, -0.03, 0.54, -0.095);
      blade.quadraticCurveTo(0.583, -0.103, 0.583, -0.052);
      blade.quadraticCurveTo(0.593, 0.02, 0.54, 0.036);
      blade.quadraticCurveTo(0.38, 0.075, 0.08, 0.041);
      blade.closePath();
      for (let i = 0; i < 3; i++) {
        const angle = i * Math.PI * 2 / 3;
        const geometry = new ExtrudeGeometry(blade, { depth: 0.012, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 });
        geometry.rotateX(-Math.PI / 2);
        add(geometry, finish, 0, -0.223).rotation.y = angle;
      }
      break;
    }
    case 'Hanging plant':
      for (let i = 0; i < 3; i++) {
        const angle = i * Math.PI * 2 / 3;
        line([new Vector3(), new Vector3(Math.cos(angle) * 0.16, -0.38, Math.sin(angle) * 0.16)]);
      }
      add(new CylinderGeometry(0.17, 0.12, 0.2, 28), finish, 0, -0.47);
      cylinder(group, cord, 0.153, 0.153, 0.013, 0, -0.367, 0);
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4;
        const trail = Array.from({ length: 5 }, (_, step) => {
          const r = [0.02, 0.14, 0.23, 0.25, 0.22][step];
          return new Vector3(Math.cos(angle) * r, [-0.36, -0.29, -0.34, -0.48, -0.65 - (i % 3) * 0.08][step], Math.sin(angle) * r);
        });
        line(trail, 0.007, leaves);
        trail.slice(1).forEach(({ x, y, z }, j) => leaf(x, y, z, angle + j * 2));
      }
      break;
    case 'Wooden beam':
      box(group, finish, 2.35, 0.2, 0.24, 0, -0.1, 0, 0.017);
      cord.color.set('#63432d');
      for (let i = 0; i < 5; i++) {
        const z = (i - 2) * 0.042;
        line([new Vector3(-1.13, -0.2, z), new Vector3(-0.47, -0.2, z + 0.012 * Math.sin(i)),
          new Vector3(0.33, -0.2, z - 0.014), new Vector3(1.13, -0.2, z)], 0.0025);
      }
      break;
    case 'Wreath': {
      const ring = add(new TorusGeometry(0.33, 0.045, 8, 36), cord, 0, -0.19);
      ring.rotation.x = Math.PI / 2;
      for (let i = 0; i < 26; i++) {
        const angle = i * Math.PI * 2 / 26;
        const x = Math.cos(angle) * 0.35;
        const z = Math.sin(angle) * 0.35;
        leaf(x, -0.2, z, angle * 2, i % 3 ? finish : leaves);
        if (i % 5 === 0) add(new SphereGeometry(0.026, 8, 6), accent, x, -0.25, z);
        if (i % 9 === 0) line([new Vector3(x, 0, z), new Vector3(x, -0.18, z)]);
      }
      break;
    }
    case 'Paper lantern':
      hanger(0.31);
      add(new SphereGeometry(0.257, 32, 20), finish, 0, -0.55).scale.y = 0.9;
      accent.color.set('#fae2ba');
      for (let i = -4; i <= 4; i++) {
        const y = i * 0.047;
        const radius = Math.sqrt(0.257 ** 2 - (y / 0.9) ** 2);
        add(new TorusGeometry(radius, 0.004, 5, 36), accent, 0, -0.55 + y).rotation.x = Math.PI / 2;
      }
      break;
    case 'Pom-pom':
      hanger(0.34);
      for (let i = 0; i < 30; i++) {
        const y = (i + 0.5) / 15 - 1;
        const angle = i * 2.39996;
        const direction = new Vector3(Math.cos(angle) * Math.sqrt(1 - y * y), y, Math.sin(angle) * Math.sqrt(1 - y * y));
        const { x, y: offset, z } = direction.clone().multiplyScalar(0.16);
        const petal = add(new SphereGeometry(1, 8, 5), finish, x, -0.55 + offset, z);
        petal.scale.set(0.094, 0.125, 0.036);
        petal.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), direction);
      }
      break;
    case 'Disco ball': {
      hanger(0.34);
      finish.metalness = 0.55;
      finish.roughness = 0.18;
      finish.flatShading = true;
      const geometry = new IcosahedronGeometry(0.244, 3);
      const positions = geometry.getAttribute('position');
      const colors = new Float32Array(positions.count * 3);
      for (let i = 0; i < positions.count; i += 3) {
        const value = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(i * 12.9898));
        colors.fill(value, i * 3, (i + 3) * 3);
      }
      geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
      finish.vertexColors = true;
      add(geometry, finish, 0, -0.57);
      break;
    }
    case 'Garland': {
      const sag = (x: number) => -0.25 * (1 - x * x);
      line(Array.from({ length: 11 }, (_, i) => { const x = i / 5 - 1; return new Vector3(x, sag(x), 0); }));
      for (let i = -4; i <= 4; i++) {
        const x = i * 0.22;
        const flag = add(new CylinderGeometry(0, 0.112, 0.19, 3), i % 2 === 0 ? finish : accent, x, sag(x) - 0.085);
        flag.scale.z = 0.23;
        flag.rotation.z = Math.PI - x * 0.32;
      }
      break;
    }
    case 'Draped curtains':
      box(group, cord, 1.68, 0.035, 0.05, 0, -0.028, 0);
      for (const side of [-1, 1]) {
        fabric((u, v, target) => {
          const gathered = 0.55 * Math.sin(Math.PI * v) ** 4;
          target.set(side * (0.14 + u * 0.67 + (0.7 - u) * gathered), -0.06 - v * 1.3,
            Math.sin(u * Math.PI * 10) * (0.063 - 0.024 * gathered));
        });
        box(group, accent, 0.34, 0.045, 0.137, side * 0.55, -0.71, 0, 0.014);
      }
      break;
    case 'Tented fabric':
      for (const side of [-1, 1]) {
        fabric((u, v, target) => {
          target.set((u - 0.5) * 2.2, -0.018 - (0.46 - 0.067 * Math.cos(u * Math.PI * 12)) * Math.sin(Math.PI * v / 2), side * v * 0.68);
        });
        box(group, accent, 2.2, 0.025, 0.018, 0, -0.46, side * 0.68);
        for (const x of [-1.04, 1.04]) line([new Vector3(x, 0, side * 0.68), new Vector3(x, -0.46, side * 0.68)]);
      }
      break;
    case 'Tapestry':
      box(group, cord, 1.06, 0.043, 0.049, 0, -0.17, 0);
      line([new Vector3(-0.48, -0.17, 0), new Vector3(0, 0, 0), new Vector3(0.48, -0.17, 0)]);
      fabric((u, v, target) => target.set(u - 0.5, -0.19 - v * 1.04, Math.sin(u * Math.PI * 6) * 0.028));
      for (const y of [-0.31, -0.49, -0.89, -1.08, -1.19]) {
        for (const offset of [-0.002, 0.002]) {
          fabric((u, v, target) => target.set(u - 0.5, y - v * 0.027, Math.sin(u * Math.PI * 6) * 0.028 + offset), accent);
        }
      }
      for (let i = 0; i < 17; i++) box(group, accent, 0.013, 0.085, 0.016, i * 0.06 - 0.48, -1.25, 0);
      break;
  }

  return {
    group, kind,
    update(item: CeilingDecor, dimensions: Dimensions) {
      finish.color.set(item.color);
      group.position.set(item.x, dimensions.height, item.z);
      group.scale.setScalar(Math.min(ceilingDecorScale(dimensions, item), (dimensions.height - 0.08) / 1.35));
      group.rotation.y = item.rotation * Math.PI / 180;
    },
    dispose() { disposeGeometry(group); [finish, cord, accent, leaves].forEach(material => material.dispose()); },
  };
}
