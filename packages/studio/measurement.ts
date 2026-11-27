export const MEASUREMENT_UNITS = ['m', 'cm', 'ft', 'in'] as const;
export type MeasurementUnit = typeof MEASUREMENT_UNITS[number];

export const MEASUREMENT_LABELS: Record<MeasurementUnit, string> = { m: 'Meters', cm: 'Centimeters', ft: 'Feet', in: 'Inches' };
const METERS_PER_UNIT: Record<MeasurementUnit, number> = { m: 1, cm: 0.01, ft: 0.3048, in: 0.0254 };

export const fromMeters = (meters: number, unit: MeasurementUnit, power = 1) => meters / METERS_PER_UNIT[unit] ** power;
export const toMeters = (value: number, unit: MeasurementUnit) => value * METERS_PER_UNIT[unit];

export function measurementInputValue(meters: number, unit: MeasurementUnit) {
  return Number.isFinite(meters) ? Number(fromMeters(meters, unit).toPrecision(15)) : '';
}

const formatter = new Intl.NumberFormat('en', { maximumFractionDigits: 3 });

export function formatMeasurement(meters: number, unit: MeasurementUnit, power = 1) {
  return `${formatter.format(fromMeters(meters, unit, power))} ${unit}${power === 2 ? '²' : ''}`;
}
