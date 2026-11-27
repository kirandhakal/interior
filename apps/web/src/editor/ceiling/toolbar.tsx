import { Armchair, ChevronDown, LampCeiling, Plus, X } from 'lucide-react';
import { CEILING_DECOR, CEILING_FINISHES, LIMITS, type CeilingFinish, type Room } from '@studio/model';
import { IconButton, SelectField } from '@/components/ui';
import { ceilingLights, type CeilingItem } from './catalog';

export function CeilingToolbar({ room, item, placing, missed, inside, onChoose, onStart, onFinish, onAutoPlace, onCancel, onToggleInterior }: {
  room: Room;
  item: CeilingItem;
  placing: boolean;
  missed: boolean;
  inside: boolean;
  onChoose: (item: CeilingItem) => void;
  onStart: () => void;
  onFinish: (finish: CeilingFinish) => void;
  onAutoPlace: () => void;
  onCancel: () => void;
  onToggleInterior: () => void;
}) {
  const decorFull = (room.ceilingDecor?.length ?? 0) >= LIMITS.ceilingDecor;
  const lightsFull = room.lights.length >= LIMITS.lights;
  const itemLimit = item.type === 'light' ? lightsFull : decorFull;

  return <section className="ceiling-toolbar" aria-label="Decorate ceiling">
    <div className="ceiling-toolbar-controls">
      <label className="field">
        <span>Ceiling item</span>
        <span className="select-wrap"><select value={item.kind} onChange={event => {
          const value = event.currentTarget.value;
          const light = ceilingLights.find(kind => kind === value);
          const decor = CEILING_DECOR.find(kind => kind === value);
          if (light) onChoose({ type: 'light', kind: light });
          else if (decor) onChoose({ type: 'decor', kind: decor });
        }}>
          <optgroup label="Fan and decor">
            {CEILING_DECOR.map(kind => <option key={kind} disabled={decorFull}>{kind}</option>)}
          </optgroup>
          <optgroup label="Lighting">
            {ceilingLights.map(kind => <option key={kind} disabled={lightsFull}>{kind}</option>)}
          </optgroup>
        </select><ChevronDown size={15} aria-hidden="true" /></span>
      </label>
      <button type="button" className="button button-primary" onClick={onStart} disabled={placing || itemLimit}>
        <Plus size={17} /> Place item
      </button>
      <SelectField label="Ceiling finish" value={room.ceilingFinish ?? 'Plain plaster'} values={CEILING_FINISHES} onChange={onFinish} />
    </div>
    <div className="ceiling-toolbar-status" data-placing={placing}>
      <p role="status">{placing ? missed ? 'Click inside the ceiling outline to place the item.'
        : `Click or tap the ceiling to place ${item.kind.toLowerCase()}.`
        : itemLimit ? 'This room has reached the limit for this item type.' : 'Choose an item, then click Place item.'}</p>
      {placing && <>
        <button type="button" className="button button-secondary" onClick={onAutoPlace}>Auto-place</button>
        <IconButton label="Cancel ceiling placement" onClick={onCancel}><X size={17} /></IconButton>
      </>}
      <button type="button" className="button button-secondary" onClick={onToggleInterior}>
        {inside ? <><LampCeiling size={15} /> Ceiling plan</> : <><Armchair size={15} /> Preview in room</>}
      </button>
    </div>
  </section>;
}
