import { BoxGeometry, CylinderGeometry, Mesh, type MeshStandardMaterial, type Object3D } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export function box(
  parent: Object3D, mat: MeshStandardMaterial, w: number, h: number, d: number,
  x: number, y: number, z: number, radius = 0,
) {
  const geo = radius ? new RoundedBoxGeometry(w, h, d, 2, radius) : new BoxGeometry(w, h, d);
  const mesh = new Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function cylinder(parent: Object3D, mat: MeshStandardMaterial, top: number, bottom: number, height: number, x: number, y: number, z: number, scaleZ = 1) {
  const mesh = new Mesh(new CylinderGeometry(top, bottom, height, 32), mat);
  mesh.position.set(x, y, z);
  mesh.scale.z = scaleZ;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
