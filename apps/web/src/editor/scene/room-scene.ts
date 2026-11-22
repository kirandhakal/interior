import {
  Box3, Box3Helper, Color, Group, Mesh, OrthographicCamera, Plane, PlaneGeometry, Raycaster, Scene, ShadowMaterial, Vector2, Vector3,
  WebGLRenderer, PCFShadowMap, SRGBColorSpace, type Object3D,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  WALLS, getDisplay, hasDisplay, fitFurniture, fitLight, fitOpening, isWallMount, openingFits, type LightKind, type Room, type Wall,
} from '@studio/model';
import { createCeiling, createFloor, createWall, roughness, wallNormals } from './architecture';
import { createAssets, createFurniture, type SceneAssets } from './furniture';
import { createDaylight, createFixture } from './lighting';
import { fixturePlacement } from './fixture-placement';

type ObjectHit = { type: 'opening' | 'furniture' | 'light'; id: string };
export type Hit = { type: 'wall'; wall: Wall } | ObjectHit;
export type View = '3D' | 'Top' | 'Ceiling';
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
  onSelect: (selection: Hit) => void;
  onMove: (room: Room, dragStart: Room) => void;
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
const below = new Vector3(0, -1, 0.0001);
const yAxis = new Vector3(0, 1, 0);
const defaultViewport = 7;
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class RoomScene {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly roomGroup = new Group();
  private readonly camera = new OrthographicCamera(-4, 4, 4, -4, 0.05, 180);
  private readonly controls: OrbitControls;
  private readonly assets: SceneAssets;
  private readonly daylight = createDaylight();
  private readonly ground = new Mesh(new PlaneGeometry(140, 140), new ShadowMaterial({ opacity: 0.17, depthWrite: false }));
  private readonly walls = new Map<Wall, ReturnType<typeof createWall>>();
  private readonly furniture = new Map<string, ReturnType<typeof createFurniture>>();
  private readonly lights = new Map<string, ReturnType<typeof createFixture> & { kind: LightKind }>();
  private floor?: ReturnType<typeof createFloor>;
  private ceiling?: ReturnType<typeof createCeiling>;
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
  private down?: { pointer: number; x: number; y: number; hit?: ObjectHit; start: Room };
  private dragOffset = new Vector3();
  private readonly selectionBox = new Box3();
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
    this.scene.add(this.roomGroup, this.daylight.group, this.ground, this.selectionHelper);
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
    const { length, width, height } = this.state.room.dimensions;
    const aspect = this.width / this.height;
    const span = Math.hypot(length, width);
    const scale = this.state.view !== '3D'
      ? Math.max(width * 1.28, length * 1.28 / aspect)
      : Math.max(span * 0.91 + height * 0.2, height * 1.45, span * 1.11 / aspect);
    const half = scale / 2;
    this.camera.top = half;
    this.camera.bottom = -half;
    this.camera.left = -half * aspect;
    this.camera.right = half * aspect;
    this.camera.updateProjectionMatrix();
  }

  private setCamera(instant: boolean) {
    const { length, width, height } = this.state.room.dimensions;
    const scale = Math.max(length, width, defaultViewport);
    const view = this.state.view;
    const ceiling = view === 'Ceiling';
    const direction = ceiling ? below : view === 'Top' ? above : threeD;
    this.viewTarget.set(0, ceiling ? height : view === 'Top' ? 0 : height * 0.47, 0);
    this.desiredPosition.copy(direction).normalize().multiplyScalar(scale * 2).add(this.viewTarget);
    this.camera.zoom = 1;
    this.frameCamera();
    this.animateCamera(instant);
  }

  private animateCamera(instant = false) {
    if (instant || reduceMotion()) {
      this.camera.position.copy(this.desiredPosition);
      this.controls.target.copy(this.viewTarget);
      this.controls.update();
      this.cameraUntil = 0;
    } else {
      this.cameraUntil = performance.now() + 380;
    }
    this.schedule();
  }

  private revealWall(wall: Wall) {
    const offset = this.localPoint.copy(this.camera.position).sub(this.controls.target);
    const normal = wallNormals[wall];
    if (normal.dot(offset) < -0.15 || this.state.view !== '3D') return;
    const azimuth = wall === 'north' || wall === 'south' ? 'z' : 'x';
    const across = azimuth === 'x' ? 'z' : 'x';
    this.viewTarget.copy(this.controls.target);
    this.desiredPosition.copy(offset);
    this.desiredPosition[azimuth] = -normal[azimuth] * Math.max(2, Math.abs(offset[azimuth]), Math.abs(offset[across]) * 0.63);
    this.desiredPosition.add(this.viewTarget);
    this.animateCamera();
  }

  private stopCamera = () => { this.cameraUntil = 0; };

  act(action: CameraAction) {
    if (action === 'reset') { this.setCamera(false); return; }
    const zoom = this.camera.zoom * (action === 'in' ? 1.22 : 1 / 1.22);
    this.camera.zoom = Math.min(this.controls.maxZoom, Math.max(this.controls.minZoom, zoom));
    this.camera.updateProjectionMatrix();
    this.schedule();
  }

  update(state: SceneState) {
    const previous = this.previous;
    const room = state.room;
    const oldRoom = previous?.room;
    const switchedRoom = room.id !== oldRoom?.id;
    const resized = room.dimensions !== oldRoom?.dimensions;
    const sameLayout = oldRoom && !resized;
    this.shadowDirty ||= resized || room.openings !== oldRoom?.openings ||
      room.furniture !== oldRoom?.furniture || room.daylight !== oldRoom?.daylight;
    this.state = state;
    this.previous = state;
    this.controls.enabled = state.interactive;
    this.controls.enableRotate = state.view === '3D';
    this.controls.maxPolarAngle = state.view === 'Ceiling' ? Math.PI - 0.00001 : Math.PI / 2 - 0.055;
    if (resized) {
      if (this.floor) {
        this.roomGroup.remove(this.floor.group);
        this.floor.dispose();
      }
      if (this.ceiling) {
        this.roomGroup.remove(this.ceiling.group);
        this.ceiling.dispose();
      }
      this.floor = createFloor(room.dimensions, this.assets);
      this.ceiling = createCeiling(room.dimensions);
      this.roomGroup.add(this.floor.group, this.ceiling.group);
    }
    if (room.walls !== oldRoom?.walls || room.openings !== oldRoom?.openings || !sameLayout || previous?.selection !== state.selection) {
      for (const wall of WALLS) {
        const openings = room.openings.filter(item => item.wall === wall);
        const existing = this.walls.get(wall);
        if (!existing || !sameLayout || existing.openings.length !== openings.length ||
            existing.openings.some((item, index) => item !== openings[index])) {
          if (existing) {
            this.roomGroup.remove(existing.group);
            existing.dispose();
          }
          const newWall = createWall(room, wall, openings, this.assets);
          this.walls.set(wall, newWall);
          this.roomGroup.add(newWall.group);
        }
        const target = this.walls.get(wall)!;
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
    if (oldRoom?.lights !== room.lights) {
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
          current = { ...createFixture(light), kind: light.kind };
          this.lights.set(light.id, current);
          this.roomGroup.add(current.group);
        } else current.update(light);
      }
    }
    if (resized || room.daylight !== oldRoom?.daylight) {
      this.daylight.update(room.daylight, Math.max(4.5, room.dimensions.width, room.dimensions.length, room.dimensions.height));
      if (!previous || reduceMotion()) this.daylight.tick(1);
      else this.lightUntil = performance.now() + 450;
    }
    if (switchedRoom || state.view !== previous?.view || resized) {
      const crossedCeiling = (state.view === 'Ceiling') !== (previous?.view === 'Ceiling');
      this.setCamera(!previous || crossedCeiling);
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
    const moved = this.controls.update();
    const isTop = this.state.view === 'Top' && this.controls.getPolarAngle() < 0.2;
    const isCeiling = this.state.view === 'Ceiling';
    this.ground.visible = !isCeiling;
    if (this.floor) this.floor.group.visible = !isCeiling;
    if (this.ceiling) this.ceiling.slab.visible = isCeiling;
    for (const item of this.furniture.values()) item.group.visible = !isCeiling;
    this.localPoint.copy(this.camera.position).sub(this.controls.target).setY(0).normalize();
    for (const [wall, mesh] of this.walls) {
      const shown = !isCeiling && (isTop || wallNormals[wall].dot(this.localPoint) < 0.03);
      const height = isTop ? 0.065 : 1;
      if (mesh.group.visible !== shown || mesh.group.scale.y !== height) this.shadowDirty = true;
      mesh.group.visible = shown;
      mesh.group.scale.y = height;
      const rim = this.ceiling?.rim.get(wall);
      if (rim) rim.visible = shown && !isTop;
    }
    for (const light of this.state.room.lights) {
      const fixture = this.lights.get(light.id);
      if (fixture) fixture.model.visible = isCeiling ? light.mount === 'Ceiling'
        : !isWallMount(light.mount) || !!this.walls.get(light.mount)?.group.visible;
    }
    const selected = this.state.selection;
    let object: Object3D | undefined;
    if (selected?.type === 'furniture') object = this.furniture.get(selected.id)?.group;
    if (selected?.type === 'light') object = this.lights.get(selected.id)?.model;
    if (selected?.type === 'opening') {
      const wall = this.state.room.openings.find(item => item.id === selected.id)?.wall;
      const group = wall && this.walls.get(wall)?.group;
      object = group ? group.children.find(child => child.userData.hit?.id === selected.id) : undefined;
    }
    this.selectionHelper.visible = !!object && visible(object);
    if (object && this.selectionHelper.visible) this.selectionBox.setFromObject(object).expandByScalar(0.018);
    if (this.shadowDirty) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowDirty = false;
    }
    this.renderer.render(this.scene, this.camera);
    this.animation = 0;
    if (moved || this.cameraUntil || this.lightUntil) this.schedule();
  };

  private cast(event: { clientX: number; clientY: number }) {
    const bounds = this.host.getBoundingClientRect();
    this.cursor.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    this.ray.setFromCamera(this.cursor, this.camera);
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
    const placement = fixturePlacement(this.ray.ray, room.dimensions, kind);
    return view === 'Ceiling' && placement?.mount !== 'Ceiling' ? undefined : placement;
  }

  dropInterior(clientX: number, clientY: number) {
    if (this.state.view === 'Ceiling') return;
    this.cast({ clientX, clientY });
    const { length, width } = this.state.room.dimensions;
    const point = this.ray.ray.intersectPlane(new Plane(yAxis, 0), this.point);
    if (point && Math.abs(point.x) <= length / 2 && Math.abs(point.z) <= width / 2) return { x: point.x, z: point.z };
  }

  private pointerDown = (event: PointerEvent) => {
    if (!this.state.interactive || event.button !== 0) return;
    if (this.down) {
      if (this.down.hit) return;
      this.down = undefined;
      return;
    }
    const { room, tool, dragFixtures, dragInterior, view } = this.state;
    this.down = { pointer: event.pointerId, x: event.clientX, y: event.clientY, start: room };
    if (tool !== 'Move' && !dragFixtures && !dragInterior) return;
    const hit = this.pick(event);
    if (!hit || hit.type === 'wall') return;
    if (tool !== 'Move' && !((hit.type === 'light' && dragFixtures) || (hit.type === 'furniture' && dragInterior))) return;

    if (hit.type === 'opening') {
      if (view === 'Top') return;
      const opening = room.openings.find(item => item.id === hit.id)!;
      const wall = this.walls.get(opening.wall)!;
      this.plane.setFromNormalAndCoplanarPoint(wallNormals[opening.wall], wall.group.position);
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
        this.plane.setFromNormalAndCoplanarPoint(wall ? wallNormals[wall] : yAxis, anchor);
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
    if (!down?.hit || down.pointer !== event.pointerId) return;
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) < 3) return;
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
    } else {
      const lights = room.lights.map(item => item.id === hit.id ? fitLight(room.dimensions, { ...item, x, y, z }) : item);
      this.state.onMove({ ...room, lights }, down.start);
    }
  };

  private pointerUp = (event: PointerEvent) => {
    const down = this.down;
    if (!down || down.pointer !== event.pointerId) return;
    this.down = undefined;
    if (!down.hit && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 6) {
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
    this.renderer.domElement.removeEventListener('webglcontextlost', this.contextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.restoreContext);
    this.renderer.domElement.remove();
    this.floor?.dispose();
    this.ceiling?.dispose();
    for (const wall of this.walls.values()) wall.dispose();
    for (const item of this.furniture.values()) item.dispose();
    for (const light of this.lights.values()) light.dispose();
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
