'use client';

import { useEffect, useRef, useState } from 'react';
import { AmbientLight, DirectionalLight, MOUSE, OrthographicCamera, Raycaster, Scene, Vector2, Vector3, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Hand, Maximize, Minus, Orbit, Plus } from 'lucide-react';
import type { IsolatedWall } from '@studio/wall-surface';
import { wallLocalToWorld } from '@studio/wall-surface';
import { IconButton } from '@/components/ui';
import { createWall } from '../scene/architecture';
import { createAssets } from '../scene/furniture';

/** Only rendering resources are isolated. The source room and wall are never modified. */
export function WallIsolation({ wall, onOpening }: { wall: IsolatedWall; onOpening: (id: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const action = useRef<(command: 'in' | 'out' | 'fit' | 'orbit' | 'pan') => void>(() => {});
  const select = useRef(onOpening);
  select.current = onOpening;
  const [error, setError] = useState(false);
  const [pan, setPan] = useState(false);
  const { room, id, surface } = wall;

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: WebGLRenderer;
    try { renderer = new WebGLRenderer({ antialias: true, alpha: true }); }
    catch { setError(true); return; }
    const scene = new Scene();
    const assets = createAssets();
    const model = createWall(room, id, wall.openings, assets);
    for (const opening of wall.openings) {
      const item = model.openingModels.get(opening.id)!;
      item.update(opening);
      item.tickSwing(1);
    }
    model.outline.visible = true;
    scene.add(model.group, new AmbientLight('#ffffff', 2));
    const light = new DirectionalLight('#fff5e5', 3);
    light.position.set(8, 12, 10);
    scene.add(light);
    const camera = new OrthographicCamera(-5, 5, 4, -4, 0.01, 300);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.minZoom = 0.25;
    controls.maxZoom = 8;
    controls.screenSpacePanning = true;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.setAttribute('aria-label', `${surface} isolated wall preview`);
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.tabIndex = 0;
    element.append(renderer.domElement);
    const render = () => renderer.render(scene, camera);
    const centerPoint = wallLocalToWorld(wall.frame, { u: wall.frame.width / 2, v: wall.frame.height / 2, depth: 0 });
    const center = new Vector3(centerPoint.x, centerPoint.y, centerPoint.z);
    const fit = () => {
      const { normal, horizontal } = wall.frame;
      controls.target.copy(center);
      camera.position.copy(center).add(new Vector3(normal.x * 12 + horizontal.x * 3, 2, normal.z * 12 + horizontal.z * 3));
      camera.zoom = 1;
      camera.updateProjectionMatrix();
      controls.update();
      render();
    };
    const resize = () => {
      const width = Math.max(1, element.clientWidth);
      const height = Math.max(1, element.clientHeight);
      const aspect = width / height;
      const span = Math.max(wall.frame.height * 1.5, wall.frame.width * 1.4 / aspect);
      camera.left = -span * aspect / 2; camera.right = span * aspect / 2;
      camera.top = span / 2; camera.bottom = -span / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    controls.addEventListener('change', render);
    action.current = command => {
      if (command === 'fit') fit();
      else if (command === 'pan' || command === 'orbit') controls.mouseButtons.LEFT = command === 'pan' ? MOUSE.PAN : MOUSE.ROTATE;
      else {
        camera.zoom = Math.min(8, Math.max(0.25, camera.zoom * (command === 'in' ? 1.25 : 0.8)));
        camera.updateProjectionMatrix(); render();
      }
    };
    const ray = new Raycaster();
    let down: { x: number; y: number; pointer: number } | undefined;
    const pointerDown = (event: PointerEvent) => { down = { x: event.clientX, y: event.clientY, pointer: event.pointerId }; };
    const pointerUp = (event: PointerEvent) => {
      const start = down; down = undefined;
      if (!start || start.pointer !== event.pointerId || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
      const bounds = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2), camera);
      const hit = ray.intersectObject(model.group, true)[0];
      for (let object = hit?.object; object; object = object.parent!) {
        if (object.userData.hit?.type === 'opening') { select.current(object.userData.hit.id); break; }
      }
    };
    const lost = (event: Event) => { event.preventDefault(); setError(true); };
    const restored = () => { setError(false); render(); };
    const keyDown = (event: KeyboardEvent) => {
      if (['+', '=', '-', '0'].includes(event.key)) {
        event.preventDefault(); action.current(event.key === '0' ? 'fit' : event.key === '-' ? 'out' : 'in');
      }
    };
    renderer.domElement.addEventListener('pointerdown', pointerDown);
    renderer.domElement.addEventListener('pointerup', pointerUp);
    renderer.domElement.addEventListener('keydown', keyDown);
    renderer.domElement.addEventListener('webglcontextlost', lost);
    renderer.domElement.addEventListener('webglcontextrestored', restored);
    fit(); resize();
    return () => {
      observer.disconnect(); controls.dispose(); action.current = () => {};
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointerup', pointerUp);
      renderer.domElement.removeEventListener('keydown', keyDown);
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      renderer.domElement.removeEventListener('webglcontextrestored', restored);
      model.dispose();
      for (const asset of Object.values(assets)) {
        if (Array.isArray(asset)) asset.forEach(item => item.dispose());
        else asset.dispose();
      }
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
    // The workspace keys this component by room, wall and surface; its data is read-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, id, surface]);

  return <div className="wall-viewport">
    <div ref={host} className="wall-isolation" />
    {error && <p className="wall-webgl-error" role="status">3D preview unavailable. Use the 2D elevation to inspect this wall.</p>}
    <div className="wall-viewport-tools" role="group" aria-label="Isolated wall camera">
      <IconButton label="Orbit wall" pressed={!pan} onClick={() => { setPan(false); action.current('orbit'); }}><Orbit size={17} /></IconButton>
      <IconButton label="Pan wall" pressed={pan} onClick={() => { setPan(true); action.current('pan'); }}><Hand size={17} /></IconButton>
      <IconButton label="Zoom in on wall" onClick={() => action.current('in')}><Plus size={17} /></IconButton>
      <IconButton label="Zoom out on wall" onClick={() => action.current('out')}><Minus size={17} /></IconButton>
      <IconButton label="Fit wall to view" onClick={() => action.current('fit')}><Maximize size={17} /></IconButton>
    </div>
  </div>;
}
