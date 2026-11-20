import {
  Color, CylinderGeometry, DirectionalLight, Group, HemisphereLight, Mesh, MeshStandardMaterial, SpotLight, Vector3,
} from 'three';
import type { Daylight, Light } from '@studio/model';

const conditions: Record<Daylight, { sun: string; sky: string; strength: number; ambient: number; direction: [number, number, number] }> = {
  Morning: { sun: '#fff0d5', sky: '#fff7e4', strength: 2.0, ambient: 1.42, direction: [-8, 5, 2] },
  Afternoon: { sun: '#fff7e8', sky: '#fcfbf4', strength: 2.05, ambient: 1.46, direction: [-4, 7, 5] },
  Evening: { sun: '#ffb16e', sky: '#ffd7af', strength: 1.53, ambient: 0.97, direction: [-8, 3.4, -1] },
  Night: { sun: '#a6b9e8', sky: '#a6b9df', strength: 0.49, ambient: 0.68, direction: [-6, 7, 3] },
};

export function createDaylight() {
  const sky = new HemisphereLight('#fcfbf4', '#bca78e', 1.46);
  const sun = new DirectionalLight('#fff7e8', 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.normalBias = 0.022;
  sun.shadow.bias = -0.00025;
  sun.shadow.radius = 3;
  const fill = new DirectionalLight('#fffefa', 0.62);
  fill.position.set(6, 5, 8);
  const group = new Group();
  group.add(sky, sun, sun.target, fill);
  let target = conditions.Afternoon;
  let targetSun = new Color(target.sun);
  let targetSky = new Color(target.sky);
  const position = new Vector3(...target.direction);
  sun.position.copy(position);
  let size = 1;
  return {
    group,
    update(daylight: Daylight, span: number) {
      target = conditions[daylight];
      targetSun = new Color(target.sun);
      targetSky = new Color(target.sky);
      size = Math.max(1, span / 7);
      position.set(...target.direction).multiplyScalar(size);
      const camera = sun.shadow.camera;
      camera.left = camera.bottom = -span * 0.77;
      camera.right = camera.top = span * 0.77;
      camera.far = span * 3.5;
      camera.updateProjectionMatrix();
    },
    tick(progress: number) {
      sun.color.lerp(targetSun, progress);
      sky.color.lerp(targetSky, progress);
      sun.position.lerp(position, progress);
      sun.intensity += (target.strength - sun.intensity) * progress;
      sky.intensity += (target.ambient - sky.intensity) * progress;
      fill.intensity += ((target === conditions.Night ? 0.18 : 0.62) - fill.intensity) * progress;
    },
    dispose: () => sun.shadow.dispose(),
  };
}

function kelvin(k: number) {
  const t = k / 100;
  const red = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const green = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492;
  const blue = t >= 66 ? 255 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return new Color(`rgb(${[red, green, blue].map(channel => Math.round(Math.min(255, Math.max(0, channel)))).join(',')})`);
}

export function createFixture(light: Light) {
  const group = new Group();
  group.userData.hit = { type: 'light', id: light.id };
  const material = new MeshStandardMaterial({ color: '#eee8dd', roughness: 0.54 });
  const lamp = new Mesh(new CylinderGeometry(0.082, 0.131, 0.082, 24), material);
  group.add(lamp);
  const spot = new SpotLight('#fff3dc', 10, 0, light.kind === 'Spotlight' ? 0.6 : 1.25, 0.65, 2);
  group.add(spot.target, spot);
  const update = (value: Light) => {
    group.position.set(value.x, value.y, value.z);
    const heading = value.direction * (Math.PI / 180);
    const tilt = value.tilt * (Math.PI / 180);
    spot.target.position.set(Math.sin(heading) * Math.sin(tilt), -Math.cos(tilt), -Math.cos(heading) * Math.sin(tilt));
    const color = kelvin(value.warmth);
    spot.color.copy(color);
    spot.intensity = value.brightness * 0.39;
    material.emissive.copy(color);
    material.emissiveIntensity = value.brightness / 130;
  };
  update(light);
  return { group, update, dispose: () => { lamp.geometry.dispose(); material.dispose(); spot.dispose(); } };
}
