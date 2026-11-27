import { useState, useEffect } from 'react';
import { Link2, Trash2, Minus, Armchair, Bath, Box, Footprints, Grid2X2, Home, MousePointer2, Move, PencilRuler, Plus, RotateCcw, Scan, Trees, Undo2, X, type LucideIcon } from 'lucide-react';
import { attachSpace, removeHouseSpace, bounds, connectRooms, footprint, physicalWalls, pose, snapRoom, totalArea, world, layoutError, connectionError, isOpenSpace } from '@studio/house';
import { LIMITS, SPACE_TYPES, roomPlan, type Project, type Room, type SpaceType, type PlanPoint, type Wall } from '@studio/model';
import type { MeasurementUnit } from '@studio/measurement';
import { applyRoomOutline } from '@studio/room-outline';
import { HousePreview } from './house-preview';
import { FloorPlanEditor } from './floor-plan/editor';
import { newRoom } from './rooms';
import { CorridorControls } from './corridor-controls';

const library: { type: SpaceType; icon: LucideIcon; size: [number, number]; color: string; hint: string }[] = [
  { type: 'Room', icon: Armchair, size: [4, 3.5], color: '#dae6f3', hint: 'Living, sleeping or working' },
  { type: 'Bathroom', icon: Bath, size: [2.4, 2], color: '#cdebed', hint: 'Bath or utility room' },
  { type: 'Corridor', icon: Move, size: [4, 1.2], color: '#f5e3b9', hint: 'Enclosed hallway' },
  { type: 'Passage', icon: Footprints, size: [4, 1.5], color: '#f9edcf', hint: 'Open walkway, without walls' },
  { type: 'Stairs', icon: Grid2X2, size: [2.4, 3.6], color: '#e5dbf1', hint: 'Reserve a stairwell' },
  { type: 'Balcony', icon: Trees, size: [4, 1.5], color: '#d5e9d6', hint: 'Outdoor floor area' },
  { type: 'Open space', icon: Scan, size: [3, 3], color: '#e8ecef', hint: 'Courtyard or free area' },
];
const info = (r: Room) => library.find(item => item.type === r.spaceType) ?? library[0];
type Props = { project: Project; active: Room; onSelect: (r: Room) => void; onChange: (rooms: Room[]) => void; onClose: () => void; onAddRoom: () => void; onOpenings: () => void; onExample: () => void };

