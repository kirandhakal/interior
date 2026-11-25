'use client';

import { useState } from 'react';
import { FINISHES, roomWallIds, wallLabel, type Project, type Room } from '@studio/model';
import { copyWallDesign, MAX_WALL_ITEMS, WALL_ITEM_KINDS, type WallDesign, type WallItem, type WallItemKind } from '@studio/wall-design';
import { WALL_SURFACES } from '@studio/wall-surface';
import { NumberField, SelectField } from '@/components/ui';

export function WallDesignPanel({ room, design, selectedId, onSelect, onChange, onItem, onAdd, onDelete }: {
  room: Room; design: WallDesign; selectedId?: string; onSelect: (id?: string) => void;
  onChange: (design: WallDesign) => void; onItem: (item: WallItem) => void; onAdd: (kind: WallItemKind) => void; onDelete: () => void;
}) {
  const selected = design.items.find(item => item.id === selectedId);
  const paint = design.paint ?? room.walls[design.wall];
  const index = design.items.findIndex(item => item.id === selectedId);
  const canMove = (direction: number) => !!selected && !!design.items[index + direction] &&
    (selected.kind === 'Paint section') === (design.items[index + direction].kind === 'Paint section');
  const moveLayer = (direction: number) => {
    const items = [...design.items];
    [items[index], items[index + direction]] = [items[index + direction], items[index]];
    onChange({ ...design, items });
  };
  return <>
    <section className="wall-design-section" aria-label="Surface paint">
      <h4>Surface paint</h4>
      <label className="wall-color-field">Wall color<input type="color" aria-label="Wall color" value={paint.color}
        onChange={event => onChange({ ...design, paint: { ...paint, color: event.currentTarget.value } })} /><code>{paint.color}</code></label>
      <SelectField label="Surface finish" value={paint.finish} values={FINISHES}
        onChange={finish => onChange({ ...design, paint: { ...paint, finish } })} />
      <p className="wall-property-note">Changes apply to this {design.surface.toLowerCase()} face. Other faces keep their own designs.</p>
    </section>
    <section className="wall-design-section" aria-label="Add wall items">
      <h4>Add to wall</h4>
      <div className="wall-item-catalog">{WALL_ITEM_KINDS.map(kind => <button type="button" className="button button-secondary" key={kind}
        disabled={design.items.length >= MAX_WALL_ITEMS} onClick={() => onAdd(kind)}>Add {kind.toLowerCase()}</button>)}</div>
    </section>
    <section className="wall-design-section" aria-label="Design layers">
      <h4>Design layers <span>({design.items.length}/{MAX_WALL_ITEMS})</span></h4>
      {!design.items.length && <p className="wall-property-note">Draw a paint section or add an item, then drag it into place.</p>}
      <div className="wall-opening-list">{[...design.items].reverse().map(item => <button type="button" key={item.id}
        aria-pressed={item.id === selectedId} onClick={() => onSelect(item.id)}><span>{item.name}</span><small>{item.kind}</small></button>)}</div>
      {!!design.items.length && <p className="wall-property-note">Paint sections stay behind mounted objects.</p>}
    </section>
    {selected && <section className="wall-design-section" aria-label="Selected item controls">
      <h4>Edit {selected.kind.toLowerCase()}</h4>
      <label className="field"><span>Item name</span><input key={selected.id + selected.name} aria-label="Item name" defaultValue={selected.name} maxLength={80}
        onBlur={event => { if (event.currentTarget.value !== selected.name) onItem({ ...selected, name: event.currentTarget.value.trim() }); }} /></label>
      <div className="wall-item-fields" key={selected.id}>
        <NumberField label="Left · U" value={selected.u} onChange={u => onItem({ ...selected, u })} />
        <NumberField label="Bottom · V" value={selected.v} onChange={v => onItem({ ...selected, v })} />
        <NumberField label="Item width" value={selected.width} min={0.02} onChange={width => onItem({ ...selected, width })} />
        <NumberField label="Item height" value={selected.height} min={0.02} onChange={height => onItem({ ...selected, height })} />
        <NumberField label="Item rotation" value={selected.rotation} min={0} max={360} unit="°" step={1} onChange={rotation => onItem({ ...selected, rotation })} />
        {selected.kind !== 'Paint section' && <NumberField label="Item depth" value={selected.depth} min={0} max={0.6} onChange={depth => onItem({ ...selected, depth })} />}
      </div>
      <label className="wall-color-field">Item color<input type="color" aria-label="Item color" value={selected.color}
        onChange={event => onItem({ ...selected, color: event.currentTarget.value })} /><code>{selected.color}</code></label>
      <SelectField label="Item finish" value={selected.finish} values={FINISHES} onChange={finish => onItem({ ...selected, finish })} />
      <div className="wall-item-actions">
        <button type="button" className="button" disabled={!canMove(1)} onClick={() => moveLayer(1)}>Bring forward</button>
        <button type="button" className="button" disabled={!canMove(-1)} onClick={() => moveLayer(-1)}>Send backward</button>
        <button type="button" className="button" disabled={design.items.length >= MAX_WALL_ITEMS} onClick={() => {
          const item = { ...selected, id: crypto.randomUUID(), name: `${selected.name.slice(0, 73)} copy` };
          onChange({ ...design, items: [...design.items, item] }); onSelect(item.id);
        }}>Duplicate item</button>
        <button type="button" className="button" onClick={onDelete}>Delete item</button>
      </div>
      <p className="wall-property-note">Drag the item to move it. Drag its corner handle to resize. Arrow keys move by 1 cm; Shift + arrow by 10 cm.</p>
    </section>}
  </>;
}

