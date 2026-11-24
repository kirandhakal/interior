'use client';

import { useReducer, useState, type FormEvent } from 'react';
import { Hand, Minus, Plus, RotateCcw, Scan, Trash2 } from 'lucide-react';
import { DEFAULT_WALL_THICKNESS, DIMENSION_BOUNDS, LIMITS, WALL_THICKNESS_BOUNDS, inBounds, type Room, type Wall } from '@studio/model';
import { MEASUREMENT_LABELS, MEASUREMENT_UNITS, formatMeasurement, type MeasurementUnit } from '@studio/measurement';
import { MAX_PLAN_COORDINATE, MIN_PLAN_WALL, planArea, planPerimeter, pointDistance, wallEndpoint, wallHeading } from '@studio/polygon';
import { applyRoomOutline, editableOutline } from '@studio/room-outline';
import { IconButton, Modal, NumberField, SelectField } from '@/components/ui';
import { newRoom, PRESETS } from '../rooms';
import { PlanCanvas } from './canvas';
import { ANGLE_STEP, GRID_STEP, usePlanInteraction } from './interaction';
import { PLAN_PRESETS, planPresetPoints, type PlanPreset } from './presets';
import { draftWalls, newWallId, planDraftReducer, type PlanDraft } from './state';

const presetChoices = ['Choose a preset', ...Object.keys(PLAN_PRESETS) as PlanPreset[]] as const;

