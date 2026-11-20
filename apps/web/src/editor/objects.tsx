'use client';

import {
  Armchair, DoorOpen, Lightbulb, Plus, Trash2, LampCeiling, RectangleVertical, type LucideIcon,
} from 'lucide-react';
import {
  FURNITURE, LIGHTS, LIMITS, OPENINGS, WALL_LABELS, WALLS, clamp, fitFurniture, fitLight, fitOpening, furnitureBounds, furnitureFitsRoom,
  openingFits, wallSpan, type Furniture, type Light, type Opening, type Room, type Wall,
} from '@studio/model';
import { IconButton, NumberField, RangeField, SelectField } from '@/components/ui';
import { addFurniture, addLight, addOpening } from './rooms';
import type { Hit } from './scene/room-scene';

export type ObjectTab = 'Openings' | 'Lighting' | 'Furniture';

type ObjectPanelProps = {
  tab: ObjectTab;
  room: Room;
  wall: Wall;
  selection: Hit | null;
  onSelect: (selection: Hit | null) => void;
  onChange: (room: Room, group?: string) => void;
  notify: (message: string) => void;
};

const tabs = {
  Openings: { icon: DoorOpen, heading: 'Doors & windows', description: 'Place openings along your walls.' },
  Lighting: { icon: Lightbulb, heading: 'Room lighting', description: 'Position and tune your fixtures.' },
  Furniture: { icon: Armchair, heading: 'Furniture', description: 'Furnish and arrange your room.' },
};

type Editable = Opening | Furniture | Light;

function ObjectList<T extends Editable>({ entries, selected, icon: Icon, onSelect, onRemove }: {
  entries: T[]; selected?: string; icon: LucideIcon; onSelect: (item: T) => void; onRemove: (item: T) => void;
}) {
  if (entries.length === 0) return <p className="empty-inline">Nothing added yet.</p>;
  return <ul className="object-list">
    {entries.map((item, index) => <li key={item.id} data-active={selected === item.id}>
      <button type="button" aria-pressed={selected === item.id} onClick={() => onSelect(item)}>
        <Icon size={16} />
        <span>{item.kind}{'wall' in item && <small>{WALL_LABELS[item.wall]}</small>}</span>
        <span className="sr-only"> {index + 1}</span>
      </button>
      <IconButton label={`Remove ${item.kind.toLowerCase()} ${index + 1}`} onClick={() => onRemove(item)}><Trash2 size={15} /></IconButton>
    </li>)}
  </ul>;
}

export function ObjectPanel(props: ObjectPanelProps) {
  const { icon: Icon, heading, description } = tabs[props.tab];
  return <div className="panel-flow">
    <div className="panel-intro">
      <span className="panel-icon"><Icon size={19} /></span>
      <div><h2>{heading}</h2><p>{description}</p></div>
    </div>
    {props.tab === 'Openings' ? <OpeningControls {...props} />
      : props.tab === 'Lighting' ? <LightControls {...props} />
      : <FurnitureControls {...props} />}
  </div>;
}

function OpeningControls({ room, wall, selection, onSelect, onChange, notify }: ObjectPanelProps) {
  const active = selection?.type === 'opening' ? room.openings.find(item => item.id === selection.id) : undefined;
  const update = (item: Opening, changes: Partial<Opening>) => {
    const next = fitOpening(room.dimensions, { ...item, ...changes });
    if (!openingFits(room, next)) {
      notify('That opening would overlap another. Try another position or wall.');
      return;
    }
    onChange({ ...room, openings: room.openings.map(opening => opening.id === item.id ? next : opening) });
  };
  return <>
    <div className="two-fields">
      {OPENINGS.map(kind => <button type="button" key={kind} className="button button-secondary"
        disabled={room.openings.length >= LIMITS.openings} onClick={() => {
          const opening = addOpening(room, kind, wall);
          if (!opening) { notify('There is no space on this wall. Choose another wall.'); return; }
          onChange({ ...room, openings: [...room.openings, opening] });
          onSelect({ type: 'opening', id: opening.id });
        }}><Plus size={16} /> {kind}</button>)}
    </div>
    <SelectField label="Wall for new openings" values={WALLS} value={wall} display={side => WALL_LABELS[side]}
      onChange={side => onSelect({ type: 'wall', wall: side })} />
    <ObjectList entries={room.openings} icon={RectangleVertical} selected={active?.id}
      onSelect={item => onSelect({ type: 'opening', id: item.id })}
      onRemove={item => {
        onChange({ ...room, openings: room.openings.filter(opening => opening.id !== item.id) });
        if (active?.id === item.id) onSelect(null);
      }} />
    {active && <section className="object-details" key={active.id}>
      <h3>{active.kind} placement</h3>
      <SelectField label="Wall" values={WALLS} value={active.wall} display={side => WALL_LABELS[side]} onChange={side => update(active, { wall: side })} />
      <div className="two-fields">
        <NumberField label="Width" value={active.width} min={0.4} max={wallSpan(room.dimensions, active.wall) - 0.16} onChange={width => update(active, { width })} />
        <NumberField label="Height" value={active.height} min={0.4} max={room.dimensions.height - 0.08} onChange={height => update(active, { height })} />
        <NumberField label="Offset from center" value={active.offset} onChange={offset => update(active, { offset })} />
        {active.kind === 'Window' && <NumberField label="Sill height" min={0} value={active.sill} onChange={sill => update(active, { sill })} />}
      </div>
    </section>}
  </>;
}

