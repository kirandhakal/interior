'use client';

import { useState } from 'react';
import { LampCeiling, Plus } from 'lucide-react';
import {
  CEILING_CATALOG, CEILING_DECOR, CEILING_DECOR_DRAG_TYPE, CEILING_DECOR_SCALE, CEILING_FINISHES, CEILING_LIGHTS,
  LIMITS, ceilingDecorBounds, clamp, fitCeilingDecor,
  type CeilingDecor, type CeilingDecorKind, type LightKind, type Room,
} from '@studio/model';
import { NumberField, RangeField, SelectField } from '@/components/ui';
import { FIXTURE_DRAG_TYPE } from '../lighting/fixtures';
import { FixtureSettings } from '../lighting/panel';
import { ObjectList } from '../object-list';
import type { Hit } from '../scene/room-scene';

const categories = ['Natural', 'Lighting', 'Patterns & textures', 'Party', 'Fabrics'] as const;

export function CeilingPanel({ room, selection, inCeilingView, onAddDecor, onAddFixture, onSelect, onChange }: {
  room: Room;
  selection: Hit | null;
  inCeilingView: boolean;
  onAddDecor: (kind: CeilingDecorKind) => void;
  onAddFixture: (kind: LightKind) => void;
  onSelect: (hit: Hit | null) => void;
  onChange: (room: Room, group?: string) => void;
}) {
  const [category, setCategory] = useState<typeof categories[number]>('Natural');
  const decor = room.ceilingDecor ?? [];
  const lights = room.lights.filter(light => light.mount === 'Ceiling');
  const active = selection?.type === 'ceilingDecor' ? decor.find(item => item.id === selection.id) : undefined;
  const activeLight = selection?.type === 'light' ? lights.find(item => item.id === selection.id) : undefined;
  const entries = [...decor, ...lights];
  const lighting = category === 'Lighting';
  const atLimit = lighting ? room.lights.length >= LIMITS.lights : decor.length >= LIMITS.ceilingDecor;

  function addButton(kind: string, dragType: string, onAdd: () => void) {
    const draggable = inCeilingView && !atLimit;
    return <button type="button" key={kind} className="button button-secondary fixture-card" disabled={atLimit}
      draggable={draggable} onClick={onAdd} onDragStart={event => {
        event.dataTransfer.setData(dragType, kind);
        event.dataTransfer.effectAllowed = 'copy';
      }}><Plus size={15} /> {kind}</button>;
  }

  function update(item: CeilingDecor, changes: Partial<CeilingDecor>, field?: keyof CeilingDecor) {
    const fitted = fitCeilingDecor(room.dimensions, { ...item, ...changes });
    onChange({ ...room, ceilingDecor: decor.map(value => value.id === item.id ? fitted : value) }, field && `${item.id}:${field}`);
  }

  return <div className="panel-flow">
    <div className="panel-intro">
      <span className="panel-icon"><LampCeiling size={19} /></span>
      <div><h2>Ceiling decor</h2><p>Style the ceiling and the space below it.</p></div>
    </div>
    <section className="paint-section">
      <SelectField label="Category" values={categories} value={category} onChange={setCategory} />
      {category === 'Patterns & textures' ? <SelectField label="Ceiling finish" values={CEILING_FINISHES}
        value={room.ceilingFinish ?? 'Plain plaster'} onChange={ceilingFinish => onChange({ ...room, ceilingFinish })} />
        : <>
          <p className="empty-inline">{atLimit ? 'This room has reached the limit for these items.'
            : inCeilingView ? 'Click to add an item, or drop it onto the ceiling.' : 'Click an item to add it and open Ceiling view.'}</p>
          <div className="two-fields interior-catalog" role="group" aria-label="Available ceiling items">
            {lighting ? CEILING_LIGHTS.map(kind => addButton(kind, FIXTURE_DRAG_TYPE, () => onAddFixture(kind)))
              : CEILING_DECOR.filter(kind => CEILING_CATALOG[kind].category === category)
                .map(kind => addButton(kind, CEILING_DECOR_DRAG_TYPE, () => onAddDecor(kind)))}
          </div>
        </>}
    </section>

    {active && <DecorSettings key={active.id} item={active} room={room} onChange={(changes, field) => update(active, changes, field)} />}
    {activeLight && <FixtureSettings key={activeLight.id} light={activeLight} room={room} onChange={onChange} />}

    <section className="paint-section">
      <h3>On this ceiling</h3>
      <ObjectList entries={entries} selected={selection?.type === 'light' || selection?.type === 'ceilingDecor' ? selection.id : undefined}
        icon={LampCeiling} onSelect={item => onSelect({ type: 'mount' in item ? 'light' : 'ceilingDecor', id: item.id })}
        onRemove={item => {
          onChange('mount' in item ? { ...room, lights: room.lights.filter(light => light.id !== item.id) }
            : { ...room, ceilingDecor: decor.filter(value => value.id !== item.id) });
          if (item === active || item === activeLight) onSelect(null);
        }} />
    </section>
  </div>;
}

function DecorSettings({ item, room, onChange }: {
  item: CeilingDecor;
  room: Room;
  onChange: (changes: Partial<CeilingDecor>, field?: keyof CeilingDecor) => void;
}) {
  const bounds = ceilingDecorBounds(room.dimensions, item);
  return <section className="object-details" aria-label={`${item.kind} settings`}>
    <h3>{item.kind} settings</h3>
    <div className="two-fields">
      <NumberField label="X position" value={item.x} min={-bounds.x} max={bounds.x} onChange={x => onChange({ x })} />
      <NumberField label="Z position" value={item.z} min={-bounds.z} max={bounds.z} onChange={z => onChange({ z })} />
    </div>
    <RangeField label="Rotation" value={item.rotation} min={0} max={360} step={1} unit="°"
      onChange={rotation => onChange({ rotation }, 'rotation')} />
    <div className="two-fields">
      <NumberField label="Size" value={Math.round(item.scale * 100)} min={CEILING_DECOR_SCALE.min * 100}
        max={CEILING_DECOR_SCALE.max * 100} step={1} unit="%" onChange={percent => onChange({
          scale: clamp(percent / 100, CEILING_DECOR_SCALE.min, CEILING_DECOR_SCALE.max),
        })} />
      <label className="field interior-color">
        <span>Color</span>
        <input type="color" value={item.color} onChange={event => onChange({ color: event.currentTarget.value }, 'color')} />
      </label>
    </div>
  </section>;
}
