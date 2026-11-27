'use client';

import {
  Armchair, DoorOpen, Lightbulb, Plus, RectangleVertical,
} from 'lucide-react';
import {
  CURTAIN_LENGTHS, HINGE_SIDES, LIMITS, OPENINGS, OPENING_EDGE_CLEARANCE, fitOpening,
  openingFits, roomWallIds, wallLabel, wallSpan, type FurnitureKind, type LightKind, type Opening, type Room, type Wall,
} from '@studio/model';
import { NumberField, RangeField, SelectField } from '@/components/ui';
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

export function OpeningControls({ room, wall, selection, onSelect, onChange, notify, onlyWall = false }:
  Pick<ObjectPanelProps, 'room' | 'wall' | 'selection' | 'onSelect' | 'onChange' | 'notify'> & { onlyWall?: boolean }) {
  const active = selection?.type === 'opening' ? room.openings.find(item => item.id === selection.id) : undefined;
  const curtains = active?.curtains;
  const wallIds = roomWallIds(room.dimensions);
  const label = (wall: Wall) => wallLabel(room.dimensions, wall);
  const update = (item: Opening, changes: Partial<Opening>, field?: string) => {
    const next = fitOpening(room.dimensions, { ...item, ...changes });
    if (!openingFits(room, next)) {
      notify('That opening would overlap another. Try another position or wall.');
      return;
    }
    onChange({ ...room, openings: room.openings.map(opening => opening.id === item.id ? next : opening) }, field && `${item.id}:${field}`);
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
    <SelectField label="Wall for new openings" values={wallIds} value={wall} display={label}
      onChange={side => onSelect({ type: 'wall', wall: side })} />
    <ObjectList entries={onlyWall ? room.openings.filter(item => item.wall === wall) : room.openings} icon={RectangleVertical} selected={active?.id} describe={item => label(item.wall)}
      onSelect={item => onSelect({ type: 'opening', id: item.id })}
      onRemove={item => {
        onChange({ ...room, openings: room.openings.filter(opening => opening.id !== item.id) });
        if (active?.id === item.id) onSelect(null);
      }} />
    {active && <section className="object-details" key={active.id}>
      <h3>{active.kind} placement</h3>
      <SelectField label="Wall" values={wallIds} value={active.wall} display={label} onChange={side => update(active, { wall: side })} />
      <div className="two-fields">
        <NumberField label="Width" value={active.width} min={0.4} max={wallSpan(room.dimensions, active.wall) - 2 * OPENING_EDGE_CLEARANCE} onChange={width => update(active, { width })} />
        <NumberField label="Height" value={active.height} min={0.4} max={room.dimensions.height - OPENING_EDGE_CLEARANCE} onChange={height => update(active, { height })} />
        <NumberField label="Offset from center" value={active.offset} onChange={offset => update(active, { offset })} />
        {active.kind === 'Window' && <NumberField label="Sill height" min={0} value={active.sill} onChange={sill => update(active, { sill })} />}
      </div>
      {active.kind !== 'Passage' && <RangeField label={`${active.kind} opening angle`} value={active.openAngle ?? 0} min={0} max={90} step={1} unit="°"
        onChange={openAngle => update(active, { openAngle }, 'opening angle')} />}
      {active.kind === 'Door' && <SelectField label="Hinge side (from inside)" values={HINGE_SIDES} value={active.hinge ?? 'Left'}
        onChange={hinge => update(active, { hinge })} />}
      {active.kind === 'Window' && <section className="object-details">
        <div className="fixture-heading">
          <h3>Curtains</h3>
          <button type="button" className="button button-secondary" onClick={() => update(active, { curtains: active.curtains ? undefined
            : { drawn: 0, color: '#D6C2A7', length: 'Sill' } })}>{active.curtains ? 'Remove curtains' : 'Add curtains'}</button>
        </div>
        {curtains && <>
          <button type="button" className="button button-secondary"
            onClick={() => update(active, { curtains: { ...curtains, drawn: curtains.drawn ? 0 : 100 } })}>
            {curtains.drawn ? 'Open curtains' : 'Draw curtains'}
          </button>
          <RangeField label="Curtains drawn" value={curtains.drawn} min={0} max={100} step={1} unit="%"
            onChange={drawn => update(active, { curtains: { ...curtains, drawn } }, 'curtain draw')} />
          <div className="two-fields">
            <SelectField label="Curtain length" values={CURTAIN_LENGTHS} value={curtains.length}
              onChange={length => update(active, { curtains: { ...curtains, length } })} />
            <label className="field interior-color">
              <span>Curtain color</span>
              <input type="color" value={curtains.color}
                onChange={event => update(active, { curtains: { ...curtains, color: event.currentTarget.value } }, 'curtain color')} />
            </label>
          </div>
        </>}
      </section>}
    </section>}
  </>;
}
