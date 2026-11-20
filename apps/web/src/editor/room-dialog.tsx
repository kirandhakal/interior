'use client';

import { useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { DIMENSION_BOUNDS, LIMITS, type Dimensions, type Room } from '@studio/model';
import { Modal, SelectField } from '@/components/ui';
import { PRESETS } from './rooms';

const labels = { length: 'Length', width: 'Width', height: 'Height' };

export function RoomDialog({ room, canRemove, onSave, onRemove, onClose }: {
  room?: Room;
  canRemove: boolean;
  onSave: (name: string, dimensions: Dimensions) => string | undefined;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [presetName, setPreset] = useState(PRESETS[0].name);
  const [name, setName] = useState(room?.name ?? PRESETS[0].name);
  const [dimensions, setDimensions] = useState<Dimensions>(room?.dimensions ?? PRESETS[0]);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);

  function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setError('Enter a room name.'); return; }
    const { length, width, height } = dimensions;
    const result = onSave(name.trim(), { length, width, height });
    if (result) setError(result);
    else onClose();
  }

  return <Modal title={room ? 'Room settings' : 'Add a room'} onClose={onClose}>
    <form onSubmit={save} className="modal-form">
      {!room && <SelectField label="Room preset" value={presetName} values={PRESETS.map(preset => preset.name)} onChange={value => {
        const preset = PRESETS.find(preset => preset.name === value)!;
        const { name, length, width, height } = preset;
        setPreset(value);
        setName(name);
        setDimensions({ length, width, height });
      }} />}
      <label className="field"><span>Room name</span><input required value={name} maxLength={LIMITS.name}
        onChange={event => setName(event.currentTarget.value)} /></label>
      <div className="three-fields">
        {(Object.keys(labels) as (keyof Dimensions)[]).map(key => <label className="field" key={key}>
          <span>{labels[key]}</span>
          <span className="number-wrap">
            <input aria-label={labels[key]} required type="number" value={Number.isNaN(dimensions[key]) ? '' : dimensions[key]} step="any"
              min={DIMENSION_BOUNDS[key][0]} max={DIMENSION_BOUNDS[key][1]}
              onChange={event => setDimensions(previous => ({ ...previous, [key]: event.target.valueAsNumber }))} />
            <span className="unit" aria-hidden="true">m</span>
          </span>
        </label>)}
      </div>
      {error && <p className="inline-error" role="alert">{error}</p>}
      {confirm && <p role="status" className="inline-error">Remove this room and its contents?</p>}
      <div className="modal-actions">
        {room && canRemove && <button type="button" className="button button-danger mr-auto" onClick={() => {
          if (confirm) { onRemove(); onClose(); }
          else setConfirm(true);
        }}><Trash2 size={16} /> {confirm ? 'Confirm removal' : 'Remove room'}</button>}
        <button type="button" className="button button-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="button button-primary">{room ? 'Apply changes' : 'Create room'}</button>
      </div>
    </form>
  </Modal>;
}
