import { Trash2, type LucideIcon } from 'lucide-react';
import { WALL_LABELS, type Wall } from '@studio/model';
import { IconButton } from '@/components/ui';

type Editable = { id: string; kind: string; wall?: Wall };

export function ObjectList<T extends Editable>({ entries, selected, icon: Icon, describe, onSelect, onRemove }: {
  entries: T[]; selected?: string; icon: LucideIcon; describe?: (item: T) => string; onSelect: (item: T) => void; onRemove: (item: T) => void;
}) {
  if (entries.length === 0) return <p className="empty-inline">Nothing added yet.</p>;
  return <ul className="object-list">
    {entries.map((item, index) => {
      const subtitle = describe?.(item) ?? (item.wall && WALL_LABELS[item.wall]);
      return <li key={item.id} data-active={selected === item.id}>
        <button type="button" aria-pressed={selected === item.id} onClick={() => onSelect(item)}>
          <Icon size={16} />
          <span>{item.kind}{subtitle && <small>{subtitle}</small>}</span>
          <span className="sr-only"> {index + 1}</span>
        </button>
        <IconButton label={`Remove ${item.kind.toLowerCase()} ${index + 1}`} onClick={() => onRemove(item)}><Trash2 size={15} /></IconButton>
      </li>;
    })}
  </ul>;
}
