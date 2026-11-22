import { BufferGeometry, Group, LineSegments, Vector3, type LineBasicMaterial } from 'three';

export type Swing = ReturnType<typeof createSwing>;

export function createSwing(parent: Group, x: number, z: number, direction: 1 | -1, reach: number, stroke?: LineBasicMaterial) {
  const pivot = new Group();
  pivot.position.set(x, 0, z);
  parent.add(pivot);
  let target: number | undefined;
  let guide: LineSegments | undefined;
  if (stroke) {
    const origin = new Vector3(0, 0, 0);
    const points = [origin, new Vector3(direction * reach, 0, 0)];
    for (let segment = 0; segment < 24; segment++) {
      for (const index of [segment, segment + 1]) {
        const angle = Math.PI * index / 48;
        points.push(new Vector3(direction * reach * Math.cos(angle), 0, reach * Math.sin(angle)));
      }
    }
    points.push(new Vector3(0, 0, reach), origin);
    guide = new LineSegments(new BufferGeometry().setFromPoints(points), stroke);
    guide.position.set(x, 0.025, z);
    guide.renderOrder = 2;
    guide.visible = false;
    guide.raycast = () => {};
    parent.add(guide);
  }
  return {
    pivot,
    setAngle(degrees: number) {
      const radians = -direction * degrees * Math.PI / 180;
      if (target === undefined) pivot.rotation.y = radians;
      target = radians;
    },
    advance(progress: number) {
      if (target === undefined || target === pivot.rotation.y) return false;
      const delta = target - pivot.rotation.y;
      pivot.rotation.y = Math.abs(delta) < 0.002 || progress === 1 ? target : pivot.rotation.y + delta * progress;
      return true;
    },
    showGuide(show: boolean) { if (guide) guide.visible = show; },
  };
}
