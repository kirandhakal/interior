import { ExtrudeGeometry, Shape, ShapeGeometry, ShapeUtils, Vector2 } from 'three';
import { planBounds, type PlanPoint } from '@studio/dimensions';
import { turn } from '@studio/polygon';

export function triangulatePlan(points: readonly PlanPoint[]) {
  return ShapeUtils.triangulateShape(points.map(({ x, z }) => new Vector2(x, z)), []).map(([a, b, c]) => {
    return turn(points[a], points[b], points[c]) < 0 ? [points[a], points[c], points[b]] : [points[a], points[b], points[c]];
  });
}

function planShape(points: readonly PlanPoint[], zSign = -1) {
  const shape = new Shape();
  const [start, ...rest] = points;
  shape.moveTo(start.x, zSign * start.z);
  for (const point of rest) shape.lineTo(point.x, zSign * point.z);
  shape.closePath();
  return shape;
}

export function planPrism(points: readonly PlanPoint[], y: number, height: number) {
  return new ExtrudeGeometry(planShape(points), { depth: height, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, y, 0);
}

export function planFace(points: readonly PlanPoint[], y: number, downward = false) {
  const zSign = downward ? 1 : -1;
  const geometry = new ShapeGeometry(planShape(points, zSign));
  const { minX, minZ, maxZ, length, width } = planBounds(points);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i++) {
    const z = position.getY(i) * zSign;
    uv.setXY(i, (position.getX(i) - minX) / length, (downward ? z - minZ : maxZ - z) / width);
  }
  return geometry.rotateX(downward ? Math.PI / 2 : -Math.PI / 2).translate(0, y, 0);
}
