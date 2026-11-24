'use client';

import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import {
  DIMENSION_BOUNDS, LIMITS, WALLS, WALL_LABELS, WALL_THICKNESS_BOUNDS, dimensionError, inBounds, roomMeasurements, roomPlan,
  setRoomDimension, setWallSpan, wallSpan, wallThickness, type Dimensions, type Room, type Wall,
} from '@studio/model';
import { MEASUREMENT_LABELS, MEASUREMENT_UNITS, formatMeasurement, type MeasurementUnit } from '@studio/measurement';
import { resizeRoom } from '@studio/resize-room';
import { MeasurementInput } from '@/components/measurement-input';
import { Modal, SelectField } from '@/components/ui';
import { newRoom, PRESETS } from './rooms';

const labels = { length: 'Room length', width: 'Room width', height: 'Room height' };
type RoomDimension = keyof typeof labels;

function DimensionPlan({ room, unit, onWall }: { room: Room; unit: MeasurementUnit; onWall: (wall: Wall) => void }) {
  const { dimensions } = room;
  const { inner, outer, outerBounds: { center, length, width } } = roomPlan(dimensions);
  const scale = Math.min(200 / length, 135 / width);
  const points = (outline: typeof inner) => outline.map(({ x, z }) => `${110 + (x - center.x) * scale},${77.5 + (z - center.z) * scale}`).join(' ');
  const { floorArea, perimeter, wallArea, netWallArea } = roomMeasurements(dimensions, room.openings);

  return <section className="dimension-preview" aria-label="Room plan and measurements">
    <div className="dimension-plan">
      <svg viewBox="0 0 220 155" aria-label="Live room outline" role="img">
        <polygon points={points(outer)} className="dimension-plan-shell" />
        <polygon points={points(inner)} className="dimension-plan-interior" />
      </svg>
      {WALLS.map(wall => <button key={wall} type="button" className={`dimension-plan-label dimension-plan-${wall}`}
        aria-label={`Edit ${WALL_LABELS[wall].toLowerCase()} length`} onClick={() => onWall(wall)}>
        {formatMeasurement(wallSpan(dimensions, wall), unit)}
      </button>)}
    </div>
    <dl className="dimension-totals" aria-label="Calculated measurements">
      <div><dt>Floor area</dt><dd>{formatMeasurement(floorArea, unit, 2)}</dd></div>
      <div><dt>Perimeter</dt><dd>{formatMeasurement(perimeter, unit)}</dd></div>
      <div><dt>Wall area</dt><dd>{formatMeasurement(wallArea, unit, 2)}</dd></div>
      <div><dt>Wall area minus openings</dt><dd>{formatMeasurement(netWallArea, unit, 2)}</dd></div>
    </dl>
  </section>;
}

