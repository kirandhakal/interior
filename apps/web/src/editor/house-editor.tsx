import { useState } from 'react';
import { bounds, connectRooms, footprint, physicalWalls, pose, snapRoom, totalArea, world, layoutError } from '@studio/house';
import { roomPlan, type Project, type Room } from '@studio/model';
import { HousePreview } from './house-preview';

export function HouseEditor({ project, active, onSelect, onChange, onClose, onCorridor, onAddRoom, onOpenings, onExample }: { project: Project; active: Room; onSelect: (r: Room)=>void; onChange:(rooms:Room[])=>void; onClose:()=>void; onCorridor:()=>void; onAddRoom:()=>void; onOpenings:()=>void; onExample:()=>void }) {
  const [preview,setPreview]=useState(false);
  const [drag,setDrag]=useState<{id:string;x:number;z:number;start:Room}>();
  const [draft,setDraft]=useState<Room>();
  const rooms=project.rooms.map(r=>draft?.id===r.id?draft:r);
  const b=bounds(project.rooms.flatMap(footprint));
  const minX=b.minX-3,minZ=b.minZ-3,w=b.maxX-b.minX+6,h=b.maxZ-b.minZ+6;
  const shared=physicalWalls(project.rooms).filter(s=>s.sides.length===2 && s.sides.some(s=>s.room.id===active.id));
  const update=(room:Room)=>onChange(project.rooms.map(r=>r.id===room.id?room:r));
  return <section className="house-editor" aria-label="House layout editor">
    <div className="house-guide"><strong>Whole-house top view</strong><p>Drag rooms together to snap their walls. Select a room to connect it or edit its design.</p><button className="button button-secondary" disabled={project.rooms.length > 25} onClick={onExample}>Add five-room example</button><small>Adds the connected layout from your example alongside existing rooms.</small></div>
    <div className="house-actions"><button className="button" onClick={onClose}>Back to room</button><button className="button" onClick={()=>setPreview(!preview)}>{preview?'Whole-house top view':'House 3D'}</button><button className="button" onClick={onAddRoom}>Add room</button><button className="button" onClick={onCorridor}>Add corridor</button></div>
    <p>{totalArea(project.rooms).toFixed(2)} m² total floor area · {(b.maxX-b.minX).toFixed(2)} × {(b.maxZ-b.minZ).toFixed(2)} m</p>
    {preview?<HousePreview rooms={rooms}/>:<svg aria-label="Drag rooms in the global floor plan" viewBox={`${minX} ${minZ} ${w} ${h}`} style={{width:'100%',height:420,touchAction:'none',background:'#eeeae2'}} onPointerMove={e=>{
      if(!drag)return; const svg=e.currentTarget, point=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
      setDraft(snapRoom({...drag.start,placement:{...pose(drag.start),x:pose(drag.start).x+point.x-drag.x,z:pose(drag.start).z+point.y-drag.z}},project.rooms.filter(r=>r.id!==drag.id)));
    }} onPointerUp={()=>{if(draft)update(draft);setDrag(undefined);setDraft(undefined);}} onPointerCancel={()=>{setDrag(undefined);setDraft(undefined);}}>
      {rooms.filter(r=>r.visible!==false).map(r=>{const p=footprint(r),b=bounds(p);return <g key={r.id} onPointerDown={e=>{e.currentTarget.ownerSVGElement!.setPointerCapture(e.pointerId);const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(e.currentTarget.ownerSVGElement!.getScreenCTM()!.inverse());onSelect(r);setDrag({id:r.id,x:p.x,z:p.y,start:r});}}><polygon points={p.map(p=>`${p.x},${p.z}`).join(' ')} fill={r.id===active.id?'#bbccab':'#ded6c7'} stroke="#56634e" strokeWidth="0.06"/><text x={(b.minX+b.maxX)/2} y={(b.minZ+b.maxZ)/2} textAnchor="middle" fontSize="0.3" pointerEvents="none">{r.name}</text></g>;})}
      {rooms.filter(r=>r.visible!==false).flatMap(r=>r.openings.map(o=>{
        const edge=roomPlan(r.dimensions).walls[o.wall];
        const a=world(r,{x:edge.midpoint.x+edge.tangent.x*(o.offset-o.width/2),z:edge.midpoint.z+edge.tangent.z*(o.offset-o.width/2)});
        const b=world(r,{x:edge.midpoint.x+edge.tangent.x*(o.offset+o.width/2),z:edge.midpoint.z+edge.tangent.z*(o.offset+o.width/2)});
        return <line key={r.id+o.id} x1={a.x} y1={a.z} x2={b.x} y2={b.z} stroke={o.kind==='Door'?'#eeeae2':'#72a1b2'} strokeWidth="0.16" pointerEvents="none"><title>{r.name}: {o.kind}{o.connectionId?' (connected)':''}</title></line>;
      }))}
    </svg>}
    {draft && layoutError(rooms) && <p role="alert">{layoutError(rooms)} Drop will be rejected.</p>}
    <h3>{active.name}</h3><div className="house-actions"><button className="button button-secondary" onClick={onClose}>Edit selected room</button><button className="button button-secondary" onClick={onOpenings}>Doors &amp; windows</button></div><div className="house-actions">{(['x','z','rotation'] as const).map(key=><label key={key}>{key}<input aria-label={`Room ${key}`} type="number" step={key==='rotation'?15:0.1} value={pose(active)[key]} onChange={e=>{const v=Number(e.target.value);if(Number.isFinite(v))update({...active,placement:{...pose(active),[key]:key==='rotation'?(v%360+360)%360:v}});}}/></label>)}</div>
    <p>Drag to move and snap walls. Overlapping interiors are rejected. Edit doors and windows in the room’s Openings panel.</p>
    <h3>Connect adjacent rooms</h3>
    {!shared.length && <p>No shared wall yet. Drag this room until its edge snaps to another room.</p>}
    {shared.map((s,i)=>{ const connected = s.sides[0].room.openings.some(o => o.connectionId && s.sides[1].room.openings.some(other => other.connectionId === o.connectionId)); return <button disabled={connected} className="button" key={i} onClick={()=>{try{const connected=connectRooms(s);onChange(project.rooms.map(r=>connected.find(n=>n.id===r.id)??r));}catch(e){window.alert((e as Error).message);}}}>{connected ? 'Connected to ' : 'Connect to '}{s.sides.find(s=>s.room.id!==active.id)!.room.name}{connected ? ' ✓' : ' with door'}</button>; })}
  </section>;
}
