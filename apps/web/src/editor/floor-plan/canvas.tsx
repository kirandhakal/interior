import { useId, type KeyboardEvent } from 'react';
import { formatMeasurement, type MeasurementUnit } from '@studio/measurement';
import { pointDistance, polygonError, wallHeading } from '@studio/polygon';
import { CANVAS_HEIGHT, CANVAS_WIDTH, GRID_STEP, toScreen, usePlanInteraction } from './interaction';
import { draftWalls, type PlanDraft, type PlanSelection } from './state';

type ScreenPoint = ReturnType<typeof toScreen>;

function Guide({ start, end, label, active = false }: { start: ScreenPoint; end: ScreenPoint; label: string; active?: boolean }) {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  if (length < 2 || (length < 55 && !active)) return null;
  const x = (start.x + end.x) / 2;
  const y = (start.y + end.y) / 2;
  const dx = (end.y - start.y) / length * 17;
  const dy = (start.x - end.x) / length * 17;
  return <g className="plan-guide" aria-hidden="true">
    {active && <>
      <line x1={start.x} y1={start.y} x2={start.x + dx} y2={start.y + dy} />
      <line x1={end.x} y1={end.y} x2={end.x + dx} y2={end.y + dy} />
      <line x1={start.x + dx} y1={start.y + dy} x2={end.x + dx} y2={end.y + dy} />
    </>}
    <text x={x + dx} y={y + dy} textAnchor="middle" dominantBaseline="central">{label}</text>
  </g>;
}

export function PlanCanvas({ state, unit, interaction, panMode, select }: {
  state: PlanDraft;
  unit: MeasurementUnit;
  interaction: ReturnType<typeof usePlanInteraction>;
  panMode: boolean;
  select: (selection: PlanSelection) => void;
}) {
  const { svg, view, hover, panning, handlers } = interaction;
  const { points, closed, selection } = state;
  const pattern = useId();
  const cell = GRID_STEP * view.scale;
  const major = cell * 4;
  const vertices = points.map(point => toScreen(point, view));
  const last = points.at(-1);
  const draft = !closed && !panMode && hover && last && { from: vertices.at(-1)!, to: toScreen(hover, view) };
  const wouldClose = hover === points[0] && points.length >= 3;
  const invalid = draft && (wouldClose ? polygonError(points) : polygonError([...points, hover], false));
  const activate = (event: KeyboardEvent<SVGGElement>, selection: PlanSelection) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    select(selection);
  };

  return <svg ref={svg} className="plan-canvas" viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`} role="group" tabIndex={0}
    aria-label="Floor plan canvas" data-mode={panning || panMode ? 'pan' : closed ? 'edit' : 'draw'} {...handlers}>
    <defs>
      <pattern id={`${pattern}-minor`} x={view.x} y={view.y} width={cell} height={cell} patternUnits="userSpaceOnUse">
        <path d={`M ${cell} 0 H 0 V ${cell}`} className="plan-grid-minor" />
      </pattern>
      <pattern id={`${pattern}-major`} x={view.x} y={view.y} width={major} height={major} patternUnits="userSpaceOnUse">
        <path d={`M ${major} 0 H 0 V ${major}`} className="plan-grid-major" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill={`url(#${pattern}-minor)`} />
    <rect width="100%" height="100%" fill={`url(#${pattern}-major)`} />
    <path className="plan-origin" d={`M ${view.x - 6} ${view.y} h 12 M ${view.x} ${view.y - 6} v 12`} aria-hidden="true" />
    {closed && <polygon className="plan-floor" points={vertices.map(({ x, y }) => `${x},${y}`).join(' ')} />}
    {draftWalls(points, closed).map(({ start, end, index }) => {
      const from = vertices[index];
      const to = vertices[(index + 1) % vertices.length];
      const selected = selection?.kind === 'wall' && selection.id === start.wallId;
      const length = formatMeasurement(pointDistance(start, end), unit);
      return <g key={start.wallId} className="plan-wall" data-selected={selected} data-wall={start.wallId} role="button" tabIndex={0}
        aria-pressed={selected} aria-label={`Wall ${index + 1}, ${length}`} onKeyDown={event => activate(event, { kind: 'wall', id: start.wallId })}>
        <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="plan-wall-stroke" />
        <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="plan-wall-hit" />
        <Guide start={from} end={to} label={length} active={selected} />
      </g>;
    })}
    {draft && hover && last && <g className="plan-proposed" data-invalid={!!invalid} aria-hidden="true">
      <line x1={draft.from.x} y1={draft.from.y} x2={draft.to.x} y2={draft.to.y} />
      <Guide start={draft.from} end={draft.to}
        label={`${formatMeasurement(pointDistance(last, hover), unit)} · ${Number(wallHeading(last, hover).toFixed(1))}°`} active />
    </g>}
    {hover && !closed && !panMode && <circle className="plan-hover" cx={view.x + hover.x * view.scale}
      cy={view.y + hover.z * view.scale} r={4} data-invalid={!!invalid} aria-hidden="true" />}
    {points.map((point, index) => {
      const { x, y } = vertices[index];
      const selected = selection?.kind === 'vertex' && selection.id === point.wallId;
      const canClose = !closed && index === 0 && points.length >= 3;
      return <g key={point.wallId} className="plan-vertex" data-vertex={point.wallId} data-selected={selected} data-close={canClose}
        role="button" tabIndex={0} aria-label={`Vertex ${index + 1}`} aria-pressed={selected}
        onKeyDown={event => activate(event, { kind: 'vertex', id: point.wallId })}>
        <circle cx={x} cy={y} r={15} className="plan-vertex-hit" />
        <circle cx={x} cy={y} r={canClose ? 8 : selected ? 7 : 5} className="plan-vertex-mark" />
      </g>;
    })}
  </svg>;
}
