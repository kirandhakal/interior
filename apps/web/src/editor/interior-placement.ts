import type { Furniture } from '@studio/model';

export const INTERIOR_DRAG_TYPE = 'application/x-room-paint-interior';
export type InteriorPlacement = Pick<Furniture, 'x' | 'z'>;
