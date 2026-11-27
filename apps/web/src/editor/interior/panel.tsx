'use client';

import { useState } from 'react';
import { Armchair, Copy, Plus, Search } from 'lucide-react';
import {
  FURNITURE, FURNITURE_SCALE, INTERIOR_CATALOG, INTERIOR_CATEGORIES, LIMITS, clamp,
  fitFurniture, furnitureFitsRoom, getDisplay, hasCabinetDoors, hasDisplay, roomPlan,
  type DisplaySettings, type Furniture, type FurnitureKind, type Room,
} from '@studio/model';
import { NumberField, RangeField, SelectField } from '@/components/ui';
import { ObjectList } from '../object-list';
import { INTERIOR_DRAG_TYPE } from '../interior-placement';
import type { Hit } from '../scene/room-scene';

const filters = ['All rooms', ...INTERIOR_CATEGORIES] as const;
const monitorCounts = ['1', '2', '3'] as const;
const aliases: Partial<Record<FurnitureKind, string>> = {
  TV: 'television screen',
  'Desktop PC': 'computer workstation monitor screen desktop',
  Range: 'stove oven cooker',
  Refrigerator: 'fridge freezer',
  Bed: 'mattress',
};

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (color: string) => void }) {
  return <label className="field interior-color">
    <span>{label}</span>
    <input type="color" value={value} onChange={event => onChange(event.currentTarget.value.toUpperCase())} />
  </label>;
}

export function InteriorPanel({ room, selection, onAddInterior, onSelect, onChange, notify }: {
  room: Room;
  selection: Hit | null;
  onAddInterior: (kind: FurnitureKind) => void;
  onSelect: (hit: Hit | null) => void;
  onChange: (room: Room, group?: string) => void;
  notify: (message: string) => void;
}) {
  const [category, setCategory] = useState<typeof filters[number]>('All rooms');
  const [search, setSearch] = useState('');
  const active = selection?.type === 'furniture' ? room.furniture.find(item => item.id === selection.id) : undefined;
  const atLimit = room.furniture.length >= LIMITS.furniture;
  const query = search.trim().toLowerCase();
  const kinds = FURNITURE.filter(kind => (category === 'All rooms' || INTERIOR_CATALOG[kind].category === category) &&
    (kind + ' ' + (aliases[kind] ?? '')).toLowerCase().includes(query));

  function update(item: Furniture, changes: Partial<Furniture>, field?: string) {
    const next = { ...item, ...changes };
    if (!furnitureFitsRoom(room.dimensions, next)) {
      notify('This item would extend beyond the room at that size or angle.');
      return;
    }
    const fitted = fitFurniture(room.dimensions, next);
    onChange({ ...room, furniture: room.furniture.map(value => value.id === item.id ? fitted : value) },
      field ? item.id + ':' + field : undefined);
  }

  function duplicate(item: Furniture) {
    if (atLimit) return;
    const id = crypto.randomUUID();
    const offsets = [[0.35, 0.25], [-0.35, -0.25], [0.35, -0.25], [-0.35, 0.25]];
    const copy = offsets.map(([x, z]) => fitFurniture(room.dimensions, { ...item, id, x: item.x + x, z: item.z + z }))
      .find(candidate => Math.hypot(candidate.x - item.x, candidate.z - item.z) > 0.02);
    if (!copy) { notify('Resize the item or room to make space for a copy.'); return; }
    onChange({ ...room, furniture: [...room.furniture, copy] });
    onSelect({ type: 'furniture', id: copy.id });
  }

  return <>
    <section className="paint-section">
      <h3>Add an interior item</h3>
      <p className="empty-inline">{atLimit ? `This room has ${LIMITS.furniture} items.` : 'Drag an item into the preview, or click to add it.'}</p>
      <SelectField label="Category" values={filters} value={category} onChange={setCategory} />
      <label className="color-search">
        <Search size={16} aria-hidden="true" />
        <input aria-label="Search interiors" type="search" placeholder="Search furniture and appliances" value={search}
          onChange={event => setSearch(event.currentTarget.value)} />
      </label>
      {kinds.length ? <div className="two-fields interior-catalog" aria-label="Available interior items" role="group">
        {kinds.map(kind => <button type="button" key={kind} className="button button-secondary fixture-card"
          disabled={atLimit} draggable={!atLimit} onClick={() => onAddInterior(kind)}
          onDragStart={event => {
            event.dataTransfer.setData(INTERIOR_DRAG_TYPE, kind);
            event.dataTransfer.effectAllowed = 'copy';
          }}><Plus size={15} />{kind}</button>)}
      </div> : <p className="empty-inline" role="status">No items match your search.</p>}
    </section>
    <ObjectList entries={room.furniture} icon={Armchair} selected={active?.id}
      onSelect={item => onSelect({ type: 'furniture', id: item.id })}
      onRemove={item => {
        onChange({ ...room, furniture: room.furniture.filter(value => value.id !== item.id) });
        if (item.id === active?.id) onSelect(null);
      }} />
    {active && <ItemSettings key={active.id} item={active} room={room} atLimit={atLimit}
      onChange={(changes, field) => update(active, changes, field)} onDuplicate={() => duplicate(active)} />}
  </>;
}

