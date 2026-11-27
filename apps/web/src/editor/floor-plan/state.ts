import { DEFAULT_WALL_THICKNESS, WALL_THICKNESS_BOUNDS, inBounds, type OutlineVertex, type PlanPoint, type Wall } from '@studio/dimensions';
import { nearestOnSegment, polygonError, samePoint } from '@studio/polygon';

export type PlanSelection = { kind: 'vertex' | 'wall'; id: Wall };
export type PlanDraft = { points: OutlineVertex[]; closed: boolean; selection?: PlanSelection; error?: string };
type Edit =
  | { type: 'load'; points: OutlineVertex[]; closed: boolean }
  | { type: 'select'; selection?: PlanSelection }
  | { type: 'append'; point: OutlineVertex }
  | { type: 'move'; id: Wall; point: PlanPoint }
  | { type: 'insert'; wall: Wall; id: Wall; at?: PlanPoint }
  | { type: 'remove'; id: Wall }
  | { type: 'thickness'; id: Wall; value: number }
  | { type: 'close' };

export const newWallId = (): Wall => `wall-${crypto.randomUUID()}`;

export function draftWalls(points: readonly OutlineVertex[], closed: boolean) {
  return points.slice(0, closed ? points.length : Math.max(0, points.length - 1)).map((start, index) =>
    ({ start, end: points[(index + 1) % points.length], index }));
}

export function planDraftReducer(state: PlanDraft, edit: Edit): PlanDraft {
  const { points, closed } = state;
  const update = (next: OutlineVertex[], close = closed, selection = state.selection): PlanDraft => {
    const error = polygonError(next, close);
    return error ? { ...state, error } : { points: next, closed: close, selection };
  };

  switch (edit.type) {
    case 'load': return { points: edit.points, closed: edit.closed };
    case 'select': return { ...state, selection: edit.selection, error: undefined };
    case 'append': return closed ? state : update([...points, edit.point], false, { kind: 'vertex', id: edit.point.wallId });
    case 'close': return update(points, true, undefined);
    case 'move': {
      const previous = points.find(point => point.wallId === edit.id);
      if (!previous || samePoint(previous, edit.point)) return state.error ? { ...state, error: undefined } : state;
      return update(points.map(point => point.wallId === edit.id ? { ...point, ...edit.point } : point));
    }
    case 'insert': {
      const wall = draftWalls(points, closed).find(({ start }) => start.wallId === edit.wall);
      if (!wall) return state;
      const { start, end, index } = wall;
      const point = edit.at ? nearestOnSegment(edit.at, start, end) : { x: (start.x + end.x) / 2, z: (start.z + end.z) / 2 };
      return update([...points.slice(0, index + 1), { ...point, wallId: edit.id, thickness: start.thickness }, ...points.slice(index + 1)],
        closed, { kind: 'vertex', id: edit.id });
    }
    case 'remove': {
      const next = points.filter(point => point.wallId !== edit.id);
      const last = !closed && next.at(-1);
      const result = update(next);
      return result.error ? result : { ...result, selection: last ? { kind: 'vertex', id: last.wallId } : undefined };
    }
    case 'thickness':
      return inBounds(edit.value, WALL_THICKNESS_BOUNDS) ? {
        ...state, error: undefined,
        points: points.map(point => point.wallId === edit.id ? { ...point, thickness: edit.value === DEFAULT_WALL_THICKNESS ? undefined : edit.value } : point),
      } : { ...state, error: 'Enter a wall thickness within the allowed range.' };
  }
}
