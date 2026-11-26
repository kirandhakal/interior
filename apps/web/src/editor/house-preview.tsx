import { useEffect, useRef } from 'react';
import { AmbientLight, BoxGeometry, Color, DirectionalLight, DoubleSide, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { roomPlan, type Room } from '@studio/model';
import { bounds, footprint, physicalWalls, world } from '@studio/house';
import { createAssets, createFurniture } from './scene/furniture';
import { pose } from '@studio/house';
import { planFace } from './scene/plan-mesh';

export function HousePreview({ rooms }: { rooms: Room[] }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const scene = new Scene(); scene.background = new Color('#eeeae2');
    const renderer = new WebGLRenderer({ antialias: true }); host.current.append(renderer.domElement);
    const camera = new PerspectiveCamera(45, 1, 0.1, 2000);
    const visible = rooms.filter(r => r.visible !== false);
    const b = bounds((visible.length ? visible : rooms).flatMap(footprint));
    const span = Math.max(b.maxX-b.minX, b.maxZ-b.minZ, 5);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set((b.minX+b.maxX)/2, 0, (b.minZ+b.maxZ)/2);
    camera.position.copy(controls.target).add({ x: span, y: span, z: span }); controls.update();
    scene.add(new AmbientLight('#ffffff', 2)); const sun = new DirectionalLight('#ffffff', 3); sun.position.set(10, 20, 5); scene.add(sun);
    const assets = createAssets();
    for (const r of visible) {
      const group = new Group(), t = pose(r);
      group.position.set(t.x, 0, t.z); group.rotation.y = -t.rotation * Math.PI / 180;
      for (const item of r.furniture) {
        const object = createFurniture(item, assets).group;
        object.position.set(item.x, 0, item.z); object.rotation.y = item.rotation * Math.PI / 180;
        object.scale.setScalar(item.scale ?? 1); group.add(object);
      }
      scene.add(group);
    }
    for (const r of visible) scene.add(new Mesh(planFace(footprint(r), 0), new MeshStandardMaterial({ color: '#b9a387', side: DoubleSide })));
    for (const segment of physicalWalls(visible)) {
      const dx = segment.end.x-segment.start.x, dz = segment.end.z-segment.start.z, length = Math.hypot(dx,dz);
      const group = new Group(); group.position.set(segment.start.x, 0, segment.start.z); group.rotation.y = -Math.atan2(dz,dx); scene.add(group);
      const height = Math.max(...segment.sides.map(s => s.room.dimensions.height));
      const cuts = segment.sides.flatMap(({ room, wall }) => room.openings.filter(o => o.wall === wall).map(o => {
        const e = roomPlan(room.dimensions).walls[wall];
        const p = world(room, { x: e.midpoint.x + e.tangent.x*o.offset, z: e.midpoint.z + e.tangent.z*o.offset });
        const t = ((p.x-segment.start.x)*dx+(p.z-segment.start.z)*dz)/length;
        return { lo: Math.max(0,t-o.width/2), hi: Math.min(length,t+o.width/2), bottom: o.sill, top: o.sill+o.height };
      })).filter(o => o.hi > o.lo);
      const xs = [...new Set([0,length,...cuts.flatMap(c => [c.lo,c.hi])])].sort((a,b)=>a-b);
      const ys = [...new Set([0,height,...cuts.flatMap(c => [c.bottom,c.top])])].sort((a,b)=>a-b);
      const materials = segment.sides.map(s => new MeshStandardMaterial({ color: s.room.walls[s.wall].color, roughness: 0.85 }));
      for(let i=1;i<xs.length;i++) for(let j=1;j<ys.length;j++) {
        const x=(xs[i]+xs[i-1])/2,y=(ys[j]+ys[j-1])/2;
        if(cuts.some(c=> x>c.lo && x<c.hi && y>c.bottom && y<c.top)) continue;
        const first = segment.sides[0], e = roomPlan(first.room.dimensions).walls[first.wall];
        const a=world(first.room,e.start), z=world(first.room,e.end);
        const aligned=(z.x-a.x)*dx+(z.z-a.z)*dz>0;
        const front=aligned?materials[0]:(materials[1]??materials[0]), back=aligned?(materials[1]??materials[0]):materials[0];
        const mesh=new Mesh(new BoxGeometry(xs[i]-xs[i-1],ys[j]-ys[j-1],0.12),[materials[0],materials[0],materials[0],materials[0],front,back]);
        mesh.position.set(x,y,0);group.add(mesh);
      }
    }
    const resize = new ResizeObserver(() => { if (!host.current) return; const w=host.current.clientWidth,h=host.current.clientHeight;renderer.setSize(w,h);camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix(); }); resize.observe(host.current);
    renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});
    return ()=>{resize.disconnect();renderer.setAnimationLoop(null);controls.dispose();scene.traverse(o=>{if(o instanceof Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});for (const texture of assets.textures) texture.dispose(); renderer.dispose();renderer.domElement.remove();};
  }, [rooms]);
  return <div ref={host} style={{height: 420, width:'100%'}} aria-label="Complete house 3D preview" />;
}