export function CopyWallDesignPanel({ project, room, design, onChange }: {
  project: Project; room: Room; design: WallDesign; onChange: (room: Room) => void;
}) {
  const [targetRoom, setTargetRoom] = useState(room.id);
  const destination = project.rooms.find(value => value.id === targetRoom) ?? room;
  const [targetWall, setTargetWall] = useState(roomWallIds(room.dimensions).find(id => id !== design.wall) ?? design.wall);
  const wall = roomWallIds(destination.dimensions).includes(targetWall) ? targetWall : roomWallIds(destination.dimensions)[0];
  const [surface, setSurface] = useState(design.surface);
  const [sizing, setSizing] = useState<'Actual size' | 'Scale to fit'>('Actual size');
  const [mode, setMode] = useState<'Replace' | 'Merge'>('Replace');
  const [notice, setNotice] = useState('');
  let index = 0;
  const preview = copyWallDesign(room, design.wall, design.surface, destination, wall, surface, sizing, mode, () => `copy-preview-${index++}`);
  return <details className="wall-design-section wall-copy-panel" onChange={() => setNotice('')}>
    <summary>Copy design to another wall</summary>
    <SelectField label="Destination room" value={destination.id} values={project.rooms.map(value => value.id)} onChange={setTargetRoom}
      display={id => project.rooms.find(value => value.id === id)!.name} />
    <SelectField label="Destination wall" value={wall} values={roomWallIds(destination.dimensions)} onChange={setTargetWall}
      display={id => wallLabel(destination.dimensions, id)} />
    <SelectField label="Destination surface" value={surface} values={WALL_SURFACES} onChange={setSurface} />
    <SelectField label="Copy sizing" value={sizing} values={['Actual size', 'Scale to fit']} onChange={setSizing} />
    <SelectField label="Existing design" value={mode} values={['Replace', 'Merge']} onChange={setMode} />
    <p className="wall-property-note">{mode === 'Replace' ? 'Replace the destination face’s paint and decorative items.' : 'Add these items to the destination and apply this face’s paint.'}
      {' '}Doors, windows and wall geometry stay in place. Scale to fit preserves proportions and anchors at the lower-left corner. You can undo this copy.</p>
    <p className="wall-property-note">Copy {design.items.length} {design.items.length === 1 ? 'item' : 'items'} and surface paint to {destination.name} · {wallLabel(destination.dimensions, wall)} · {surface}.</p>
    {'error' in preview && <p className="inline-error" role="status">{preview.error}</p>}
    <button type="button" className="button button-primary" disabled={'error' in preview} onClick={() => {
      const result = copyWallDesign(room, design.wall, design.surface, destination, wall, surface, sizing, mode, () => crypto.randomUUID());
      if ('room' in result) { onChange(result.room); setNotice('Design copied. The destination can now be selected above.'); }
      else setNotice(result.error);
    }}>Copy wall design</button>
    {notice && <p role="status" className="wall-property-note">{notice}</p>}
  </details>;
}
