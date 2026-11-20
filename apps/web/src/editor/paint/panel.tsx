'use client';

import { useState, type CSSProperties, type FormEvent } from 'react';
import { Check, ChevronRight, Droplet, Layers2, Palette, Search } from 'lucide-react';
import { FINISHES, WALLS, WALL_LABELS, type Paint, type Room, type Wall } from '@studio/model';
import { Segmented, SelectField } from '@/components/ui';
import { colorFor, findColors, PALETTE, relatedColors, resolveColor, type ColorChip } from './colors';

export function colorStyle(hex: string) {
  return { '--paint-color': hex } as CSSProperties;
}

function Swatches({ colors, selected, onSelect, label }: {
  colors: ColorChip[]; selected: string; onSelect: (hex: string) => void; label: string;
}) {
  return <div className="swatch-grid" role="group" aria-label={label}>
    {colors.map(({ name, hex }) => <button type="button" key={name + hex} className="swatch"
      style={colorStyle(hex)} aria-label={`${name} ${hex}`} title={`${name} · ${hex}`}
      aria-pressed={hex === selected} onClick={() => onSelect(hex)} />)}
  </div>;
}

export function PaintPanel({ room, wall, onWall, onChange, onCompare }: {
  room: Room; wall: Wall; onWall: (wall: Wall) => void; onChange: (room: Room) => void; onCompare: () => void;
}) {
  const paint = room.walls[wall];
  const chip = colorFor(paint.color);
  const [all, setAll] = useState(false);
  const [query, setQuery] = useState('');
  const [shadeBase, setShadeBase] = useState<string>();
  const [error, setError] = useState('');
  const matches = findColors(query);

  function apply(value: Partial<Paint>) {
    const walls = { ...room.walls };
    for (const side of all ? WALLS : [wall]) walls[side] = { ...walls[side], ...value };
    onChange({ ...room, walls });
  }

  const choose = (hex: string, keepBase = false) => {
    if (!keepBase) setShadeBase(hex);
    apply({ color: hex });
    setQuery('');
    setError('');
  };
  function search(event: FormEvent) {
    event.preventDefault();
    const hex = resolveColor(query) ?? (matches.length === 1 ? matches[0].hex : undefined);
    if (hex) choose(hex);
    else setError('Choose a result or enter a color name or HEX value.');
  }

  return <div className="panel-flow">
    <div className="panel-intro">
      <span className="panel-icon"><Palette size={19} /></span>
      <div><h2>Wall paint</h2><p>Find a color for your room.</p></div>
    </div>
    <SelectField label="Selected surface" value={wall} values={WALLS} display={side => WALL_LABELS[side]}
      onChange={side => { setShadeBase(undefined); onWall(side); }} />
    <section className="paint-section">
      <label className="field-label" htmlFor="search-color">Paint color</label>
      <form onSubmit={search} className="color-search">
        <Search size={17} aria-hidden="true" />
        <input id="search-color" placeholder="Search name or HEX" value={query} maxLength={35}
          onChange={event => { setQuery(event.currentTarget.value); setError(''); }} />
        {query && <button type="submit" className="search-apply" aria-label="Apply searched color" title="Apply searched color"><Check size={17} /></button>}
      </form>
      {error && <p className="inline-error" role="alert">{error}</p>}
      {query && matches.length > 0 && <div className="search-results" aria-label="Matching colors">
        {matches.slice(0, 6).map(result => <button type="button" key={result.hex} onClick={() => choose(result.hex)}>
          <span className="small-chip" style={colorStyle(result.hex)} /> {result.name} <code>{result.hex}</code>
        </button>)}
      </div>}
      <div className="current-color">
        <span className="current-chip" style={colorStyle(chip.hex)} />
        <div><strong>{chip.name}</strong><code>{chip.hex}</code></div>
        <label className="color-picker" title="Pick a custom color">
          <Droplet size={17} aria-hidden="true" />
          <input type="color" aria-label="Pick a custom color" value={chip.hex} onChange={event => choose(event.currentTarget.value.toUpperCase())} />
        </label>
      </div>
    </section>
    <section className="paint-section">
      <h3>Studio palette</h3>
      <Swatches colors={PALETTE} selected={chip.hex} onSelect={choose} label="Studio palette" />
    </section>
    <section className="paint-section">
      <h3>Related shades</h3>
      <Swatches colors={relatedColors(shadeBase ?? chip.hex)} selected={chip.hex}
        onSelect={hex => { if (!shadeBase) setShadeBase(chip.hex); choose(hex, true); }} label="Related shades" />
    </section>
    <section className="paint-section finish-section">
      <h3>Paint finish</h3>
      <Segmented label="Paint finish" values={FINISHES} value={paint.finish} onChange={finish => apply({ finish })} />
      <div className="all-walls">
        <span>Paint all walls</span>
        <button type="button" role="switch" aria-checked={all} aria-label="Paint all walls" onClick={() => {
          setAll(!all);
          if (!all) onChange({ ...room, walls: { north: paint, east: paint, south: paint, west: paint } });
        }}><span /></button>
      </div>
    </section>
    <button type="button" className="button button-secondary compare-button" onClick={onCompare}>
      <Layers2 size={17} /> Compare paint options <ChevronRight size={16} className="ml-auto" />
    </button>
  </div>;
}