function ItemSettings({ item, room, atLimit, onChange, onDuplicate }: {
  item: Furniture; room: Room; atLimit: boolean; onChange: (changes: Partial<Furniture>, field?: string) => void; onDuplicate: () => void;
}) {
  const bounds = roomPlan(room.dimensions).bounds;
  const size = Math.round((item.scale ?? 1) * 100);
  const display = item.display ?? getDisplay(item.kind);
  const setDisplay = (changes: Partial<DisplaySettings>, field?: string) => onChange({ display: { ...display, ...changes } }, field);

  return <section className="object-details" aria-label={`${item.kind} settings`}>
    <div className="fixture-heading">
      <h3>{item.kind} settings</h3>
      <button className="button button-secondary" type="button" onClick={onDuplicate} disabled={atLimit}>
        <Copy size={14} /> Duplicate
      </button>
    </div>
    <div className="two-fields">
      <NumberField label="X position" value={item.x} min={bounds.minX} max={bounds.maxX} onChange={x => onChange({ x })} />
      <NumberField label="Z position" value={item.z} min={bounds.minZ} max={bounds.maxZ} onChange={z => onChange({ z })} />
    </div>
    <RangeField label="Rotation" value={item.rotation} min={0} max={360} step={1} unit="°"
      onChange={rotation => onChange({ rotation }, 'rotation')} />
    <div className="two-fields">
      <NumberField label="Size" value={size} min={FURNITURE_SCALE.min * 100} max={FURNITURE_SCALE.max * 100} step={1} unit="%"
        onChange={percent => onChange({ scale: clamp(percent / 100, FURNITURE_SCALE.min, FURNITURE_SCALE.max) })} />
      <ColorField label="Finish color" value={item.color ?? '#B99677'} onChange={color => onChange({ color }, 'color')} />
    </div>
    {item.color && <button className="text-button" type="button" onClick={() => onChange({ color: undefined })}>Restore original finish</button>}
    {hasCabinetDoors(item.kind) && <RangeField label="Cabinet door angle" value={item.doorAngle ?? 0} min={0} max={90} step={1} unit="°"
      onChange={doorAngle => onChange({ doorAngle }, 'cabinet doors')} />}
    {hasDisplay(item.kind) && <section className="object-details display-controls">
      <div className="fixture-heading">
        <h3>Screen light</h3>
        <button type="button" className="button button-secondary" aria-label="Screen power" aria-pressed={display.enabled}
          onClick={() => setDisplay({ enabled: !display.enabled })}>{display.enabled ? 'On' : 'Off'}</button>
      </div>
      {item.kind === 'Desktop PC' && <SelectField label="Monitors" values={monitorCounts} value={String(display.count) as typeof monitorCounts[number]}
        onChange={count => setDisplay({ count: Number(count) })} />}
      <RangeField label="Screen brightness" value={display.brightness} min={0} max={100} step={1} unit="%"
        onChange={brightness => setDisplay({ brightness }, 'screen brightness')} />
      <ColorField label="Screen light color" value={display.color} onChange={color => setDisplay({ color }, 'screen color')} />
    </section>}
  </section>;
}