function FurnitureControls({ room, selection, onSelect, onChange, notify }: ObjectPanelProps) {
  const active = selection?.type === 'furniture' ? room.furniture.find(item => item.id === selection.id) : undefined;
  const bounds = active ? furnitureBounds(room.dimensions, active) : undefined;
  const update = (item: Furniture, changes: Partial<Furniture>, group?: string) => {
    const candidate = { ...item, ...changes };
    if (!furnitureFitsRoom(room.dimensions, candidate)) {
      notify('This item is too wide to turn that far in this room.');
      return;
    }
    const next = fitFurniture(room.dimensions, candidate);
    onChange({ ...room, furniture: room.furniture.map(value => value.id === item.id ? next : value) }, group);
  };
  return <>
    <section className="paint-section">
      <h3>Add an item</h3>
      <div className="two-fields object-catalog">
        {FURNITURE.map(kind => <button type="button" className="button button-secondary" key={kind}
          disabled={room.furniture.length >= LIMITS.furniture} onClick={() => {
            const item = addFurniture(room, kind);
            if (!item) { notify('This item is too large for the room.'); return; }
            onChange({ ...room, furniture: [...room.furniture, item] });
            onSelect({ type: 'furniture', id: item.id });
          }}><Plus size={15} /> {kind}</button>)}
      </div>
    </section>
    <ObjectList entries={room.furniture} icon={Armchair} selected={active?.id}
      onSelect={item => onSelect({ type: 'furniture', id: item.id })}
      onRemove={item => {
        onChange({ ...room, furniture: room.furniture.filter(value => value.id !== item.id) });
        if (active?.id === item.id) onSelect(null);
      }} />
    {active && bounds && <section className="object-details" key={active.id}>
      <h3>{active.kind} placement</h3>
      <div className="two-fields">
        <NumberField label="X position" value={active.x} min={-bounds.x} max={bounds.x} onChange={x => update(active, { x })} />
        <NumberField label="Z position" value={active.z} min={-bounds.z} max={bounds.z} onChange={z => update(active, { z })} />
      </div>
      <RangeField label="Rotation" value={active.rotation} min={0} max={360} step={1} unit="°"
        onChange={rotation => update(active, { rotation }, active.id + ':rotation')} />
    </section>}
  </>;
}

function LightControls({ room, selection, onSelect, onChange }: ObjectPanelProps) {
  const active = selection?.type === 'light' ? room.lights.find(item => item.id === selection.id) : undefined;
  const update = (item: Light, changes: Partial<Light>, group?: string) => {
    const next = fitLight(room.dimensions, { ...item, ...changes });
    onChange({ ...room, lights: room.lights.map(value => value.id === item.id ? next : value) }, group);
  };
  return <>
    <div className="two-fields object-catalog">
      {LIGHTS.map(kind => <button type="button" className="button button-secondary" key={kind}
        disabled={room.lights.length >= LIMITS.lights} onClick={() => {
          const item = addLight(room, kind);
          onChange({ ...room, lights: [...room.lights, item] });
          onSelect({ type: 'light', id: item.id });
        }}><Plus size={15} /> {kind}</button>)}
    </div>
    <ObjectList entries={room.lights} icon={LampCeiling} selected={active?.id}
      onSelect={item => onSelect({ type: 'light', id: item.id })}
      onRemove={item => {
        onChange({ ...room, lights: room.lights.filter(value => value.id !== item.id) });
        if (active?.id === item.id) onSelect(null);
      }} />
    {active && <section className="object-details" key={active.id}>
      <h3>{active.kind} settings</h3>
      <div className="three-fields">
        <NumberField label="X position" value={active.x} onChange={x => update(active, { x })} />
        <NumberField label="Z position" value={active.z} onChange={z => update(active, { z })} />
        <NumberField label="Height" value={active.y} min={0.25} max={room.dimensions.height - 0.1}
          onChange={y => update(active, { y: clamp(y, 0.25, room.dimensions.height - 0.1) })} />
      </div>
      <RangeField label="Brightness" value={active.brightness} min={0} max={100} step={1} unit="%"
        onChange={brightness => update(active, { brightness }, active.id + ':brightness')} />
      <RangeField label="Warmth" value={active.warmth} min={2300} max={7500} step={100} unit=" K"
        onChange={warmth => update(active, { warmth }, active.id + ':warmth')} />
      <RangeField label="Direction" value={active.direction} min={0} max={360} step={1} unit="°"
        onChange={direction => update(active, { direction }, active.id + ':direction')} />
      <RangeField label="Tilt" value={active.tilt} min={0} max={75} step={1} unit="°"
        onChange={tilt => update(active, { tilt }, active.id + ':tilt')} />
    </section>}
  </>;
}