export function HouseEditor({ project, active, onSelect, onChange, onClose, onAddRoom, onOpenings, onExample }: Props) {
  const [attachKind, setAttachKind] = useState<SpaceType>('Bathroom');
  const [attachWall, setAttachWall] = useState<Wall>();
  const [withDoor, setWithDoor] = useState(true);
  const [removing, setRemoving] = useState(false);
  useEffect(() => { setRemoving(false); setAttachWall(undefined); }, [active.id]);
  const [preview, setPreview] = useState(false);
  const [mode, setMode] = useState<'select' | 'place' | 'draw'>('select');
  const [kind, setKind] = useState<SpaceType>('Corridor');
  const [points, setPoints] = useState<PlanPoint[]>([]);
  const [snap, setSnap] = useState(true);
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [unit, setUnit] = useState<MeasurementUnit>('m');
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<{ x: number; z: number; start: Room }>();
  const [draft, setDraft] = useState<Room>();
  const [proposal, setProposal] = useState<Room[]>();
  const rooms = (proposal ?? project.rooms).map(r => draft?.id === r.id ? draft : r);
  const b = bounds(project.rooms.flatMap(footprint));
  const w = (b.maxX - b.minX + 14) * zoom, h = (b.maxZ - b.minZ + 14) * zoom;
  const minX = (b.minX + b.maxX - w) / 2, minZ = (b.minZ + b.maxZ - h) / 2;
  const shared = physicalWalls(project.rooms).filter(s => s.sides.length === 2 && s.sides.some(s => s.room.id === active.id));
  function commit(next: Room[]) {
    const invalid = layoutError(next) ?? connectionError(next);
    if (invalid) { setError(invalid); return false; }
    setError(undefined); onChange(next); return true;
  }
  const update = (room: Room) => commit(project.rooms.map(r => r.id === room.id ? room : r));
  function add(room: Room) {
    if (project.rooms.length >= LIMITS.rooms) { setError(`A house can contain up to ${LIMITS.rooms} spaces.`); return; }
    if (commit([...project.rooms, room])) { onSelect(room); setMode('select'); setPoints([]); }
  }
  function place(type: SpaceType, point: PlanPoint) {
    const item = library.find(item => item.type === type)!;
    let room = { ...newRoom(crypto.randomUUID(), type, { length: item.size[0], width: item.size[1], height: 2.6 }), spaceType: type, placement: { ...point, rotation: 0 } };
    if (snap) room = snapRoom(room, project.rooms) as typeof room;
    add(room);
  }
  function attach() {
    const item = library.find(item => item.type === attachKind)!;
    const next = { ...newRoom(crypto.randomUUID(), attachKind, { length: item.size[0], width: item.size[1], height: active.dimensions.height }), spaceType: attachKind };
    try {
      const result = attachSpace(project.rooms, active, next, attachWall ?? roomPlan(active.dimensions).edges[0].id, withDoor);
      if (commit(result)) { onSelect(result.find(r => r.id === next.id)!); resetTool(); }
    } catch (e) { setError((e as Error).message); }
  }
  function remove() {
    try { const next = removeHouseSpace(project.rooms, active.id); if (commit(next)) { onSelect(next[0]); setRemoving(false); resetTool(); } }
    catch (e) { setError((e as Error).message); }
  }
  function finishDrawing() {
    const base = { ...newRoom(crypto.randomUUID(), kind, { length: 4, width: 3, height: 2.6 }), spaceType: kind, placement: { x: 0, z: 0, rotation: 0 } };
    // Keep local coordinates close to the origin, even in a large house.
    const box = bounds(points), center = { x: (box.minX + box.maxX) / 2, z: (box.minZ + box.maxZ) / 2 };
    const result = applyRoomOutline(base, kind, 2.6, points.map(p => ({ x: p.x - center.x, z: p.z - center.z, wallId: `wall-${crypto.randomUUID()}` })));
    if ('error' in result) setError(result.error);
    else add({ ...result.room, placement: { ...center, rotation: 0 } });
  }
  function pointAt(svg: SVGSVGElement, x: number, y: number) {
    const point = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: snap ? Math.round(point.x * 10) / 10 : point.x, z: snap ? Math.round(point.y * 10) / 10 : point.y };
  }
  const resetTool = () => { setMode('select'); setPoints([]); setError(undefined); };
  return <section className="house-editor" aria-label="House layout editor">
    <div className="house-heading"><div><p className="overline">PLAN YOUR HOME</p><h2>Build your house layout</h2><p>Add spaces, attach them to a room, or draw your own outline.</p></div>
      <button className="button button-secondary" onClick={() => { setPreview(!preview); resetTool(); }}><Box size={17} />{preview ? 'Whole-house top view' : 'House 3D'}</button></div>
    <div className="house-workbench">
      <aside className="house-library" aria-label="Space library"><h3><Plus size={17} /> Add a space</h3><p>Drag onto the plan, or choose a tile and click where it belongs.</p>
        {(['Rooms & essentials', 'Connections', 'Outdoor & open'] as const).map((group, index) => <details key={group} open><summary>{group}</summary><div className="space-tiles">
          {library.filter(item => index === 0 ? ['Room', 'Bathroom'].includes(item.type) : index === 1 ? ['Corridor', 'Passage', 'Stairs'].includes(item.type) : ['Balcony', 'Open space'].includes(item.type)).map(item => <button key={item.type} draggable={!preview} disabled={preview} className={`space-tile ${mode === 'place' && kind === item.type ? 'is-active' : ''}`} aria-pressed={mode === 'place' && kind === item.type} title={item.hint}
            onDragStart={event => { event.dataTransfer.setData('application/house-space', item.type); event.dataTransfer.effectAllowed = 'copy'; setKind(item.type); }}
            onClick={() => { setKind(item.type); setMode('place'); setPoints([]); setError(undefined); }}><item.icon size={19} /><span>{item.type}<small>{item.size[0]} × {item.size[1]} m</small></span></button>)}
        </div></details>)}
        <details className="house-more"><summary>More ways to start</summary><button className="button button-secondary" onClick={onAddRoom}>Room presets & dimensions</button><button className="button button-secondary" disabled={project.rooms.length > LIMITS.rooms - 5} onClick={onExample}>Add five-room example</button><small>Adds an example alongside your existing layout.</small></details>
      </aside>
      <div className="house-workspace">
        {proposal && <p role="status" className="house-draw-bar">Corridor preview — apply or reject it in the selected-space panel.</p>}
        <div className="house-toolbar" aria-label="House drawing tools"><div className="house-tool-group">
          <button className="button" aria-pressed={mode === 'select'} onClick={resetTool}><MousePointer2 size={16} /> Select & move</button>
          <button className="button" disabled={preview} aria-pressed={mode === 'draw'} onClick={() => { setMode('draw'); setPoints([]); setError(undefined); }}><PencilRuler size={16} /> Draw a space</button>
        </div><label><input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)} /> Snap to fit</label>
          <div className="house-zoom"><button className="button" aria-label="Zoom out" onClick={() => setZoom(Math.min(4, zoom * 1.25))}><Minus size={16} /></button><button className="button" onClick={() => setZoom(1)}><Scan size={16} /> Fit</button><button className="button" aria-label="Zoom in" onClick={() => setZoom(Math.max(.4, zoom / 1.25))}><Plus size={16} /></button></div><details className="house-view-menu"><summary>View</summary><div><button className="button" onClick={() => setZoom(Math.max(.4, zoom / 1.25))}>Zoom in</button><button className="button" onClick={() => setZoom(Math.min(4, zoom * 1.25))}>Zoom out</button><button className="button" onClick={() => setZoom(1)}><Scan size={15} /> Fit house</button></div></details>
        </div>
        {mode !== 'select' && <div className="house-draw-bar">{mode === 'draw' ? <><label>Drawing <select aria-label="Space to draw" value={kind} onChange={e => setKind(e.target.value as SpaceType)}>{SPACE_TYPES.map(type => <option key={type}>{type}</option>)}</select></label><button className="button" disabled={!points.length} onClick={() => setPoints(points.slice(0, -1))}><Undo2 size={15} /> Last point</button><button className="button button-primary" disabled={points.length < 3} onClick={finishDrawing}>Finish space</button></> : <span>Click the plan to place a {kind.toLowerCase()}.</span>}<button className="button" onClick={resetTool}><X size={15} /> Cancel</button></div>}
        {preview ? <HousePreview rooms={rooms} /> : <svg onDragStart={e => e.preventDefault()} onContextMenu={e => e.preventDefault()} className={`house-canvas ${mode !== 'select' ? 'is-drawing' : ''}`} aria-label="Drag rooms in the global floor plan" viewBox={`${minX} ${minZ} ${w} ${h}`}
          onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }} onDrop={e => { e.preventDefault(); const type = e.dataTransfer.getData('application/house-space') as SpaceType; if (SPACE_TYPES.includes(type)) place(type, pointAt(e.currentTarget, e.clientX, e.clientY)); }}
          onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); if (proposal || mode === 'select') return; const p = pointAt(e.currentTarget, e.clientX, e.clientY); if (mode === 'place') place(kind, p); else { setPoints([...points, p]); setError(undefined); } }}
          onPointerMove={e => { if (!drag) return; const p = pointAt(e.currentTarget, e.clientX, e.clientY); const next = { ...drag.start, placement: { ...pose(drag.start), x: pose(drag.start).x + p.x - drag.x, z: pose(drag.start).z + p.z - drag.z } }; setDraft(snap ? snapRoom(next, project.rooms.filter(r => r.id !== next.id)) : next); }}
          onPointerUp={() => { if (draft) update(draft); setDrag(undefined); setDraft(undefined); }} onPointerCancel={() => { setDrag(undefined); setDraft(undefined); }}>
          <defs><pattern id="house-grid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M 1 0 L 0 0 0 1" fill="none" stroke="#dce3e8" strokeWidth="0.025" /></pattern></defs>
          <rect x={minX} y={minZ} width={w} height={h} fill="url(#house-grid)" />
          {rooms.filter(r => r.visible !== false).map(r => { const p = footprint(r), box = bounds(p), selected = r.id === active.id; return <g key={r.id} role="button" tabIndex={0} aria-label={`Select ${r.name}`} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(r); } }} onPointerDown={e => { if (proposal || mode !== 'select' || e.button !== 0) return; e.preventDefault(); e.stopPropagation(); e.currentTarget.ownerSVGElement!.setPointerCapture(e.pointerId); const p = pointAt(e.currentTarget.ownerSVGElement!, e.clientX, e.clientY); onSelect(r); setError(undefined); setDrag({ ...p, start: r }); }}>
            <polygon points={p.map(p => `${p.x},${p.z}`).join(' ')} fill={info(r).color} opacity={proposal && !project.rooms.some(old => old.id === r.id) ? .55 : 1} stroke={selected ? '#236b90' : '#7e8d96'} strokeWidth={selected ? .1 : .05} strokeDasharray={isOpenSpace(r) ? '.15 .1' : undefined} />
            <text x={(box.minX + box.maxX) / 2} y={(box.minZ + box.maxZ) / 2} textAnchor="middle" fontSize="0.4" pointerEvents="none">{r.name}</text>
            <text x={(box.minX + box.maxX) / 2} y={(box.minZ + box.maxZ) / 2 + .44} textAnchor="middle" fontSize="0.27" fill="#4b5963" pointerEvents="none">{totalArea([r]).toFixed(1)} m²{r.spaceType === 'Stairs' ? ' · stairwell' : ''}</text>
          </g>; })}
          {rooms.filter(r => r.visible !== false).flatMap(r => r.openings.map(o => { const edge = roomPlan(r.dimensions).walls[o.wall]; const a = world(r, { x: edge.midpoint.x + edge.tangent.x * (o.offset - o.width / 2), z: edge.midpoint.z + edge.tangent.z * (o.offset - o.width / 2) }); const b = world(r, { x: edge.midpoint.x + edge.tangent.x * (o.offset + o.width / 2), z: edge.midpoint.z + edge.tangent.z * (o.offset + o.width / 2) }); return <line key={r.id + o.id} x1={a.x} y1={a.z} x2={b.x} y2={b.z} stroke={o.kind !== 'Window' ? '#fff' : '#368bb4'} strokeWidth="0.16" pointerEvents="none" />; }))}
          {!!points.length && <g pointerEvents="none"><polyline points={points.map(p => `${p.x},${p.z}`).join(' ')} fill="none" stroke="#236b90" strokeWidth=".07" />{points.map((p, i) => <circle key={i} cx={p.x} cy={p.z} r=".1" fill="#236b90" />)}</g>}
        </svg>}
        <div className="house-canvas-footer"><span>{project.rooms.length} spaces · {totalArea(project.rooms).toFixed(1)} m²</span><span>Grid: 1 m · Dimensions in metres</span></div>
        <p className="house-help">{mode === 'draw' ? 'Click each corner of your space, then Finish space to close the outline. Repeat to build your whole house.' : 'Select a space to edit it. Drag to move. Turn off snapping to leave exact gaps between spaces.'}</p>
        {(error || (draft && layoutError(rooms))) && <p className="inline-error" role="alert">{error ?? layoutError(rooms)} Choose a clear area or adjust the outline.</p>}
      </div>
      <aside className="house-inspector" aria-label="Selected space"><p className="overline">SELECTED SPACE</p><h3>{active.name}</h3>
        <label className="field"><span>Select a space</span><select aria-label="Select a space" value={active.id} onChange={e => onSelect(project.rooms.find(r => r.id === e.target.value)!)}>{project.rooms.map(r => <option key={r.id} value={r.id}>{r.name}{r.visible === false ? ' (hidden)' : ''}</option>)}</select></label>
        <label className="field"><span>Name</span><input key={active.id + active.name} aria-label="Space name" defaultValue={active.name} maxLength={LIMITS.name} onBlur={e => { const name = e.target.value.trim(); if (name && name !== active.name) update({ ...active, name }); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></label>
        <label className="field"><span>Space type</span><select value={active.spaceType ?? 'Room'} onChange={e => update({ ...active, spaceType: e.target.value as SpaceType })}>{SPACE_TYPES.map(type => <option key={type}>{type}</option>)}</select></label>
        <CorridorControls rooms={project.rooms} onPreview={setProposal} onApply={(next, corridor) => { if (!commit(next)) return false; onSelect(corridor); return true; }} />
        <button className="button button-secondary" onClick={() => { const copy = structuredClone(active); copy.id = crypto.randomUUID(); copy.name = `${active.name} copy`.slice(0, LIMITS.name); copy.openings = copy.openings.map(({ connectionId, ...o }) => ({ ...o, id: crypto.randomUUID() })); const box = bounds(footprint(active)); copy.placement = { ...pose(active), x: pose(active).x + box.maxX - box.minX + 1 }; add(copy); }}>Duplicate space</button>
        <details><summary>Floor finish</summary><label className="field"><span>Floor color</span><input aria-label="Floor color" type="color" value={active.floorColor ?? '#b9a387'} onChange={e => update({ ...active, floorColor: e.target.value })} /></label><label className="field"><span>Floor material</span><select aria-label="Floor material" value={active.floorMaterial ?? 'Wood'} onChange={e => update({ ...active, floorMaterial: e.target.value as Room['floorMaterial'] })}>{['Wood','Tile','Concrete'].map(value => <option key={value}>{value}</option>)}</select></label></details>
        <button className="button button-primary" onClick={() => setEditing(true)}><PencilRuler size={16} /> Edit shape & size</button>
        {active.spaceType === 'Stairs' && <p className="house-help">A stairwell reserves floor space. Steps and upper floors are not modeled.</p>}
        {isOpenSpace(active) && <p className="house-help">Dashed edges mark an open area without enclosing walls.</p>}
        {!isOpenSpace(active) && <details className="house-attach" open><summary><Link2 size={16} /> Attach to this room</summary><p className="house-help">Place a new space against a wall of {active.name}.</p>
          <label className="field"><span>Add</span><select aria-label="Attached space type" value={attachKind} onChange={e => setAttachKind(e.target.value as SpaceType)}>{library.map(item => <option key={item.type}>{item.type}</option>)}</select></label>
          <label className="field"><span>Along wall</span><select aria-label="Attachment wall" value={attachWall ?? roomPlan(active.dimensions).edges[0].id} onChange={e => setAttachWall(e.target.value as Wall)}>{roomPlan(active.dimensions).edges.map((edge, i) => <option key={edge.id} value={edge.id}>{edge.id.startsWith('wall-') ? `Wall ${i + 1}` : edge.id[0].toUpperCase() + edge.id.slice(1)} · {edge.span.toFixed(1)} m</option>)}</select></label>
          <label className="house-check"><input type="checkbox" checked={withDoor} onChange={e => setWithDoor(e.target.checked)} /> Add connecting door</label>
          <button className="button button-primary" disabled={project.rooms.length >= LIMITS.rooms} onClick={attach}><Link2 size={16} /> Attach {attachKind.toLowerCase()}</button>
        </details>}
        <details><summary>Position & rotation</summary><div className="house-position">{(['x', 'z', 'rotation'] as const).map(key => <label key={active.id + key + pose(active)[key]}>{key === 'x' ? 'Left / right (m)' : key === 'z' ? 'Up / down (m)' : 'Rotation (°)'}<input aria-label={`Room ${key}`} type="number" step={key === 'rotation' ? 15 : .1} defaultValue={Number(pose(active)[key].toFixed(2))} onBlur={e => { if (!e.target.value) return; const value = Number(e.target.value); if (Number.isFinite(value) && value !== pose(active)[key]) update({ ...active, placement: { ...pose(active), [key]: key === 'rotation' ? (value % 360 + 360) % 360 : value } }); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></label>)}</div><button className="button button-secondary" onClick={() => update({ ...active, placement: { ...pose(active), rotation: (pose(active).rotation + 90) % 360 } })}><RotateCcw size={15} /> Rotate 90°</button></details>
        {!isOpenSpace(active) && <details open><summary>Doors & connections</summary><button className="button button-secondary" onClick={onOpenings}>Doors & windows</button>{!shared.length && <p className="house-help">Move two rooms edge to edge to add a connecting door.</p>}{shared.map((s, i) => { const connected = s.sides[0].room.openings.some(o => o.connectionId && s.sides[1].room.openings.some(other => other.connectionId === o.connectionId)); const name = s.sides.find(s => s.room.id !== active.id)!.room.name; return <button disabled={connected} className="button button-secondary" key={i} onClick={() => { try { const linked = connectRooms(s); commit(project.rooms.map(r => linked.find(n => n.id === r.id) ?? r)); } catch (e) { setError((e as Error).message); } }}>{connected ? `Connected to ${name} ✓` : `Connect to ${name} with door`}</button>; })}</details>}
        <div className="house-remove"><button className="button button-danger" disabled={project.rooms.length <= 1} onClick={() => setRemoving(true)}><Trash2 size={16} /> Remove selected space</button>
          {project.rooms.length <= 1 && <small>Keep at least one space in your house.</small>}
          {removing && <div role="alert"><p>Remove {active.name} and its contents? Connecting doors will also be removed. You can undo this.</p><button className="button button-danger" onClick={remove}>Confirm removal</button><button className="button button-secondary" onClick={() => setRemoving(false)}>Keep space</button></div>}
        </div>
        <button className="button button-secondary" onClick={onClose}><Home size={16} /> Edit selected room</button>
      </aside>
    </div>
    {editing && <FloorPlanEditor room={active} unit={unit} onUnit={setUnit} onSave={next => { const ok = update(next); if (!ok) return false; }} onClose={() => setEditing(false)} />}
  </section>;
}
