'use client';

import {
  Armchair, DoorOpen, Lightbulb, Plus, RectangleVertical,
} from 'lucide-react';
import {
  LIMITS, OPENINGS, WALL_LABELS, WALLS, fitOpening,
  openingFits, wallSpan, type FurnitureKind, type LightKind, type Opening, type Room, type Wall,
} from '@studio/model';
import { NumberField, SelectField } from '@/components/ui';
import { addOpening } from './rooms';
import { InteriorPanel } from './interior/panel';
import { LightingPanel } from './lighting/panel';
import { ObjectList } from './object-list';
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
  onAddFixture: (kind: LightKind) => void;
  onAddInterior: (kind: FurnitureKind) => void;
};

const tabs = {
  Openings: { icon: DoorOpen, heading: 'Doors & windows', description: 'Place openings along your walls.' },
  Lighting: { icon: Lightbulb, heading: 'Room lighting', description: 'Position and tune your fixtures.' },
  Furniture: { icon: Armchair, heading: 'Interiors', description: 'Furnish and arrange your room.' },
};

export function ObjectPanel(props: ObjectPanelProps) {
  const { icon: Icon, heading, description } = tabs[props.tab];
  return <div className="panel-flow">
    <div className="panel-intro">
      <span className="panel-icon"><Icon size={19} /></span>
      <div><h2>{heading}</h2><p>{description}</p></div>
    </div>
    {props.tab === 'Openings' ? <OpeningControls {...props} />
      : props.tab === 'Lighting' ? <LightingPanel {...props} />
      : <InteriorPanel {...props} />}
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
