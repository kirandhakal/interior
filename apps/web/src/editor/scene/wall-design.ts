import { BoxGeometry, BufferGeometry, CircleGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial } from 'three';
import { roomPlan, wallOffset, type Room, type Wall } from '@studio/model';
import { getWallDesign, wallPaintPolygons } from '@studio/wall-design';
import { isolateWall, WALL_SURFACES, wallSurfaceFrame } from '@studio/wall-surface';

const roughness = { Matte: 0.98, Eggshell: 0.65, Satin: 0.33 };

/** Local to createWall's group. Uses the same U/V frame as the elevation. */
export function createWallDesignObjects(room: Room, wall: Wall) {
  const group = new Group();
  const materials: MeshStandardMaterial[] = [];
  const material = (color: string, finish: keyof typeof roughness = 'Matte', metalness = 0) => {
    const value = new MeshStandardMaterial({ color, roughness: metalness ? 0.12 : roughness[finish], metalness });
    materials.push(value);
    return value;
  };
  for (const surface of WALL_SURFACES) {
    const design = getWallDesign(room, wall, surface);
    const frame = wallSurfaceFrame(room.dimensions, wall, surface);
    const face = new Group();
    face.position.set(wallOffset(roomPlan(room.dimensions).walls[wall], frame.origin), 0, surface === 'Exterior' ? -frame.wall.thickness : 0);
    face.rotation.y = surface === 'Exterior' ? Math.PI : 0;
    group.add(face);
    design.items.forEach((item, index) => {
      const object = new Group();
      object.userData.wallItem = item.id;
      object.userData.wallSurface = surface;
      object.position.set(item.u + item.width / 2, item.v + item.height / 2,
        item.kind === 'Paint section' ? 0.002 + index * 0.00002 : 0.004 + index * 0.0005);
      object.rotation.z = item.rotation * Math.PI / 180;
      face.add(object);
      const color = material(item.color, item.finish);
      const solid = (w: number, h: number, d: number, x: number, y: number, z: number, paint = color) => {
        const mesh = new Mesh(new BoxGeometry(w, h, d), paint);
        mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true;
        object.add(mesh); return mesh;
      };
      const { width: w, height: h } = item;
      const depth = Math.max(0.003, item.depth);
      if (item.kind === 'Paint section') {
        object.position.x = object.position.y = object.rotation.z = 0;
        const vertices = wallPaintPolygons(item, isolateWall(room, wall, surface).apertures).flatMap(polygon =>
          polygon.slice(1, -1).flatMap((_, i) => [polygon[0], polygon[i + 1], polygon[i + 2]].flatMap(p => [p.u, p.v, 0])));
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3)); geometry.computeVertexNormals();
        const mesh = new Mesh(geometry, color); mesh.receiveShadow = true; object.add(mesh);
      } else if (item.kind === 'Shelf' || item.kind === 'Wall panel') {
        solid(w, h, depth, 0, 0, depth / 2);
        if (item.kind === 'Wall panel') {
          const groove = material('#776B5C');
          for (let i = 1; i < 6; i++) solid(w * 0.012, h * 0.95, 0.002, -w / 2 + w * i / 6, 0, depth + 0.001, groove);
        }
      } else {
        solid(w, h, depth, 0, 0, depth / 2);
        const innerW = w * 0.87;
        const innerH = h * 0.9;
        const faceColor = material(item.kind === 'Mirror' ? '#C3D7DC' : '#F5EBDD', 'Satin', item.kind === 'Mirror' ? 0.6 : 0);
        solid(innerW, innerH, 0.002, 0, 0, depth + 0.002, faceColor);
        if (item.kind === 'Wall art') {
          const circle = new Mesh(new CircleGeometry(Math.min(w, h) * 0.23, 32), color);
          circle.position.set(w * 0.12, h * 0.13, depth + 0.004); object.add(circle);
          solid(w * 0.62, h * 0.22, 0.002, -w * 0.04, -h * 0.22, depth + 0.004, color);
        }
      }
    });
  }
  return { group, dispose() { materials.forEach(value => value.dispose()); } };
}