export function FloorPlanEditor({ room, unit, focusWall, onUnit, onSave, onRemove, onClose }: {
  room?: Room;
  unit: MeasurementUnit;
  focusWall?: Wall;
  onUnit: (unit: MeasurementUnit) => void;
  onSave: (room: Room) => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
  const [draft, dispatch] = useReducer(planDraftReducer, { room, focusWall }, ({ room, focusWall }): PlanDraft => ({
    points: room ? editableOutline(room.dimensions) : [], closed: !!room,
    selection: focusWall ? { kind: 'wall', id: focusWall } : undefined,
  }));
  const [name, setName] = useState(room?.name ?? 'Custom room');
  const [height, setHeight] = useState(room?.dimensions.height ?? PRESETS[3].dimensions.height);
  const [preset, setPreset] = useState<typeof presetChoices[number]>(presetChoices[0]);
  const [gridSnap, setGridSnap] = useState(true);
  const [angleSnap, setAngleSnap] = useState(false);
  const [panMode, setPanMode] = useState(false);
  const [error, setError] = useState<string>();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const interaction = usePlanInteraction(draft, dispatch, gridSnap, angleSnap, panMode);
  const { points, closed, selection } = draft;
  const walls = draftWalls(points, closed);
  const selectedWall = selection?.kind === 'wall' ? walls.find(wall => wall.start.wallId === selection.id) : undefined;
  const selectedVertex = selection?.kind === 'vertex' ? points.find(point => point.wallId === selection.id) : undefined;
  const perimeter = formatMeasurement(planPerimeter(points, closed), unit);
  const area = closed ? formatMeasurement(planArea(points), unit, 2) : '—';

  function save(event: FormEvent) {
    event.preventDefault();
    if (!closed) return;
    if (!name.trim()) { setError('Enter a room name.'); return; }
    const base = room ?? newRoom(crypto.randomUUID(), name.trim(), PRESETS[3].dimensions);
    const result = applyRoomOutline(base, name.trim(), height, points);
    if ('error' in result) setError(result.error);
    else { onSave(result.room); onClose(); }
  }

  function moveEndpoint(length: number, heading: number) {
    if (!selectedWall) return;
    if (length < MIN_PLAN_WALL) { setError(`Wall length must be at least ${formatMeasurement(MIN_PLAN_WALL, unit)}.`); return; }
    setError(undefined);
    dispatch({ type: 'move', id: selectedWall.end.wallId, point: wallEndpoint(selectedWall.start, length, heading) });
  }

  function loadPreset(value: typeof presetChoices[number]) {
    if (value === presetChoices[0]) return;
    const points = planPresetPoints(value).map(point => ({ ...point, wallId: newWallId() }));
    setPreset(value);
    setError(undefined);
    setPanMode(false);
    dispatch({ type: 'load', points, closed: true });
    interaction.fit(points);
  }

  return <Modal title={room ? 'Edit floor plan' : 'Draw a room'} onClose={onClose} wide>
    <form className="modal-form floor-plan-form" onSubmit={save} noValidate>
      <div className="floor-plan-editor">
        <section className="floor-plan-workspace" aria-label="Plan workspace" onPointerDown={() => setError(undefined)}>
          <div className="plan-toolbar">
            <div className="plan-toolbar-group" aria-label="Viewport controls">
              <IconButton label="Zoom in on plan" onClick={() => interaction.zoom(1.25)}><Plus size={17} /></IconButton>
              <IconButton label="Zoom out on plan" onClick={() => interaction.zoom(0.8)}><Minus size={17} /></IconButton>
              <IconButton label="Fit plan to canvas" onClick={() => interaction.fit()}><Scan size={17} /></IconButton>
              <IconButton label="Pan plan" pressed={panMode} onClick={() => setPanMode(!panMode)}><Hand size={17} /></IconButton>
            </div>
            <div className="plan-toolbar-group plan-snapping" aria-label="Snapping controls">
              <label><input type="checkbox" checked={gridSnap} onChange={event => setGridSnap(event.currentTarget.checked)} />Grid snap</label>
              <label><input type="checkbox" checked={angleSnap} onChange={event => setAngleSnap(event.currentTarget.checked)} />Angle snap</label>
            </div>
          </div>
          <PlanCanvas state={draft} unit={unit} interaction={interaction} panMode={panMode}
            select={selection => dispatch({ type: 'select', selection })} />
          <div className="plan-canvas-footer">
            <span>Grid {formatMeasurement(GRID_STEP, unit)} · Angle snap {ANGLE_STEP}°</span>
            <span>{points.length} {points.length === 1 ? 'vertex' : 'vertices'} · {walls.length} {walls.length === 1 ? 'wall' : 'walls'}</span>
          </div>
          <p className="plan-instructions">{panMode ? 'Drag to pan the plan.' : closed
            ? 'Drag a vertex to reshape the room. Select a wall to edit its length or angle.'
            : 'Click to place vertices. Click the first vertex or choose Close room when the outline is complete.'}</p>
          {draft.error && <p role="alert" className="inline-error">{draft.error}</p>}
          <dl className="dimension-totals" aria-label="Floor plan measurements">
            <div><dt>Floor area</dt><dd>{area}</dd></div>
            <div><dt>{closed ? 'Perimeter' : 'Path length'}</dt><dd>{perimeter}</dd></div>
          </dl>
        </section>
        <section className="plan-inspector" aria-label="Floor plan settings">
          <label className="field"><span>Room name</span><input value={name} maxLength={LIMITS.name}
            onChange={event => { setName(event.currentTarget.value); setError(undefined); }} /></label>
          <SelectField label="Shape preset" values={presetChoices} value={preset} onChange={loadPreset} />
          <SelectField label="Measurement units" value={unit} values={MEASUREMENT_UNITS} display={unit => MEASUREMENT_LABELS[unit]} onChange={onUnit} />
          <NumberField label="Room height" value={height} min={DIMENSION_BOUNDS.height[0]} max={DIMENSION_BOUNDS.height[1]} onChange={height => {
            if (inBounds(height, DIMENSION_BOUNDS.height)) { setHeight(height); setError(undefined); }
            else setError(`Room height must be between ${formatMeasurement(DIMENSION_BOUNDS.height[0], unit)} and ${formatMeasurement(DIMENSION_BOUNDS.height[1], unit)}.`);
          }} />
          {!closed && <button type="button" className="button button-primary" disabled={points.length < 3}
            onClick={() => dispatch({ type: 'close' })}>Close room</button>}
          {!!walls.length && <SelectField label="Select wall" values={['', ...walls.map(wall => wall.start.wallId)] as readonly (Wall | '')[]}
            value={selectedWall?.start.wallId ?? ''} display={id => id ? `Wall ${walls.findIndex(wall => wall.start.wallId === id) + 1}` : 'Choose a wall'}
            onChange={id => dispatch({ type: 'select', selection: id ? { kind: 'wall', id } : undefined })} />}
          {selectedWall && <div className="plan-entity" key={selectedWall.start.wallId}>
            <NumberField label="Wall length" value={pointDistance(selectedWall.start, selectedWall.end)} min={MIN_PLAN_WALL}
              onChange={length => moveEndpoint(length, wallHeading(selectedWall.start, selectedWall.end))} />
            <NumberField label="Wall angle" value={Number(wallHeading(selectedWall.start, selectedWall.end).toFixed(3))}
              unit="°" step={1} onChange={heading => moveEndpoint(pointDistance(selectedWall.start, selectedWall.end), heading)} />
            <p className="plan-instructions">Angles run clockwise from east.</p>
            <NumberField label="Wall thickness" value={selectedWall.start.thickness ?? DEFAULT_WALL_THICKNESS}
              min={WALL_THICKNESS_BOUNDS[0]} max={WALL_THICKNESS_BOUNDS[1]}
              onChange={value => dispatch({ type: 'thickness', id: selectedWall.start.wallId, value })} />
            <button type="button" className="button button-secondary" onClick={() => dispatch({ type: 'insert', wall: selectedWall.start.wallId, id: newWallId() })}>
              <Plus size={16} /> Add vertex
            </button>
          </div>}
          {selectedVertex && <div className="plan-entity" key={selectedVertex.wallId}>
            <div className="two-fields">
              <NumberField label="Vertex X" value={selectedVertex.x} min={-MAX_PLAN_COORDINATE} max={MAX_PLAN_COORDINATE}
                onChange={x => dispatch({ type: 'move', id: selectedVertex.wallId, point: { x, z: selectedVertex.z } })} />
              <NumberField label="Vertex Z" value={selectedVertex.z} min={-MAX_PLAN_COORDINATE} max={MAX_PLAN_COORDINATE}
                onChange={z => dispatch({ type: 'move', id: selectedVertex.wallId, point: { x: selectedVertex.x, z } })} />
            </div>
            <button type="button" className="button button-secondary" disabled={closed && points.length <= 3}
              onClick={() => dispatch({ type: 'remove', id: selectedVertex.wallId })}><Trash2 size={15} /> Remove vertex</button>
          </div>}
          {!!points.length && <button type="button" className="button button-secondary plan-reset" onClick={() => {
            dispatch({ type: 'load', points: [], closed: false });
            setPreset(presetChoices[0]);
            setError(undefined);
            setPanMode(false);
            interaction.fit([]);
          }}><RotateCcw size={15} /> Start over</button>}
        </section>
      </div>
      {error && <p role="alert" className="inline-error">{error}</p>}
      {confirmRemove && <p role="status" className="modal-description">Remove this room and its contents?</p>}
      <div className="modal-actions">
        {onRemove && <button type="button" className="button button-danger mr-auto" onClick={() => {
          if (confirmRemove) { onRemove(); onClose(); }
          else setConfirmRemove(true);
        }}><Trash2 size={15} /> {confirmRemove ? 'Confirm removal' : 'Remove room'}</button>}
        <button type="button" className="button button-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="button button-primary" disabled={!closed}>{room ? 'Apply floor plan' : 'Create room'}</button>
      </div>
    </form>
  </Modal>;
}