export function RoomDialog({ room, preview, unit, onUnit, onPreview, focusWall, canRemove, onSave, onRemove, onClose }: {
  room?: Room;
  preview?: Room;
  unit: MeasurementUnit;
  onUnit: (unit: MeasurementUnit) => void;
  onPreview: (room: Room) => void;
  focusWall?: Wall;
  canRemove: boolean;
  onSave: (room: Room) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const id = useId();
  const [base] = useState(() => room ?? newRoom('room-draft', PRESETS[0].name, PRESETS[0].dimensions));
  const [presetName, setPreset] = useState(PRESETS[0].name);
  const [name, setName] = useState(base.name);
  const [dimensions, setDimensions] = useState(base.dimensions);
  const [invalidFields, setInvalidFields] = useState<Record<string, number>>({});
  const [confirm, setConfirm] = useState(false);
  const [nameError, setNameError] = useState(false);
  const invalid = Object.keys(invalidFields).length > 0;
  const geometryError = !invalid && dimensionError(dimensions);
  const current = useMemo(() => !invalid && !geometryError ? resizeRoom(base, name.trim() || base.name, dimensions) : undefined,
    [invalid, geometryError, base, name, dimensions]);
  const error = invalid ? 'Enter values within the allowed ranges.' : geometryError || (!current &&
    'The openings or furniture cannot fit at these dimensions. Increase the room size or move the items first.');

  useEffect(() => { if (current) onPreview(current); }, [current, onPreview]);

  function edit(field: string, meters: number, bounds: readonly [number, number], update: (value: Dimensions) => Dimensions, aliases: string[] = []) {
    const valid = inBounds(meters, bounds);
    setInvalidFields(previous => {
      const next = { ...previous };
      if (valid) {
        delete next[field];
        for (const alias of aliases) delete next[alias];
      } else next[field] = meters;
      return next;
    });
    if (valid) setDimensions(update);
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setNameError(true); return; }
    if (!current) return;
    onSave(current);
    onClose();
  }

  return <Modal title={room ? 'Room dimensions' : 'Add a room'} onClose={onClose} wide>
    <form onSubmit={save} className="modal-form dimension-form" noValidate>
      <div className="dimension-content">
        <div className="dimension-editor">
          {!room && <SelectField label="Room preset" value={presetName} values={PRESETS.map(preset => preset.name)} onChange={value => {
            const preset = PRESETS.find(preset => preset.name === value)!;
            setPreset(value);
            setName(preset.name);
            setDimensions(preset.dimensions);
            setInvalidFields({});
            setNameError(false);
          }} />}
          <div className="two-fields">
            <label className="field"><span>Room name</span><input required value={name} maxLength={LIMITS.name} aria-invalid={nameError || undefined}
              onChange={event => { setName(event.currentTarget.value); setNameError(false); }} /></label>
            <SelectField label="Measurement units" value={unit} values={MEASUREMENT_UNITS} display={value => MEASUREMENT_LABELS[value]} onChange={onUnit} />
          </div>
          <div className="three-fields">
            {(Object.keys(labels) as RoomDimension[]).map(key => <MeasurementInput key={key} id={`${id}-${key}`} label={labels[key]}
              bounds={DIMENSION_BOUNDS[key]} value={invalidFields[key] ?? dimensions[key]} unit={unit}
              onChange={meters => edit(key, meters, DIMENSION_BOUNDS[key], previous => setRoomDimension(previous, key, meters),
                key === 'length' ? ['north-length', 'south-length'] : key === 'width' ? ['east-length', 'west-length'] : [])} />)}
          </div>
          <fieldset className="dimension-walls">
            <legend>Individual walls</legend>
            <p className="dimension-hint">Room length and width resize opposite-wall pairs. Individual lengths reshape the outline.</p>
            {WALLS.map(wall => <div key={wall} className="two-fields">
              <MeasurementInput id={`${id}-${wall}-length`} label={`${WALL_LABELS[wall]} length`} unit={unit}
                value={invalidFields[`${wall}-length`] ?? wallSpan(dimensions, wall)} bounds={DIMENSION_BOUNDS.length} autoFocus={focusWall === wall}
                onChange={meters => edit(`${wall}-length`, meters, DIMENSION_BOUNDS.length, previous => setWallSpan(previous, wall, meters),
                  wall === 'north' ? ['length'] : wall === 'east' ? ['width'] : [])} />
              <MeasurementInput id={`${id}-${wall}-thickness`} label={`${WALL_LABELS[wall]} thickness`} unit={unit}
                value={invalidFields[`${wall}-thickness`] ?? wallThickness(dimensions, wall)} bounds={WALL_THICKNESS_BOUNDS}
                onChange={meters => edit(`${wall}-thickness`, meters, WALL_THICKNESS_BOUNDS,
                  previous => ({ ...previous, wallThickness: { ...previous.wallThickness, [wall]: meters } }))} />
            </div>)}
          </fieldset>
        </div>
        <DimensionPlan room={current ?? preview ?? base} unit={unit} onWall={wall => document.getElementById(`${id}-${wall}-length`)?.focus()} />
      </div>
      {nameError && <p className="inline-error" role="alert">Enter a room name.</p>}
      {error && <p className="inline-error" role="alert">{error} The preview shows the last valid layout.</p>}
      {confirm && <p role="status" className="modal-description">Remove this room and its contents?</p>}
      <div className="modal-actions">
        {room && canRemove && <button type="button" className="button button-danger mr-auto" onClick={() => {
          if (confirm) { onRemove(); onClose(); }
          else setConfirm(true);
        }}><Trash2 size={15} /> {confirm ? 'Confirm removal' : 'Remove room'}</button>}
        <button type="button" className="button button-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="button button-primary" disabled={!current}>{room ? 'Apply changes' : 'Create room'}</button>
      </div>
    </form>
  </Modal>;
}
