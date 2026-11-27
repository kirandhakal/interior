import { FIXTURE_MOUNTS, LIGHTS, type CeilingDecorKind, type LightKind } from '@studio/model';

export const ceilingLights = LIGHTS.filter(kind => FIXTURE_MOUNTS[kind].includes('Ceiling'));
export type CeilingItem = { type: 'decor'; kind: CeilingDecorKind } | { type: 'light'; kind: LightKind };
