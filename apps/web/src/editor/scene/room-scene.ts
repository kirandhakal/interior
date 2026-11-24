import {
  Box3, Box3Helper, Color, DirectionalLight, Group, Mesh, NeutralToneMapping, NoToneMapping, OrthographicCamera, PerspectiveCamera,
  Plane, PlaneGeometry, Raycaster, Scene, ShadowMaterial, Vector2, Vector3,
  WebGLRenderer, PCFShadowMap, SRGBColorSpace, type Object3D,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  FIXTURE_MOUNTS, WALLS, getDisplay, hasDisplay, fitCeilingDecor, fitFurniture, fitLight, fitOpening, isWallMount, openingFits, roomContains, roomPlan,
  wallSpan, wallThickness,
  type CeilingDecor, type LightKind, type Room, type Wall,
} from '@studio/model';
import { createCeiling, createFloor, createWall, roughness, sameOpeningGeometry } from './architecture';
import { createCeilingDecor } from './ceiling-decor';
import { createCeilingFinish } from './ceiling-finish';
import { createAssets, createFurniture, type SceneAssets } from './furniture';
import { createDaylight, createFixture } from './lighting';
import { fixturePlacement } from './fixture-placement';
import type { InteriorPlacement } from '../interior-placement';

type ObjectHit = { type: 'opening' | 'furniture' | 'light' | 'ceilingDecor'; id: string };
export type Hit = { type: 'wall'; wall: Wall } | ObjectHit;
export type View = '3D' | 'Top' | 'Ceiling' | 'Ceiling Outside' | 'Interior';
export const isCeilingView = (view: View) => view === 'Ceiling' || view === 'Ceiling Outside' || view === 'Interior';
export type Tool = 'Select' | 'Move';
export type CameraAction = 'in' | 'out' | 'reset';

type SceneState = {
  room: Room;
  view: View;
  tool: Tool;
  selection: Hit | null;
  interactive: boolean;
  dragFixtures: boolean;
  dragInterior: boolean;
  dragCeilingDecor: boolean;
  onSelect: (selection: Hit) => void;
  onMove: (room: Room, dragStart: Room) => void;
  onPlaceCeiling?: (placement: InteriorPlacement | undefined) => void;
};

function getHit(object: Object3D | null): Hit | undefined {
  for (let current = object; current; current = current.parent) {
    if (!current.visible) return;
    if (current.userData.hit) return current.userData.hit as Hit;
  }
}

function visible(object: Object3D) {
  for (let current: Object3D | null = object; current; current = current.parent) {
    if (!current.visible) return false;
  }
  return true;
}

