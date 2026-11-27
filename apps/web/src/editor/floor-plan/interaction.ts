import { useEffect, useRef, useState, type Dispatch, type KeyboardEvent, type PointerEvent } from 'react';
import { planBounds, type PlanPoint, type Wall } from '@studio/dimensions';
import { nearestOnSegment, pointDistance, snapPlanPoint } from '@studio/polygon';
import { draftWalls, newWallId, planDraftReducer, type PlanDraft } from './state';

export const CANVAS_WIDTH = 820;
export const CANVAS_HEIGHT = 530;
export const GRID_STEP = 0.25;
export const ANGLE_STEP = 15;
const defaultScale = 76;
const zoomRange = [14, 480] as const;

type Viewport = { x: number; y: number; scale: number };
type Pointer = { id: number; start: ScreenPoint; view: Viewport; pan: boolean; vertex?: Wall; offset?: PlanPoint; moved: boolean };
type ScreenPoint = { x: number; y: number };
export type PlanEditDispatch = Dispatch<Parameters<typeof planDraftReducer>[1]>;

function fitted(points: readonly PlanPoint[]): Viewport {
  if (!points.length) return { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, scale: defaultScale };
  const { length, width, center } = planBounds(points);
  const scale = Math.min(defaultScale, (CANVAS_WIDTH - 140) / length, (CANVAS_HEIGHT - 120) / width);
  return { x: CANVAS_WIDTH / 2 - center.x * scale, y: CANVAS_HEIGHT / 2 - center.z * scale, scale };
}

export const toScreen = (point: PlanPoint, view: Viewport): ScreenPoint => ({ x: view.x + point.x * view.scale, y: view.y + point.z * view.scale });
const toPlan = (point: ScreenPoint, view: Viewport): PlanPoint => ({ x: (point.x - view.x) / view.scale, z: (point.y - view.y) / view.scale });

function canvasPoint(svg: SVGSVGElement, x: number, y: number) {
  const transform = svg.getScreenCTM();
  if (!transform) return { x: 0, y: 0 };
  return new DOMPoint(x, y).matrixTransform(transform.inverse());
}

export function usePlanInteraction(state: PlanDraft, dispatch: PlanEditDispatch, gridSnap: boolean, angleSnap: boolean, panMode: boolean) {
  const svg = useRef<SVGSVGElement>(null);
  const active = useRef<Pointer | undefined>(undefined);
  const [view, setView] = useState(() => fitted(state.points));
  const [hover, setHover] = useState<PlanPoint>();
  const [panning, setPanning] = useState(false);
  const { points, closed } = state;

  function zoom(factor: number, anchor: ScreenPoint = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 }) {
    setView(current => {
      const scale = Math.min(zoomRange[1], Math.max(zoomRange[0], current.scale * factor));
      const point = toPlan(anchor, current);
      return { x: anchor.x - point.x * scale, y: anchor.y - point.z * scale, scale };
    });
  }

  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    function wheel(event: WheelEvent) {
      event.preventDefault();
      if (!element) return;
      const anchor = canvasPoint(element, event.clientX, event.clientY);
      zoom(Math.exp(-Math.max(-120, Math.min(120, event.deltaY)) / 320), anchor);
    }
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);

  const snapped = (point: PlanPoint, shift: boolean, anchor?: PlanPoint) => snapPlanPoint(point, gridSnap ? GRID_STEP : 0,
    angleSnap || shift ? ANGLE_STEP : 0, anchor);
  const vertexAt = (point: PlanPoint) => points.find(vertex => pointDistance(vertex, point) * view.scale <= 13);
  const wallAt = (point: PlanPoint) => draftWalls(points, closed).find(({ start, end }) =>
    pointDistance(point, nearestOnSegment(point, start, end)) * view.scale <= 12);

  function onPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (active.current || (event.button !== 0 && event.button !== 1)) return;
    const position = canvasPoint(event.currentTarget, event.clientX, event.clientY);
    const pan = panMode || event.button === 1 || event.altKey;
    const point = toPlan(position, view);
    const vertex = pan ? undefined : vertexAt(point);
    const canDrag = vertex && (closed || vertex !== points[0] || points.length < 3);
    active.current = { id: event.pointerId, start: position, view, pan, vertex: canDrag ? vertex.wallId : undefined,
      offset: canDrag ? { x: vertex.x - point.x, z: vertex.z - point.z } : undefined, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    if (pan) setPanning(true);
    if (canDrag) dispatch({ type: 'select', selection: { kind: 'vertex', id: vertex.wallId } });
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const position = canvasPoint(event.currentTarget, event.clientX, event.clientY);
    const drag = active.current;
    const point = toPlan(position, view);
    if (drag?.id === event.pointerId) {
      drag.moved ||= Math.hypot(position.x - drag.start.x, position.y - drag.start.y) > 3;
      if (drag.pan && drag.moved) {
        setView({ ...drag.view, x: drag.view.x + position.x - drag.start.x, y: drag.view.y + position.y - drag.start.y });
        return;
      }
      if (drag.vertex && drag.offset && drag.moved) {
        const index = points.findIndex(vertex => vertex.wallId === drag.vertex);
        const anchor = index > 0 ? points[index - 1] : closed ? points.at(-1) : undefined;
        dispatch({ type: 'move', id: drag.vertex, point: snapped({ x: point.x + drag.offset.x, z: point.z + drag.offset.z }, event.shiftKey, anchor) });
        return;
      }
    }
    if (!closed && !panMode) {
      const first = points[0];
      const target = points.length >= 3 && vertexAt(point) === first ? first : snapped(point, event.shiftKey, points.at(-1));
      setHover(target);
    }
  }

  function onPointerUp(event: PointerEvent<SVGSVGElement>) {
    const drag = active.current;
    if (drag?.id !== event.pointerId) return;
    active.current = undefined;
    setPanning(false);
    if (drag.pan || drag.moved) return;
    const point = toPlan(canvasPoint(event.currentTarget, event.clientX, event.clientY), view);
    const vertex = vertexAt(point);
    if (!closed && points.length >= 3 && vertex === points[0]) {
      dispatch({ type: 'close' });
      setHover(undefined);
    } else if (vertex) {
      dispatch({ type: 'select', selection: { kind: 'vertex', id: vertex.wallId } });
    } else if (!closed) {
      dispatch({ type: 'append', point: { ...snapped(point, event.shiftKey, points.at(-1)), wallId: newWallId() } });
    } else {
      const wall = wallAt(point);
      dispatch({ type: 'select', selection: wall ? { kind: 'wall', id: wall.start.wallId } : undefined });
    }
  }

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (!closed && event.key === 'Enter') {
      event.preventDefault();
      dispatch({ type: 'close' });
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      const id = state.selection?.kind === 'vertex' ? state.selection.id : !closed ? points.at(-1)?.wallId : undefined;
      if (id) { event.preventDefault(); dispatch({ type: 'remove', id }); }
    } else if (event.key === '+' || event.key === '-') {
      event.preventDefault();
      zoom(event.key === '+' ? 1.25 : 0.8);
    }
  }

  function fit(points = state.points) {
    setView(fitted(points));
    setHover(undefined);
  }

  return { svg, view, hover, panning, zoom, fit, handlers: { onPointerDown, onPointerMove, onPointerUp, onKeyDown,
    onPointerLeave: () => setHover(undefined),
    onPointerCancel: () => { active.current = undefined; setPanning(false); },
  } };
}
