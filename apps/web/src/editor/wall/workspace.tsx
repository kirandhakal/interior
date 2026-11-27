'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, Redo2, Save, Undo2 } from 'lucide-react';
import { roomWallIds, wallLabel, type Project, type Room, type Wall } from '@studio/model';
import { MEASUREMENT_UNITS, formatMeasurement, type MeasurementUnit } from '@studio/measurement';
import { isolateWall, wallLocalToWorld, wallPointIsPaintable, type WallPoint, type WallSurface } from '@studio/wall-surface';
import { IconButton, Modal, Segmented, SelectField } from '@/components/ui';
import { WallElevation, type WallEditorTool } from './elevation';
import { WallIsolation } from './isolation';
import { WallSelection } from './selection';
import { getWallDesign, placeWallItem, setWallDesign, wallDesignsError, WALL_ITEM_PRESETS, type WallDesign, type WallItem, type WallItemKind } from '@studio/wall-design';
import { CopyWallDesignPanel, WallDesignPanel } from './design-panel';
import { OpeningControls } from '../objects';
import { errorMessage } from '@/projects/api';

export function WallWorkspace({ project, roomId, wallId, unit, onUnit, onClose, onChange, canUndo, canRedo, onUndo, onRedo, onSave, saving }: {
  project: Project; roomId: string; wallId: Wall; unit: MeasurementUnit;
  onUnit: (unit: MeasurementUnit) => void; onClose: () => void;
  onChange: (room: Room, group?: string) => void; canUndo: boolean; canRedo: boolean;
  onUndo: () => void; onRedo: () => void; onSave: () => Promise<void>; saving: boolean;
}) {
  const [target, setTarget] = useState({ roomId, wallId });
  const [surface, setSurface] = useState<WallSurface>('Interior');
  const [view, setView] = useState<'2D elevation' | '3D preview'>('2D elevation');
  const [openingId, setOpening] = useState<string>();
  const [point, setPoint] = useState<WallPoint>();
  const [selectedItem, setSelectedItem] = useState<string>();
  const [tool, setTool] = useState<WallEditorTool>('Select');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const room = project.rooms.find(room => room.id === target.roomId) ?? project.rooms[0];
  const id = roomWallIds(room.dimensions).includes(target.wallId) ? target.wallId : roomWallIds(room.dimensions)[0];
  const wall = useMemo(() => isolateWall(room, id, surface), [room, id, surface]);
  const selected = wall.apertures.find(item => item.opening.id === openingId);
  const measurement = (value: number, power = 1) => formatMeasurement(value, unit, power);
  const resetInspection = () => { setOpening(undefined); setPoint(undefined); setSelectedItem(undefined); setError(''); setMessage(''); };
  const world = point && wallLocalToWorld(wall.frame, point);
  const design = getWallDesign(room, id, surface);
  const selectItem = (id?: string) => { setSelectedItem(id); setOpening(undefined); if (id) setTool('Select'); };
  const selectOpening = (id: string) => { setOpening(id); setSelectedItem(undefined); };
  const change = (next: Room, group?: string) => {
    const error = wallDesignsError(next);
    if (error) { setError(error); return false; }
    setError(''); setMessage(''); onChange(next, group); return true;
  };
  const changeDesign = (next: WallDesign) => change(setWallDesign(room, next));
  const changeItem = (item: WallItem) => changeDesign({ ...design, items: design.items.map(value => value.id === item.id ? item : value) });
  const deleteItem = () => { if (changeDesign({ ...design, items: design.items.filter(value => value.id !== selectedItem) })) setSelectedItem(undefined); };
  const addItem = (kind: WallItemKind) => {
    const item = placeWallItem(room, id, surface, kind, crypto.randomUUID());
    if (!item) { setError('No clear space fits this item. Use Draw paint for a smaller section or choose another wall.'); return; }
    if (changeDesign({ ...design, items: [...design.items, item] })) { selectItem(item.id); setView('2D elevation'); }
  };

  return <Modal title="Wall workspace" onClose={onClose} wide>
    <div className="wall-workspace">
      <header className="wall-workspace-header">
        <button type="button" className="button button-secondary" onClick={onClose}><ArrowLeft size={16} /> Return to room</button>
        <div><p className="overline">{room.name} · {surface} surface</p><h3>{wallLabel(room.dimensions, id)}</h3></div>
        <Segmented label="Wall view" value={view} values={['2D elevation', '3D preview']} onChange={setView} />
        <div className="wall-history-tools" role="group" aria-label="Wall design history">
          <IconButton label="Undo wall edit" disabled={!canUndo} onClick={onUndo}><Undo2 size={17} /></IconButton>
          <IconButton label="Redo wall edit" disabled={!canRedo} onClick={onRedo}><Redo2 size={17} /></IconButton>
          <button type="button" className="button button-primary" disabled={saving} onClick={() => {
            setMessage(''); void onSave().then(() => setMessage('Project saved.')).catch(error => setError(errorMessage(error)));
          }}><Save size={16} />{saving ? 'Saving…' : 'Save design'}</button>
        </div>
      </header>
      {error && <p className="wall-design-error" role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <div className="wall-workspace-body">
        <section className="wall-canvas-column" aria-label="Wall preview">
          {view === '2D elevation' && <div className="wall-edit-toolbar">
            <Segmented label="Wall editing tool" value={tool} values={['Select', 'Pan', 'Draw paint', 'Draw polygon']} onChange={setTool} />
            <span>Draw a section, or select an item to move and resize.</span>
          </div>}
          {view === '2D elevation' ? <WallElevation key={`${room.id}/${id}/${surface}`} wall={wall} unit={unit}
            selectedOpening={openingId} onOpening={selectOpening} onPoint={setPoint} items={design.items} selectedItem={selectedItem} tool={tool}
            onPolygon={points => {
              const u=Math.min(...points.map(p=>p.u)), v=Math.min(...points.map(p=>p.v));
              const width=Math.max(...points.map(p=>p.u))-u, height=Math.max(...points.map(p=>p.v))-v;
              const item: WallItem={...WALL_ITEM_PRESETS['Paint section'],id:crypto.randomUUID(),name:'Polygon paint',kind:'Paint section',rotation:0,finish:'Matte',u,v,width,height,
                polygon:points.map(p=>({u:(p.u-u)/width,v:(p.v-v)/height}))};
              if(changeDesign({...design,items:[...design.items,item]})) selectItem(item.id);
            }}
            onSelectItem={selectItem} onChangeItem={changeItem} onDeleteItem={deleteItem} onDraw={rect => {
              const item: WallItem = { ...WALL_ITEM_PRESETS['Paint section'], ...rect, id: crypto.randomUUID(), name: 'Paint section',
                kind: 'Paint section', rotation: 0, finish: 'Matte' };
              if (changeDesign({ ...design, items: [...design.items, item] })) selectItem(item.id);
            }} />
            : <WallIsolation key={`${room.id}/${id}/${surface}`} wall={wall} onOpening={selectOpening} onItem={selectItem} selectedItem={selectedItem} />}
          <p className="wall-instructions">{view === '2D elevation' ? 'Drag empty space to pan · Scroll to zoom · Escape cancels a gesture · Grid: 0.5 m'
            : 'Drag to orbit · Right-drag or choose Pan to pan · Scroll to zoom'}</p>
          {view === '2D elevation' && <div className="wall-coordinate-readout">
            {point && world ? <><span>U {measurement(point.u)} · V {measurement(point.v)}</span>
              <span>World X {measurement(world.x)} · Y {measurement(world.y)} · Z {measurement(world.z)}</span>
              <span>{wallPointIsPaintable(wall, point) ? 'Wall surface' : 'Opening or outside wall'}</span></>
              : <span>Move over the elevation to inspect surface coordinates.</span>}
          </div>}
        </section>
        <aside className="wall-inspector" aria-label="Wall properties">
          <WallSelection rooms={project.rooms} room={room} wall={id} surface={surface}
            onRoom={roomId => {
              const next = project.rooms.find(room => room.id === roomId)!;
              setTarget({ roomId, wallId: roomWallIds(next.dimensions)[0] }); resetInspection();
            }} onWall={wallId => { setTarget({ roomId: room.id, wallId }); resetInspection(); }}
            onSurface={value => { setSurface(value); resetInspection(); }} />
          <SelectField label="Wall measurement units" value={unit} values={MEASUREMENT_UNITS} onChange={onUnit} />
          <WallDesignPanel room={room} design={design} selectedId={selectedItem} onSelect={selectItem}
            onChange={changeDesign} onItem={changeItem} onAdd={addItem} onDelete={deleteItem} />
          <CopyWallDesignPanel key={`${room.id}/${id}/${surface}`} project={project} room={room} design={design} onChange={change} />
          <details className="wall-design-section"><summary>Edit doors & windows</summary>
            <OpeningControls room={room} wall={id} onlyWall selection={openingId ? { type: 'opening', id: openingId } : null}
              onChange={change} notify={setError} onSelect={hit => {
                if (hit?.type === 'wall') { setTarget({ roomId: room.id, wallId: hit.wall }); resetInspection(); }
                else if (hit?.type === 'opening') {
                  const opening = room.openings.find(item => item.id === hit.id);
                  if (opening) setTarget({ roomId: room.id, wallId: opening.wall });
                  selectOpening(hit.id);
                } else setOpening(undefined);
              }} />
          </details>
          <details className="wall-design-section"><summary>Wall measurements & properties</summary>
          <dl className="wall-properties">
            <div><dt>Face width</dt><dd>{measurement(wall.frame.width)}</dd></div>
            <div><dt>Height</dt><dd>{measurement(wall.frame.height)}</dd></div>
            <div><dt>Thickness</dt><dd>{measurement(wall.frame.wall.thickness)}</dd></div>
            <div><dt>Gross area</dt><dd>{measurement(wall.grossArea, 2)}</dd></div>
            <div><dt>Net surface area</dt><dd>{measurement(wall.netArea, 2)}</dd></div>
            <div><dt>Paint</dt><dd><span className="wall-paint-chip" style={{ background: wall.paint.color }} />{wall.paint.color}</dd></div>
            <div><dt>Finish</dt><dd>{wall.paint.finish}</dd></div>
            <div><dt>Wall ID</dt><dd>{id}</dd></div>
            <div><dt>Room ID</dt><dd>{room.id}</dd></div>
          </dl>
          <p className="wall-property-note">U starts at the visible lower-left corner; V measures height from the floor.</p>
          </details>
          <section aria-label="Wall openings">
            <h4>Doors & windows <span>({wall.openings.length})</span></h4>
            {wall.openings.length === 0 ? <p className="wall-property-note">No openings on this wall.</p> : <div className="wall-opening-list">
              {wall.openings.map((opening, index) => <button type="button" key={opening.id} aria-pressed={openingId === opening.id}
                onClick={() => setOpening(opening.id)}><span>{opening.kind} {index + 1}</span><small>{measurement(opening.width)} × {measurement(opening.height)}</small></button>)}
            </div>}
            {selected && <dl className="wall-properties" aria-label="Opening properties">
              <div><dt>ID</dt><dd>{selected.opening.id}</dd></div>
              <div><dt>Width × height</dt><dd>{measurement(selected.opening.width)} × {measurement(selected.height)}</dd></div>
              <div><dt>U · left edge</dt><dd>{measurement(selected.u)}</dd></div>
              <div><dt>Sill height · V</dt><dd>{measurement(selected.v)}</dd></div>
              <div><dt>Wall offset</dt><dd>{measurement(selected.opening.offset)}</dd></div>
              <div><dt>Open angle</dt><dd>{selected.opening.openAngle ?? 0}°</dd></div>
              {selected.opening.kind === 'Door' && <div><dt>Hinge</dt><dd>{selected.opening.hinge ?? 'Left'}</dd></div>}
              {selected.opening.curtains && <div><dt>Curtains</dt><dd>{selected.opening.curtains.length} · {selected.opening.curtains.drawn}% drawn · {selected.opening.curtains.color}</dd></div>}
            </dl>}
          </section>
        </aside>
      </div>
    </div>
  </Modal>;
}
