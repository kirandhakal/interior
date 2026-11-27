'use client';

import { createContext, useState } from 'react';
import { formatMeasurement, measurementInputValue, toMeters, type MeasurementUnit } from '@studio/measurement';
import { inBounds } from '@studio/dimensions';

export const MeasurementUnitContext = createContext<MeasurementUnit>('m');

export function MeasurementInput({ id, label, value, unit, bounds, onChange, autoFocus }: {
  id: string;
  label: string;
  value: number;
  unit: MeasurementUnit;
  bounds: readonly [number, number];
  onChange: (meters: number) => void;
  autoFocus?: boolean;
}) {
  const [raw, setRaw] = useState<{ text: string; meters: number; unit: MeasurementUnit }>();
  const invalid = !inBounds(value, bounds);
  const [min, max] = bounds;
  const draft = raw?.unit === unit && Object.is(raw.meters, value) ? raw.text : measurementInputValue(value, unit);

  return <div className="field measurement-field">
    <label htmlFor={id}>{label}</label>
    <span className="number-wrap">
      <input id={id} type="number" step="any" value={draft} min={measurementInputValue(min, unit)}
        max={measurementInputValue(max, unit)} autoFocus={autoFocus} required aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-range` : undefined} onChange={event => {
          const { value: text, valueAsNumber } = event.currentTarget;
          const converted = toMeters(valueAsNumber, unit);
          const meters = Math.abs(converted - min) < 1e-11 ? min : Math.abs(converted - max) < 1e-11 ? max : converted;
          setRaw({ text, meters, unit });
          onChange(meters);
        }} />
      <span className="unit" aria-hidden="true">{unit}</span>
    </span>
    {invalid && <span id={`${id}-range`} className="inline-error">{formatMeasurement(min, unit)} to {formatMeasurement(max, unit)}</span>}
  </div>;
}
