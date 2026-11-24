import {
  BoxGeometry, CatmullRomCurve3, Color, CylinderGeometry, DirectionalLight, DoubleSide, Group, HemisphereLight, Mesh, MeshStandardMaterial,
  PointLight, SphereGeometry, SpotLight, TorusGeometry, TubeGeometry, Vector3, type BufferGeometry,
} from 'three';
import { isPointFixture, isWallMount, roomPlan, type Daylight, type Dimensions, type Light, type LightKind } from '@studio/model';

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

const vertical = new Vector3(0, 1, 0);
const horizontal = new Vector3(1, 0, 0);
const beamWidths: Partial<Record<LightKind, number>> = { Spotlight: 0.42, 'Wall sconce': 0.84, 'LED strip': 1.28 };

function createHousing(kind: LightKind) {
  const body = new Group();
  const frame = new MeshStandardMaterial({ color: '#65645a', roughness: 0.44, metalness: 0.36 });
  const shade = new MeshStandardMaterial({ color: '#d0baa1', roughness: 0.85, side: DoubleSide });
  const diffuser = new MeshStandardMaterial({ color: '#f4eadd', roughness: 0.57 });
  const add = (geometry: BufferGeometry, material: MeshStandardMaterial, y: number, x = 0, z = 0) => {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    body.add(mesh);
    return mesh;
  };
  const suspension = (length: number) => {
    add(new CylinderGeometry(0.09, 0.08, 0.035, 24), frame, -0.019);
    add(new CylinderGeometry(0.012, 0.012, length, 12), frame, -length / 2);
  };
  let sourceY = -0.14;
  switch (kind) {
    case 'Bulb':
      add(new CylinderGeometry(0.055, 0.057, 0.085, 20), frame, -0.044);
      add(new SphereGeometry(0.075, 24, 12), diffuser, -0.138);
      sourceY = -0.17;
      break;
    case 'Floor lamp':
      add(new CylinderGeometry(0.19, 0.22, 0.046, 24), frame, 0.023);
      add(new CylinderGeometry(0.018, 0.024, 1.17, 14), frame, 0.62);
      add(new CylinderGeometry(0.15, 0.23, 0.25, 28, 1, true), shade, 1.23);
      add(new SphereGeometry(0.07, 20, 12), diffuser, 1.17);
      sourceY = 1.14;
      break;
    case 'Wall sconce':
      add(new BoxGeometry(0.18, 0.052, 0.27), frame, -0.027);
      add(new CylinderGeometry(0.038, 0.038, 0.09, 16), frame, -0.085);
      add(new BoxGeometry(0.22, 0.155, 0.22), shade, -0.178);
      add(new BoxGeometry(0.179, 0.011, 0.179), diffuser, -0.26);
      sourceY = -0.27;
      break;
    case 'Ceiling light':
      add(new CylinderGeometry(0.205, 0.199, 0.045, 32), frame, -0.023);
      add(new CylinderGeometry(0.186, 0.175, 0.063, 32), diffuser, -0.077);
      sourceY = -0.12;
      break;
    case 'Spotlight':
      add(new CylinderGeometry(0.086, 0.086, 0.044, 24), frame, -0.022);
      add(new CylinderGeometry(0.064, 0.092, 0.12, 24), frame, -0.104);
      add(new CylinderGeometry(0.075, 0.075, 0.014, 24), diffuser, -0.171);
      sourceY = -0.19;
      break;
    case 'LED strip':
      add(new BoxGeometry(0.84, 0.042, 0.085), frame, -0.021);
      add(new BoxGeometry(0.79, 0.018, 0.055), diffuser, -0.05);
      sourceY = -0.07;
      break;
    case 'Pendant light':
      suspension(0.43);
      add(new CylinderGeometry(0.087, 0.249, 0.196, 36, 1, true), shade, -0.49);
      add(new SphereGeometry(0.077, 24, 12), diffuser, -0.559);
      sourceY = -0.63;
      break;
    case 'Chandelier':
      frame.color.set('#947043');
      suspension(0.56);
      add(new TorusGeometry(0.305, 0.021, 10, 42), frame, -0.53).rotation.x = Math.PI / 2;
      for (let i = 0; i < 6; i++) {
        const angle = Math.PI * i / 3;
        const x = Math.cos(angle) * 0.305;
        const z = Math.sin(angle) * 0.305;
        const arm = new CatmullRomCurve3([new Vector3(0, -0.56, 0), new Vector3(x * 0.63, -0.6, z * 0.63), new Vector3(x, -0.53, z)]);
        add(new TubeGeometry(arm, 12, 0.013, 6), frame, 0);
        add(new CylinderGeometry(0.022, 0.027, 0.079, 16), shade, -0.481, x, z);
        add(new SphereGeometry(0.031, 14, 10), diffuser, -0.422, x, z).scale.y = 1.42;
      }
      sourceY = -0.43;
      break;
    case 'Fairy lights': {
      const wire = (x: number) => new Vector3(x, -0.025 - 0.24 * (1 - (x / 0.54) ** 2), 0.075 * Math.cos(x * 5));
      const curve = new CatmullRomCurve3(Array.from({ length: 13 }, (_, i) => wire(i * 0.09 - 0.54)));
      add(new TubeGeometry(curve, 28, 0.007, 6), frame, 0);
      for (let i = 0; i < 11; i++) {
        const { x, y, z } = wire(i * 0.1 - 0.5);
        add(new SphereGeometry(0.025, 12, 8), diffuser, y - 0.018, x, z);
      }
      sourceY = -0.29;
      break;
    }
  }
  return {
    body, diffuser, sourceY,
    dispose() {
      for (const mesh of body.children) (mesh as Mesh).geometry.dispose();
      frame.dispose();
      shade.dispose();
      diffuser.dispose();
    },
  };
}

