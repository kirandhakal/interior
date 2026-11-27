import type { PlanPoint } from '@studio/dimensions';

export const PLAN_PRESETS = {
  Rectangle: [[-3, -2], [3, -2], [3, 2], [-3, 2]],
  'L-shape': [[-3, -2.5], [3, -2.5], [3, -0.5], [0, -0.5], [0, 2.5], [-3, 2.5]],
  'U-shape': [[-3, -2.5], [-1, -2.5], [-1, 0.5], [1, 0.5], [1, -2.5], [3, -2.5], [3, 2.5], [-3, 2.5]],
  Polygon: [[-1.5, -2.5], [1.5, -2.5], [3, 0], [1.5, 2.5], [-1.5, 2.5], [-3, 0]],
};

export type PlanPreset = keyof typeof PLAN_PRESETS;
export const planPresetPoints = (preset: PlanPreset): PlanPoint[] => PLAN_PRESETS[preset].map(([x, z]) => ({ x, z }));
