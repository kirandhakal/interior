'use client';

import { Lamp, LampCeiling, LampFloor, LampWallDown, Lightbulb, LightbulbOff, Spotlight } from 'lucide-react';
import {
  FIXTURE_MOUNTS, LIGHTS, LIGHT_MOUNT_LABELS, LIMITS, MAX_LIGHT_LUMENS, clamp, fitLight, isPointFixture, isWallMount, pointAlongWall, roomPlan, wallOffset,
  lightLumens, type Light, type Room,
} from '@studio/model';
import { NumberField, RangeField, SelectField } from '@/components/ui';
import { ObjectList } from '../object-list';
import type { Hit } from '../scene/room-scene';
import { FIXTURE_DRAG_TYPE } from './fixtures';

const icons = { Bulb: Lightbulb, 'Floor lamp': LampFloor, 'Wall sconce': LampWallDown,
  'Ceiling light': LampCeiling, Spotlight, 'LED strip': Lamp, Chandelier: LampCeiling, 'Pendant light': LampCeiling, 'Fairy lights': Lightbulb };

export function LightingPanel({ room, selection, onSelect, onChange, onAddFixture }: {
  room: Room;
  selection: Hit | null;
  onSelect: (selection: Hit | null) => void;
  onChange: (room: Room, historyGroup?: string) => void;
  onAddFixture: (kind: Light['kind']) => void;
}) {
  const active = selection?.type === 'light' ? room.lights.find(light => light.id === selection.id) : undefined;
  const atLimit = room.lights.length >= LIMITS.lights;

  return <>
    <section className="paint-section fixture-catalog">
      <h3>Add a fixture</h3>
      <p className="empty-inline">{atLimit ? `This room has ${LIMITS.lights} fixtures.` : 'Drag a fixture into the preview, or click to add one.'}</p>
      <div className="two-fields">
        {LIGHTS.map(kind => {
          const Icon = icons[kind];
          return <button key={kind} type="button" className="button button-secondary fixture-card" disabled={atLimit}
            draggable={!atLimit} onClick={() => onAddFixture(kind)}
            onDragStart={event => {
              event.dataTransfer.setData(FIXTURE_DRAG_TYPE, kind);
              event.dataTransfer.effectAllowed = 'copy';
            }}>
            <Icon size={17} /> {kind}
          </button>;
        })}
      </div>
    </section>

    <ObjectList entries={room.lights} icon={Lightbulb} selected={active?.id}
      describe={light => `${LIGHT_MOUNT_LABELS[light.mount ?? 'Free']} · ${light.enabled === false ? 'Off' : lightLumens(light) + ' lm'}`}
      onSelect={light => onSelect({ type: 'light', id: light.id })} onRemove={light => {
        onChange({ ...room, lights: room.lights.filter(item => item.id !== light.id) });
        if (active?.id === light.id) onSelect(null);
      }} />
    {active && <FixtureSettings key={active.id} light={active} room={room} onChange={onChange} />}
  </>;
}

export function FixtureSettings({ light, room, onChange }: {
  light: Light; room: Room; onChange: (room: Room, historyGroup?: string) => void;
}) {
  const mount = light.mount ?? 'Free';
  const wall = isWallMount(mount) ? roomPlan(room.dimensions).walls[mount] : undefined;
  const lumens = lightLumens(light);
  const { height } = room.dimensions;
  const update = (changes: Partial<Light>, field?: keyof Light) => {
    const fitted = fitLight(room.dimensions, { ...light, ...changes });
    onChange({ ...room, lights: room.lights.map(item => item.id === light.id ? fitted : item) },
      field ? `${light.id}:${field}` : undefined);
  };
  const setIntensity = (value: number) => update({ lumens: clamp(Math.round(value), 0, MAX_LIGHT_LUMENS) }, 'lumens');

  return <section className="object-details" aria-label={`${light.kind} settings`}>
    <div className="fixture-heading">
      <h3>{light.kind} settings</h3>
      <button className="button button-secondary" type="button" aria-label="Fixture power"
        aria-pressed={light.enabled !== false} onClick={() => update({ enabled: light.enabled === false })}>
        {light.enabled !== false ? <Lightbulb size={15} /> : <LightbulbOff size={15} />}
        {light.enabled !== false ? 'On' : 'Off'}
      </button>
    </div>

    <SelectField label="Mount" value={mount} values={FIXTURE_MOUNTS[light.kind]}
      display={value => LIGHT_MOUNT_LABELS[value]} onChange={next => {
        const wallMount = isWallMount(next);
        update({ mount: next,
          y: mount === 'Floor' ? height * 0.7 : light.y,
          tilt: wallMount && !wall ? 55 : light.tilt,
        });
      }} />
    <div className={mount === 'Free' ? 'three-fields' : 'two-fields'}>
      {!wall && <>
        <NumberField label="X position" value={light.x} onChange={x => update({ x })} />
        <NumberField label="Z position" value={light.z} onChange={z => update({ z })} />
      </>}
      {wall && <NumberField label="Offset from wall center" value={wallOffset(wall, light)}
        onChange={value => update(pointAlongWall(wall, value))} />}
      {(wall || mount === 'Free') && <NumberField label="Height" value={light.y} min={0.25} max={height - 0.1}
        onChange={y => update({ y })} />}
    </div>

    <div className="fixture-output">
      <RangeField label="Light intensity" value={lumens} min={0} max={MAX_LIGHT_LUMENS} step={1} unit=" lm" onChange={setIntensity} />
      <NumberField label="Lumens" value={lumens} min={0} max={MAX_LIGHT_LUMENS} step={1} unit="" onChange={setIntensity} />
    </div>
    <RangeField label="Warmth" value={light.warmth} min={2300} max={7500} step={100} unit=" K"
      onChange={warmth => update({ warmth }, 'warmth')} />
    {!isPointFixture(light.kind) && <>
      <RangeField label="Direction" value={light.direction} min={0} max={360} step={1} unit="°"
        onChange={direction => update({ direction }, 'direction')} />
      <RangeField label="Tilt" value={light.tilt} min={0} max={75} step={1} unit="°"
        onChange={tilt => update({ tilt }, 'tilt')} />
    </>}
  </section>;
}
