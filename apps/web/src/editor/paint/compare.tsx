'use client';

import { useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { LIMITS, WALLS, WALL_LABELS, type Room } from '@studio/model';
import { IconButton, Modal, SelectField } from '@/components/ui';
import { Preview, ViewSwitch } from '../scene/preview';
import type { View } from '../scene/room-scene';
import { colorStyle } from './panel';

export function CompareDialog({ room, onChange, onClose }: {
  room: Room; onChange: (room: Room) => void; onClose: () => void;
}) {
  const [optionId, setOptionId] = useState(room.options[0]?.id ?? '');
  const [name, setName] = useState('');
  const [view, setView] = useState<View>('3D');
  const option = room.options.find(option => option.id === optionId);
  const add = (event: FormEvent) => {
    event.preventDefault();
    if (room.options.length >= LIMITS.options) return;
    const id = crypto.randomUUID();
    onChange({ ...room, options: [...room.options, { id, name: name.trim() || `Option ${room.options.length + 1}`, walls: room.walls }] });
    setOptionId(id);
    setName('');
  };
  return <Modal wide title="Compare paint options" onClose={onClose}>
    <div className="compare-content">
      <div className="compare-actions">
        <form className="snapshot-form" onSubmit={add}>
          <label className="sr-only" htmlFor="option-name">Paint option name</label>
          <input id="option-name" placeholder="Option name" maxLength={LIMITS.name} value={name} onChange={event => setName(event.currentTarget.value)} />
          <button type="submit" className="button button-primary" disabled={room.options.length >= LIMITS.options}><Plus size={16} /> Capture current paint</button>
        </form>
        <ViewSwitch view={view} onChange={setView} allowCeiling={false} />
      </div>
      <div className="comparison-grid">
        <section>
          <h3>Current paint</h3>
          <div className="comparison-scene"><Preview room={room} view={view} /></div>
          <div className="comparison-swatches">{WALLS.map(wall => <span key={wall} style={colorStyle(room.walls[wall].color)}
            title={WALL_LABELS[wall] + ' ' + room.walls[wall].color} />)}</div>
        </section>
        <section>
          <div className="comparison-heading">
            {room.options.length > 0 ? <SelectField label="Saved option" value={optionId} values={room.options.map(value => value.id)}
              display={id => room.options.find(value => value.id === id)!.name} onChange={setOptionId} /> : <h3>Saved option</h3>}
            {option && <IconButton label="Remove paint option" onClick={() => {
              const options = room.options.filter(value => value.id !== option.id);
              onChange({ ...room, options });
              setOptionId(options[0]?.id ?? '');
            }}><Trash2 size={16} /></IconButton>}
          </div>
          <div className="comparison-scene">
            {option ? <Preview room={{ ...room, walls: option.walls }} view={view} /> :
              <p className="empty-comparison">Capture the current paint, then edit the room to compare it with your saved option.</p>}
          </div>
          {option && <div className="comparison-footer">
            <div className="comparison-swatches">{WALLS.map(wall => <span key={wall} style={colorStyle(option.walls[wall].color)}
              title={WALL_LABELS[wall] + ' ' + option.walls[wall].color} />)}</div>
            <button type="button" className="button button-secondary" onClick={() => onChange({ ...room, walls: option.walls })}>Apply option</button>
          </div>}
        </section>
      </div>
    </div>
  </Modal>;
}