const threeD = new Vector3(0.81, 0.65, 1);
const above = new Vector3(0, 1.46, 0.0001);
const below = new Vector3(0.72, -1.12, 0.94);
const straightUpPolar = Math.PI - 0.000001;
const yAxis = new Vector3(0, 1, 0);
const emptyDecor: CeilingDecor[] = [];
const defaultViewport = 7;
const insideCeilingFill = { Morning: 1.3, Afternoon: 1.3, Evening: 0.95, Night: 0.62 };
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class RoomScene {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly roomGroup = new Group();
  private readonly camera = new OrthographicCamera(-4, 4, 4, -4, 0.05, 180);
  private readonly interiorCamera = new PerspectiveCamera(69, 1, 0.035, 180);
  private readonly controls: OrbitControls;
  private readonly assets: SceneAssets;
  private readonly daylight = createDaylight();
  private readonly ceilingFill = new DirectionalLight('#fff5e5', 0.36);
  private readonly ground = new Mesh(new PlaneGeometry(140, 140), new ShadowMaterial({ opacity: 0.17, depthWrite: false }));
  private readonly walls = new Map<Wall, ReturnType<typeof createWall>>();
  private readonly furniture = new Map<string, ReturnType<typeof createFurniture>>();
  private readonly lights = new Map<string, ReturnType<typeof createFixture> & { kind: LightKind }>();
  private readonly ceilingDecor = new Map<string, ReturnType<typeof createCeilingDecor>>();
  private floor?: ReturnType<typeof createFloor>;
  private ceiling?: ReturnType<typeof createCeiling>;
  private ceilingFinish?: ReturnType<typeof createCeilingFinish>;
  private previous?: SceneState;
  private state: SceneState;
  private readonly resizeObserver: ResizeObserver;
  private readonly ray = new Raycaster();
  private readonly cursor = new Vector2();
  private readonly point = new Vector3();
  private readonly plane = new Plane();
  private readonly viewTarget = new Vector3();
  private readonly desiredPosition = new Vector3();
  private readonly localPoint = new Vector3();
  private animation = 0;
  private lightUntil = 0;
  private cameraUntil = 0;
  private lastFrame = 0;
  private width = 1;
  private height = 1;
  private down?: { pointer: number; x: number; y: number; hit?: ObjectHit; start: Room; look?: { pitch: number; yaw: number; dragging: boolean } };
  private dragOffset = new Vector3();
  private readonly selectionBox = new Box3();
  private readonly meshBounds = new Box3();
  private readonly selectionHelper = new Box3Helper(this.selectionBox, new Color('#53634a'));
  private shadowDirty = true;

  constructor(private readonly host: HTMLDivElement, state: SceneState) {
    this.state = state;
    this.renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.domElement.setAttribute('aria-label', 'Interactive room preview');
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.restoreContext);
    host.append(this.renderer.domElement);
    this.assets = createAssets();
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.246;
    this.ground.receiveShadow = true;
    this.selectionHelper.visible = false;
    this.interiorCamera.rotation.order = 'YXZ';
    this.ceilingFill.position.set(3, -5, 4);
    this.scene.add(this.roomGroup, this.daylight.group, this.ceilingFill, this.ground, this.selectionHelper);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.19;
    this.controls.enablePan = false;
    this.controls.minZoom = 0.45;
    this.controls.maxZoom = 3.5;
    this.controls.minPolarAngle = 0.0001;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.055;
    this.controls.rotateSpeed = 0.7;
    this.controls.addEventListener('change', this.schedule);
    this.controls.addEventListener('start', this.stopCamera);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(host);
    host.addEventListener('pointerdown', this.pointerDown, true);
    host.addEventListener('pointermove', this.pointerMove);
    host.addEventListener('pointerup', this.pointerUp);
    host.addEventListener('pointercancel', this.pointerCancel);
    host.addEventListener('wheel', this.interiorWheel, { passive: false });
    this.update(state);
    this.resize();
  }

  private contextLost = (event: Event) => event.preventDefault();

  private restoreContext = () => {
    this.shadowDirty = true;
    this.schedule();
  };

  private resize = () => {
    const { width, height } = this.host.getBoundingClientRect();
    if (!width || !height || (width === this.width && height === this.height)) return;
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.frameCamera();
    this.schedule();
  };

  private frameCamera() {
    const dimensions = this.state.room.dimensions;
    const { height } = dimensions;
    const { length, width } = roomPlan(dimensions).outerBounds;
    const aspect = this.width / this.height;
    this.interiorCamera.aspect = aspect;
    this.interiorCamera.updateProjectionMatrix();
    const span = Math.hypot(length, width);
    const { view } = this.state;
    const scale = view === 'Top' || view === 'Ceiling'
      ? Math.max(width * 1.28, length * 1.28 / aspect)
      : Math.max(span * 0.91 + height * 0.2, height * 1.45, span * 1.11 / aspect);
    const half = scale * (view === 'Ceiling Outside' ? 0.54 : 0.5);
    this.camera.top = half;
    this.camera.bottom = -half;
    this.camera.left = -half * aspect;
    this.camera.right = half * aspect;
    this.camera.updateProjectionMatrix();
  }

  private setCamera(instant: boolean) {
    const dimensions = this.state.room.dimensions;
    const { height } = dimensions;
    const { inner, center, bounds: { length, width }, outerBounds } = roomPlan(dimensions);
    const view = this.state.view;
    if (view === 'Interior') {
      const corner = inner[2];
      this.interiorCamera.position.set(center.x + (corner.x - center.x) * 0.76, Math.min(height * 0.5, 1.55),
        center.z + (corner.z - center.z) * 0.76);
      this.interiorCamera.lookAt(center.x + (inner[0].x - center.x) * 0.24, height * 0.53, center.z + (inner[0].z - center.z) * 0.44);
      this.interiorCamera.zoom = 1;
      this.cameraUntil = 0;
      this.frameCamera();
      this.schedule();
      return;
    }
    const scale = Math.max(length, width, defaultViewport);
    if (view === 'Ceiling') {
      this.viewTarget.set(center.x, height, center.z);
      this.desiredPosition.set(center.x, 0.04, center.z + 0.00001);
    } else {
      const outside = view === 'Ceiling Outside';
      const direction = outside ? below : view === 'Top' ? above : threeD;
      this.viewTarget.set(outerBounds.center.x, view === 'Top' ? 0 : height * (outside ? 0.55 : 0.47), outerBounds.center.z);
      this.desiredPosition.copy(direction).normalize().multiplyScalar(scale * 2).add(this.viewTarget);
    }
    this.camera.zoom = 1;
    this.frameCamera();
    this.animateCamera(instant || view === 'Ceiling');
  }

  private animateCamera(instant = false) {
    if (instant || reduceMotion()) {
      // Clear any orbit momentum so a fixed plan view keeps its heading.
      this.controls.enableDamping = false;
      this.controls.update();
      this.camera.position.copy(this.desiredPosition);
      this.controls.target.copy(this.viewTarget);
      this.controls.update();
      this.controls.enableDamping = true;
      this.cameraUntil = 0;
    } else {
      this.cameraUntil = performance.now() + 380;
    }
    this.schedule();
  }

  private revealWall(wall: Wall) {
    const offset = this.localPoint.copy(this.camera.position).sub(this.controls.target);
    const normal = this.walls.get(wall)?.normal;
    if (!normal || this.state.view !== '3D') return;
    const facing = normal.dot(offset);
    if (facing < -0.15) return;
    const across = Math.abs(normal.x * offset.z - normal.z * offset.x);
    this.viewTarget.copy(this.controls.target);
    this.desiredPosition.copy(offset).addScaledVector(normal, -facing - Math.max(2, Math.abs(facing), across * 0.63));
    this.desiredPosition.add(this.viewTarget);
    this.animateCamera();
  }

  private stopCamera = () => { this.cameraUntil = 0; };

  private get activeCamera() {
    return this.state.view === 'Interior' ? this.interiorCamera : this.camera;
  }

  private interiorWheel = (event: WheelEvent) => {
    if (this.state.view !== 'Interior' || !this.state.interactive || !event.deltaY) return;
    event.preventDefault();
    this.act(event.deltaY < 0 ? 'in' : 'out');
  };

  act(action: CameraAction) {
    if (action === 'reset') { this.setCamera(false); return; }
    const camera = this.activeCamera;
    const zoom = camera.zoom * (action === 'in' ? 1.22 : 1 / 1.22);
    const [minZoom, maxZoom] = this.state.view === 'Interior' ? [0.75, 2.6] : [this.controls.minZoom, this.controls.maxZoom];
    camera.zoom = Math.min(maxZoom, Math.max(minZoom, zoom));
    camera.updateProjectionMatrix();
    this.schedule();
  }

  update(state: SceneState) {
    const previous = this.previous;
    const room = state.room;
    const oldRoom = previous?.room;
    const switchedRoom = room.id !== oldRoom?.id;
    const dimensions = room.dimensions;
    const oldDimensions = oldRoom?.dimensions;
    const footprintChanged = !oldDimensions || WALLS.some(wall => wallSpan(dimensions, wall) !== wallSpan(oldDimensions, wall));
    const floorChanged = !oldDimensions || footprintChanged || WALLS.some(wall => wallThickness(dimensions, wall) !== wallThickness(oldDimensions, wall));
    const resized = floorChanged || dimensions.height !== oldDimensions?.height;
    const sameLayout = oldRoom && !resized;
    const ceilingView = isCeilingView(state.view);
    const straightUp = state.view === 'Ceiling';
    const inside = state.view === 'Interior';
    this.shadowDirty ||= resized || state.view !== previous?.view || room.ceilingDecor !== oldRoom?.ceilingDecor || room.openings !== oldRoom?.openings ||
      room.furniture !== oldRoom?.furniture || room.daylight !== oldRoom?.daylight;
    this.state = state;
    this.previous = state;
    this.renderer.toneMapping = inside ? NeutralToneMapping : NoToneMapping;
    this.controls.enabled = state.interactive && !inside;
    this.controls.enableRotate = state.view === '3D' || state.view === 'Ceiling Outside';
    this.controls.minPolarAngle = straightUp ? straightUpPolar : ceilingView ? Math.PI / 2 + 0.24 : 0.0001;
    this.controls.maxPolarAngle = straightUp ? straightUpPolar : ceilingView ? Math.PI - 0.18 : Math.PI / 2 - 0.055;
    this.ceilingFill.visible = ceilingView;
    this.ceilingFill.intensity = straightUp ? insideCeilingFill[room.daylight] : inside ? insideCeilingFill[room.daylight] * 0.43 : 0.36;
    if (floorChanged) {
      if (this.floor) {
        this.roomGroup.remove(this.floor.group);
        this.floor.dispose();
      }
      this.floor = createFloor(dimensions, this.assets);
      this.roomGroup.add(this.floor.group);
    }
    if (resized) {
      if (this.ceiling) {
        this.roomGroup.remove(this.ceiling.group);
        this.ceiling.dispose();
      }
      this.ceiling = createCeiling(dimensions);
      this.roomGroup.add(this.ceiling.group);
    }
    if (footprintChanged || dimensions.height !== oldDimensions?.height || room.ceilingFinish !== oldRoom?.ceilingFinish) {
      if (this.ceilingFinish) {
        this.roomGroup.remove(this.ceilingFinish.group);
        this.ceilingFinish.dispose();
        this.ceilingFinish = undefined;
      }
      if (room.ceilingFinish && room.ceilingFinish !== 'Plain plaster') {
        this.ceilingFinish = createCeilingFinish(room.dimensions, room.ceilingFinish);
        this.roomGroup.add(this.ceilingFinish.group);
      }
    }
    if (resized || room.ceilingDecor !== oldRoom?.ceilingDecor) {
      const decor = room.ceilingDecor ?? emptyDecor;
      const ids = new Set(decor.map(item => item.id));
      for (const [id, current] of this.ceilingDecor) {
        if (ids.has(id)) continue;
        this.roomGroup.remove(current.group);
        current.dispose();
        this.ceilingDecor.delete(id);
      }
      for (const item of decor) {
        let current = this.ceilingDecor.get(item.id);
        if (!current || current.kind !== item.kind) {
          if (current) {
            this.roomGroup.remove(current.group);
            current.dispose();
          }
          current = createCeilingDecor(item.kind);
          current.group.userData.hit = { type: 'ceilingDecor', id: item.id };
          this.ceilingDecor.set(item.id, current);
          this.roomGroup.add(current.group);
        }
        current.update(item, room.dimensions);
      }
    }
    if (room.walls !== oldRoom?.walls || room.openings !== oldRoom?.openings || !sameLayout || previous?.selection !== state.selection) {
      for (const wall of WALLS) {
        const openings = room.openings.filter(item => item.wall === wall);
        const existing = this.walls.get(wall);
        if (!existing || !sameLayout || existing.openings.length !== openings.length ||
            existing.openings.some((item, index) => !sameOpeningGeometry(item, openings[index]))) {
          if (existing) {
            this.roomGroup.remove(existing.group);
            existing.dispose();
          }
          const newWall = createWall(room, wall, openings, this.assets);
          this.walls.set(wall, newWall);
          this.roomGroup.add(newWall.group);
        }
        const target = this.walls.get(wall)!;
        for (const opening of openings) target.openingModels.get(opening.id)?.update(opening);
        target.material.color.set(room.walls[wall].color);
        target.material.roughness = roughness[room.walls[wall].finish];
        target.outline.visible = state.selection?.type === 'wall' && state.selection.wall === wall;
      }
    }
    if (oldRoom?.furniture !== room.furniture || resized) {
      const ids = new Set(room.furniture.map(item => item.id));
      for (const [id, current] of this.furniture) {
        if (!ids.has(id)) {
          this.roomGroup.remove(current.group);
          current.dispose();
          this.furniture.delete(id);
        }
      }
      for (const item of room.furniture) {
        let current = this.furniture.get(item.id);
        const screens = hasDisplay(item.kind) ? (item.display ?? getDisplay(item.kind)).count : undefined;
        if (!current || current.kind !== item.kind || current.color !== item.color || current.screens !== screens) {
          if (current) {
            this.roomGroup.remove(current.group);
            current.dispose();
          }
          current = createFurniture(item, this.assets);
          current.group.userData.hit = { type: 'furniture', id: item.id };
          this.furniture.set(item.id, current);
          this.roomGroup.add(current.group);
        }
        current.update(item, room.dimensions.height);
      }
    }
    if (oldRoom?.lights !== room.lights || resized) {
      const ids = new Set(room.lights.map(light => light.id));
      for (const [id, current] of this.lights) {
        if (!ids.has(id)) {
          this.roomGroup.remove(current.group);
          current.dispose();
          this.lights.delete(id);
        }
      }
      for (const light of room.lights) {
        let current = this.lights.get(light.id);
        if (!current || current.kind !== light.kind) {
          if (current) {
            this.roomGroup.remove(current.group);
            current.dispose();
          }
          current = { ...createFixture(light, room.dimensions), kind: light.kind };
          this.lights.set(light.id, current);
          this.roomGroup.add(current.group);
        } else current.update(light, room.dimensions);
      }
    }
    if (resized || room.daylight !== oldRoom?.daylight) {
      const { length, width } = roomPlan(room.dimensions).outerBounds;
      this.daylight.update(room.daylight, Math.max(4.5, width, length, room.dimensions.height));
      if (!previous || reduceMotion()) this.daylight.tick(1);
      else this.lightUntil = performance.now() + 450;
    }
    if (switchedRoom || state.view !== previous?.view || resized) {
      if (state.view !== previous?.view) this.down = undefined;
      this.setCamera(!previous || previous.view === 'Ceiling' || previous.view === 'Interior' || ceilingView !== isCeilingView(previous.view));
    }
    else if (!this.down && state.selection) {
      const hit = state.selection;
      const mount = hit.type === 'light' ? room.lights.find(light => light.id === hit.id)?.mount : undefined;
      const previousMount = hit.type === 'light' ? oldRoom?.lights.find(light => light.id === hit.id)?.mount : undefined;
      if (state.selection !== previous?.selection || mount !== previousMount) {
        const reveal = hit.type === 'wall' ? hit.wall
          : hit.type === 'opening' ? room.openings.find(o => o.id === hit.id)?.wall
          : isWallMount(mount) ? mount : undefined;
        if (reveal) this.revealWall(reveal);
      }
    }
    this.schedule();
  }

  private schedule = () => {
    if (!this.animation) this.animation = requestAnimationFrame(this.render);
  };

  private render = (now: number) => {
    const elapsed = Math.min(40, now - this.lastFrame);
    this.lastFrame = now;
    if (this.cameraUntil) {
      const progress = now >= this.cameraUntil ? 1 : 1 - Math.exp(-elapsed / 70);
      this.camera.position.lerp(this.desiredPosition, progress);
      this.controls.target.lerp(this.viewTarget, progress);
      if (progress === 1) this.cameraUntil = 0;
    }
    if (this.lightUntil) {
      const progress = now >= this.lightUntil ? 1 : 1 - Math.exp(-elapsed / 88);
      this.daylight.tick(progress);
      this.shadowDirty = true;
      if (progress === 1) this.lightUntil = 0;
    }
    const inside = this.state.view === 'Interior';
    const moved = !inside && this.controls.update();
    const isTop = this.state.view === 'Top' && this.controls.getPolarAngle() < 0.2;
    const isCeiling = isCeilingView(this.state.view);
    const ceilingOnly = isCeiling && !inside;
    const straightUp = this.state.view === 'Ceiling';
    const selected = this.state.selection;
    const swingProgress = reduceMotion() ? 1 : 1 - Math.exp(-elapsed / 50);
    let swinging = false;
    this.ground.visible = !isCeiling;
    if (this.floor) this.floor.group.visible = !ceilingOnly;
    if (this.ceiling) {
      this.ceiling.slab.visible = isCeiling;
      this.ceiling.boundary.visible = isCeiling && !!this.state.onPlaceCeiling;
    }
    if (this.ceilingFinish) this.ceilingFinish.group.visible = isCeiling;
    for (const [id, item] of this.furniture) {
      item.group.visible = !ceilingOnly;
      item.showSwingGuides(isTop && selected?.type === 'furniture' && selected.id === id);
      if (item.tickSwing(swingProgress)) swinging = true;
    }
    for (const item of this.ceilingDecor.values()) item.group.visible = !isTop;
    this.localPoint.copy(this.camera.position).sub(this.controls.target).setY(0).normalize();
    for (const [wall, mesh] of this.walls) {
      const shown = isTop || straightUp || inside || mesh.normal.dot(this.localPoint) < 0.03;
      const height = isTop ? 0.065 : 1;
      if (mesh.group.visible !== shown || mesh.group.scale.y !== height) this.shadowDirty = true;
      mesh.group.visible = shown;
      mesh.group.scale.y = height;
      for (const [id, opening] of mesh.openingModels) {
        opening.showSwingGuide(isTop && selected?.type === 'opening' && selected.id === id);
        if (opening.tickSwing(swingProgress)) swinging = true;
      }
      const rim = this.ceiling?.rim.get(wall);
      if (rim) rim.visible = shown && !isTop && !isCeiling;
    }
    for (const light of this.state.room.lights) {
      const fixture = this.lights.get(light.id);
      if (fixture) fixture.model.visible = ceilingOnly ? light.mount === 'Ceiling'
        : !isWallMount(light.mount) || !!this.walls.get(light.mount)?.group.visible;
    }
    let object: Object3D | undefined;
    if (selected?.type === 'furniture') object = this.furniture.get(selected.id)?.group;
    if (selected?.type === 'ceilingDecor') object = this.ceilingDecor.get(selected.id)?.group;
    if (selected?.type === 'light') object = this.lights.get(selected.id)?.model;
    if (selected?.type === 'opening') {
      const wall = this.state.room.openings.find(item => item.id === selected.id)?.wall;
      object = wall ? this.walls.get(wall)?.openingModels.get(selected.id)?.group : undefined;
    }
    this.selectionHelper.visible = !!object && visible(object);
    if (object && this.selectionHelper.visible) {
      object.updateWorldMatrix(true, true);
      this.selectionBox.makeEmpty();
      object.traverseVisible(child => {
        if (!(child instanceof Mesh)) return;
        const geometry = child.geometry;
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        if (geometry.boundingBox) this.selectionBox.union(this.meshBounds.copy(geometry.boundingBox).applyMatrix4(child.matrixWorld));
      });
      this.selectionBox.expandByScalar(0.018);
    }
    if (this.shadowDirty || swinging) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowDirty = false;
    }
    this.renderer.render(this.scene, this.activeCamera);
    this.animation = 0;
    if (moved || swinging || this.cameraUntil || this.lightUntil) this.schedule();
  };

  private cast(event: { clientX: number; clientY: number }) {
    const bounds = this.host.getBoundingClientRect();
    this.cursor.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    const camera = this.activeCamera;
    camera.updateMatrixWorld();
    this.ray.setFromCamera(this.cursor, camera);
  }

  private pick(event: PointerEvent) {
    this.cast(event);
    for (const result of this.ray.intersectObject(this.roomGroup, true)) {
      if (visible(result.object)) {
        const hit = getHit(result.object);
        if (hit) return hit;
      }
    }
  }

  dropFixture(kind: LightKind, clientX: number, clientY: number) {
    this.cast({ clientX, clientY });
    const { room, view } = this.state;
    if (isCeilingView(view)) {
      const point = this.ceilingPoint();
      return point && FIXTURE_MOUNTS[kind].includes('Ceiling') ? { ...point, y: room.dimensions.height, mount: 'Ceiling' as const } : undefined;
    }
    if (view === '3D') {
      const walls = [...this.walls.values()].map(wall => wall.group);
      for (const intersection of this.ray.intersectObjects(walls, true)) {
        if (!visible(intersection.object)) continue;
        const hit = getHit(intersection.object);
        if (hit?.type === 'wall') {
          return fixturePlacement(this.ray.ray, room.dimensions, kind, { wall: hit.wall, point: intersection.point });
        }
        if (hit?.type === 'opening') break;
      }
    }
    return fixturePlacement(this.ray.ray, room.dimensions, kind);
  }

  private ceilingPoint() {
    const dimensions = this.state.room.dimensions;
    const point = this.ray.ray.intersectPlane(new Plane(yAxis, -dimensions.height), this.point);
    if (point && roomContains(dimensions, point)) return { x: point.x, z: point.z };
  }

  dropCeilingDecor(clientX: number, clientY: number) {
    if (!isCeilingView(this.state.view)) return;
    this.cast({ clientX, clientY });
    return this.ceilingPoint();
  }

  dropInterior(clientX: number, clientY: number) {
    if (isCeilingView(this.state.view)) return;
    this.cast({ clientX, clientY });
    const point = this.ray.ray.intersectPlane(new Plane(yAxis, 0), this.point);
    if (point && roomContains(this.state.room.dimensions, point)) return { x: point.x, z: point.z };
  }

  private pointerDown = (event: PointerEvent) => {
    if (!this.state.interactive || event.button !== 0) return;
    if (this.down) {
      if (this.down.hit) return;
      this.down = undefined;
      return;
    }
    const { room, tool, dragFixtures, dragInterior, dragCeilingDecor, view, onPlaceCeiling } = this.state;
    this.down = { pointer: event.pointerId, x: event.clientX, y: event.clientY, start: room };
    if (view === 'Interior') {
      const { x: pitch, y: yaw } = this.interiorCamera.rotation;
      this.down.look = { pitch, yaw, dragging: false };
      this.renderer.domElement.setPointerCapture(event.pointerId);
    }
    if (onPlaceCeiling) return;
    if (tool !== 'Move' && !dragFixtures && !dragInterior && !dragCeilingDecor) return;
    const hit = this.pick(event);
    if (!hit || hit.type === 'wall') return;
    if (tool !== 'Move' && !((hit.type === 'light' && dragFixtures) || (hit.type === 'furniture' && dragInterior) ||
      (hit.type === 'ceilingDecor' && dragCeilingDecor))) return;

    if (hit.type === 'opening') {
      if (view === 'Top' || view === 'Ceiling') return;
      const opening = room.openings.find(item => item.id === hit.id)!;
      const wall = this.walls.get(opening.wall)!;
      this.plane.setFromNormalAndCoplanarPoint(wall.normal, wall.group.position);
      if (!this.ray.ray.intersectPlane(this.plane, this.point)) return;
      wall.group.worldToLocal(this.point);
      this.dragOffset.set(opening.offset - this.point.x, opening.sill - this.point.y, 0);
    } else {
      this.plane.set(yAxis, 0);
      let anchor: Vector3;
      if (hit.type === 'light') {
        const light = room.lights.find(item => item.id === hit.id)!;
        const wall = isWallMount(light.mount) ? light.mount : undefined;
        if (wall && view === 'Top') return;
        anchor = this.localPoint.set(light.x, light.y, light.z);
        this.plane.setFromNormalAndCoplanarPoint(wall ? this.walls.get(wall)!.normal : yAxis, anchor);
      } else if (hit.type === 'ceilingDecor') {
        const item = room.ceilingDecor?.find(value => value.id === hit.id);
        if (!item) return;
        anchor = this.localPoint.set(item.x, room.dimensions.height, item.z);
        this.plane.setFromNormalAndCoplanarPoint(yAxis, anchor);
      } else {
        const furniture = room.furniture.find(item => item.id === hit.id)!;
        anchor = this.localPoint.set(furniture.x, 0, furniture.z);
      }
      if (!this.ray.ray.intersectPlane(this.plane, this.point)) return;
      this.dragOffset.copy(anchor).sub(this.point);
    }

    event.stopPropagation();
    this.stopCamera();
    this.renderer.domElement.setPointerCapture(event.pointerId);
    this.down.hit = hit;
    this.state.onSelect(hit);
  };

  private pointerMove = (event: PointerEvent) => {
    const down = this.down;
    if (!down || down.pointer !== event.pointerId) return;
    const dx = event.clientX - down.x;
    const dy = event.clientY - down.y;
    const distance = Math.hypot(dx, dy);
    if (!down.hit) {
      if (down.look && (distance >= 6 || down.look.dragging)) {
        down.look.dragging = true;
        this.interiorCamera.rotation.set(Math.max(-1.36, Math.min(1.36, down.look.pitch + dy * 0.0045)), down.look.yaw + dx * 0.0045, 0);
        this.schedule();
      }
      return;
    }
    if (distance < 3) return;
    this.cast(event);
    if (!this.ray.ray.intersectPlane(this.plane, this.point)) return;
    const hit = down.hit;
    const room = this.state.room;
    if (hit.type === 'opening') {
      const opening = room.openings.find(item => item.id === hit.id);
      if (!opening) return;
      this.walls.get(opening.wall)?.group.worldToLocal(this.point);
      const next = fitOpening(room.dimensions, { ...opening, offset: this.point.x + this.dragOffset.x, sill: this.point.y + this.dragOffset.y });
      if (openingFits(room, next)) this.state.onMove({ ...room, openings: room.openings.map(item => item.id === hit.id ? next : item) }, down.start);
      return;
    }

    this.point.add(this.dragOffset);
    const { x, y, z } = this.point;
    if (hit.type === 'furniture') {
      const items = room.furniture.map(item => item.id === hit.id ? fitFurniture(room.dimensions, { ...item, x, z }) : item);
      this.state.onMove({ ...room, furniture: items }, down.start);
    } else if (hit.type === 'ceilingDecor') {
      const items = (room.ceilingDecor ?? emptyDecor).map(item => item.id === hit.id ? fitCeilingDecor(room.dimensions, { ...item, x, z }) : item);
      this.state.onMove({ ...room, ceilingDecor: items }, down.start);
    } else {
      const lights = room.lights.map(item => item.id === hit.id ? fitLight(room.dimensions, { ...item, x, y, z }) : item);
      this.state.onMove({ ...room, lights }, down.start);
    }
  };

  private pointerUp = (event: PointerEvent) => {
    const down = this.down;
    if (!down || down.pointer !== event.pointerId) return;
    this.down = undefined;
    if (!down.hit && !down.look?.dragging && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 6) {
      if (this.state.onPlaceCeiling) {
        this.state.onPlaceCeiling(this.dropCeilingDecor(event.clientX, event.clientY));
        return;
      }
      const hit = this.pick(event);
      if (hit) this.state.onSelect(hit);
    }
  };

  private pointerCancel = (event: PointerEvent) => {
    if (this.down?.pointer === event.pointerId) this.down = undefined;
  };

  dispose() {
    cancelAnimationFrame(this.animation);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.host.removeEventListener('pointerdown', this.pointerDown, true);
    this.host.removeEventListener('pointermove', this.pointerMove);
    this.host.removeEventListener('pointerup', this.pointerUp);
    this.host.removeEventListener('pointercancel', this.pointerCancel);
    this.host.removeEventListener('wheel', this.interiorWheel);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.contextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.restoreContext);
    this.renderer.domElement.remove();
    this.floor?.dispose();
    this.ceiling?.dispose();
    this.ceilingFinish?.dispose();
    for (const wall of this.walls.values()) wall.dispose();
    for (const item of this.furniture.values()) item.dispose();
    for (const light of this.lights.values()) light.dispose();
    for (const item of this.ceilingDecor.values()) item.dispose();
    this.daylight.dispose();
    for (const [key, asset] of Object.entries(this.assets)) {
      if (key === 'leaf' || key === 'textures') (asset as SceneAssets['leaf'] | SceneAssets['textures']).forEach(item => item.dispose());
      else if (!Array.isArray(asset)) asset.dispose();
    }
    this.selectionHelper.dispose();
    this.ground.geometry.dispose();
    this.ground.material.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