export function createFixture(light: Light, dimensions: Dimensions) {
  const group = new Group();
  const model = new Group();
  model.userData.hit = { type: 'light', id: light.id };
  const housing = createHousing(light.kind);
  model.add(housing.body);
  const beam = isPointFixture(light.kind) ? new PointLight() : new SpotLight('#fff3dc', 0, 0, beamWidths[light.kind] ?? 1.17, 0.64);
  group.add(model, beam);
  if (beam instanceof SpotLight) group.add(beam.target);
  const color = new Color();
  const aim = new Vector3();

  const update = (value: Light, dimensions: Dimensions) => {
    const wall = isWallMount(value.mount) ? roomPlan(dimensions).walls[value.mount] : undefined;
    const heading = wall ? -Math.atan2(wall.tangent.z, wall.tangent.x) : 0;
    group.position.set(value.x, value.y, value.z);
    model.rotation.y = heading;
    housing.body.rotation.x = wall ? -Math.PI / 2 : 0;
    beam.position.set(0, housing.sourceY, 0).applyAxisAngle(horizontal, housing.body.rotation.x).applyAxisAngle(vertical, heading);

    if (beam instanceof SpotLight) {
      const azimuth = value.direction * Math.PI / 180;
      const tilt = value.tilt * Math.PI / 180;
      aim.set(Math.sin(azimuth) * Math.sin(tilt), -Math.cos(tilt), (wall ? 1 : -1) * Math.cos(azimuth) * Math.sin(tilt));
      if (wall) aim.applyAxisAngle(vertical, heading);
      beam.target.position.copy(beam.position).add(aim);
    }
    color.copy(kelvin(value.warmth));
    beam.color.copy(color);
    if (value.enabled === false) beam.intensity = 0;
    else if (value.lumens !== undefined) beam.power = value.lumens;
    else beam.intensity = value.brightness * 0.39;
    housing.diffuser.emissive.copy(color);
    housing.diffuser.emissiveIntensity = Math.min(1.6, Math.sqrt(beam.intensity) / 8);
  };

  update(light, dimensions);
  return { group, model, update, dispose: () => { housing.dispose(); beam.dispose(); } };
}
