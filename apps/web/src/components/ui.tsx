'use client';

import { useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { measurementInputValue, toMeters } from '@studio/measurement';
import { MeasurementUnitContext } from './measurement-input';

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { label: string; pressed?: boolean };
export function IconButton({ label, pressed, className = '', children, ...props }: IconButtonProps) {
  return <button type="button" className={`icon-button ${className}`} aria-label={label} aria-pressed={pressed} title={label} {...props}>
    {children}
  </button>;
}

export function Segmented<T extends string>({ label, value, values, onChange, render }: {
  label: string; value: T; values: readonly T[]; onChange: (value: T) => void; render?: (value: T) => ReactNode;
}) {
  return <div className="segmented" role="group" aria-label={label}>
    {values.map(option => <button type="button" key={option} aria-pressed={value === option}
      onClick={() => onChange(option)}>{render ? render(option) : option}</button>)}
  </div>;
}

export function SelectField<T extends string>({ label, value, values, onChange, display }: {
  label: string; value: T; values: readonly T[]; onChange: (value: T) => void; display?: (value: T) => string;
}) {
  return <label className="field">
    <span>{label}</span>
    <span className="select-wrap">
      <select value={value} onChange={event => onChange(event.currentTarget.value as T)}>
        {values.map(option => <option key={option} value={option}>{display ? display(option) : option}</option>)}
      </select>
      <ChevronDown size={15} aria-hidden="true" />
    </span>
  </label>;
}

export function NumberField({ label, value, onChange, min, max, step = 0.01, unit = 'm' }: {
  label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; unit?: string;
}) {
  const measurementUnit = useContext(MeasurementUnitContext);
  const distance = unit === 'm';
  const display = (number: number | undefined) => number === undefined || !distance ? number : measurementInputValue(number, measurementUnit);
  const [draft, setDraft] = useState<string | undefined>();
  const commit = () => {
    if (draft === undefined) return;
    const number = Number(draft);
    const next = distance ? toMeters(number, measurementUnit) : number;
    setDraft(undefined);
    if (draft.trim() && Number.isFinite(next) && next !== value) onChange(next);
  };
  return <label className="field">
    <span>{label}</span>
    <span className="number-wrap">
      <input type="number" value={draft ?? display(value)} min={display(min)} max={display(max)} step={distance ? 'any' : step}
        onChange={event => setDraft(event.currentTarget.value)}
        onBlur={commit} onKeyDown={event => {
          if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
        }} />
      {unit && <span className="unit" aria-hidden="true">{distance ? measurementUnit : unit}</span>}
    </span>
  </label>;
}

export function RangeField({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (value: number) => void;
}) {
  const id = useId();
  return <label className="range-field" htmlFor={id}>
    <span>{label}<output aria-hidden="true">{value}{unit}</output></span>
    <input id={id} type="range" value={value} min={min} max={max} step={step} aria-valuetext={`${value}${unit}`}
      onChange={event => onChange(Number(event.currentTarget.value))} />
  </label>;
}

export function Modal({ title, onClose, children, wide = false }: {
  title: string; onClose: () => void; children: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'modal-wide' : ''}`} aria-labelledby={heading}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect();
      if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) onClose();
    }}>
    <header className="modal-header">
      <h2 id={heading}>{title}</h2>
      <IconButton label="Close dialog" onClick={onClose}><X size={19} /></IconButton>
    </header>
    {children}
  </dialog>;
}
