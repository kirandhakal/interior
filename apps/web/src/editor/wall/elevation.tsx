'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Hand, Maximize, Minus, Plus } from 'lucide-react';
import { formatMeasurement, type MeasurementUnit } from '@studio/measurement';
import type { IsolatedWall, WallPoint } from '@studio/wall-surface';
import { IconButton } from '@/components/ui';

const WIDTH = 1000;
const HEIGHT = 650;
const initialCamera = { zoom: 1, x: 0, y: 0 };

export function WallElevation({ wall, unit, selectedOpening, onOpening, onPoint }: {
  wall: IsolatedWall; unit: MeasurementUnit; selectedOpening?: string;
  onOpening: (id: string) => void; onPoint: (point: WallPoint) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [camera, setCamera] = useState(initialCamera);
  const drag = useRef<{ pointer: number; x: number; y: number; moved: boolean } | null>(null);
  const gridId = useId();
  const { width, height } = wall.frame;
  const scale = Math.min(790 / width, 440 / height);
  const left = (WIDTH - width * scale) / 2;
  const top = (HEIGHT - height * scale) / 2;
  const screenPoint = (x: number, y: number) => {
    const matrix = svg.current?.getScreenCTM();
    return matrix ? new DOMPoint(x, y).matrixTransform(matrix.inverse()) : undefined;
  };
  const zoom = (factor: number, x = WIDTH / 2, y = HEIGHT / 2) => setCamera(current => {
    const next = Math.min(8, Math.max(0.25, current.zoom * factor));
    const ratio = next / current.zoom;
    return { zoom: next, x: x - WIDTH / 2 - (x - WIDTH / 2 - current.x) * ratio,
      y: y - HEIGHT / 2 - (y - HEIGHT / 2 - current.y) * ratio };
  });
  useEffect(() => {
    const element = svg.current;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const point = screenPoint(event.clientX, event.clientY);
      if (point) zoom(Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * 0.004), point.x, point.y);
    };
    element?.addEventListener('wheel', wheel, { passive: false });
    return () => element?.removeEventListener('wheel', wheel);
  }, []);

  return <div className="wall-viewport">
    <svg ref={svg} className="wall-elevation" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} tabIndex={0}
      role="group" aria-label={`${wall.surface} wall elevation. Drag to pan; use plus and minus to zoom, arrows to pan, or 0 to fit.`}
      onKeyDown={event => {
        if (event.target !== event.currentTarget) return;
        const delta: Record<string, [number, number]> = { ArrowLeft: [30, 0], ArrowRight: [-30, 0], ArrowUp: [0, 30], ArrowDown: [0, -30] };
        if (delta[event.key]) { event.preventDefault(); const [x, y] = delta[event.key]; setCamera(c => ({ ...c, x: c.x + x, y: c.y + y })); }
        else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(1.25); }
        else if (event.key === '-') { event.preventDefault(); zoom(0.8); }
        else if (event.key === '0') setCamera(initialCamera);
      }}
      onPointerDown={event => {
        if (event.button !== 0 || drag.current) return;
        const point = screenPoint(event.clientX, event.clientY);
        if (!point) return;
        drag.current = { pointer: event.pointerId, x: point.x, y: point.y, moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        const point = screenPoint(event.clientX, event.clientY);
        if (!point) return;
        const down = drag.current;
        if (down && down.pointer === event.pointerId) {
          const x = point.x - down.x;
          const y = point.y - down.y;
          if (Math.hypot(x, y) > 2 || down.moved) {
            setCamera(c => ({ ...c, x: c.x + x, y: c.y + y }));
            down.x = point.x; down.y = point.y; down.moved = true;
          }
        } else if (!down) onPoint({ u: ((point.x - WIDTH / 2 - camera.x) / camera.zoom + WIDTH / 2 - left) / scale,
          v: height - ((point.y - HEIGHT / 2 - camera.y) / camera.zoom + HEIGHT / 2 - top) / scale, depth: 0 });
      }}
      onPointerUp={event => {
        const down = drag.current;
        if (down?.pointer !== event.pointerId) return;
        if (!down.moved) {
          const point = screenPoint(event.clientX, event.clientY);
          if (point) {
            const u = ((point.x - WIDTH / 2 - camera.x) / camera.zoom + WIDTH / 2 - left) / scale;
            const v = height - ((point.y - HEIGHT / 2 - camera.y) / camera.zoom + HEIGHT / 2 - top) / scale;
            onPoint({ u, v, depth: 0 });
            const hit = wall.apertures.find(o => u >= o.u && u <= o.u + o.width && v >= o.v && v <= o.v + o.height);
            if (hit) onOpening(hit.opening.id);
          }
        }
        drag.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
      <defs><pattern id={gridId} width={scale / 2} height={scale / 2} patternUnits="userSpaceOnUse">
        <path d={`M ${scale / 2} 0 H 0 V ${scale / 2}`} fill="none" stroke="#53634a" strokeOpacity=".14" strokeWidth="1" />
      </pattern></defs>
      <g transform={`translate(${WIDTH / 2 + camera.x} ${HEIGHT / 2 + camera.y}) scale(${camera.zoom}) translate(${-WIDTH / 2} ${-HEIGHT / 2})`}>
        <rect x={left} y={top} width={width * scale} height={height * scale} fill={wall.paint.color} stroke="#53634a" strokeWidth="3" />
        <rect x={left} y={top} width={width * scale} height={height * scale} fill={`url(#${gridId})`} />
        {wall.apertures.map(({ opening, u, v, width: w, height: h }) => {
          const x = left + u * scale;
          const y = top + (height - v - h) * scale;
          return <g key={opening.id} role="button" tabIndex={0} aria-label={`Inspect ${opening.kind.toLowerCase()} ${opening.id}`}
            aria-pressed={selectedOpening === opening.id} onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpening(opening.id); }
            }}>
            <title>{opening.kind} · {formatMeasurement(opening.width, unit)} × {formatMeasurement(h, unit)} · sill {formatMeasurement(v, unit)}</title>
            <rect x={x} y={y} width={w * scale} height={h * scale} fill={opening.kind === 'Door' ? '#b69775' : '#c5d9dd'}
              stroke={selectedOpening === opening.id ? '#305fbe' : '#697469'} strokeWidth={selectedOpening === opening.id ? 4 : 2} />
            {opening.kind === 'Window' && <path d={`M ${x + w * scale / 2} ${y} v ${h * scale} M ${x} ${y + h * scale / 2} h ${w * scale}`} stroke="#fff" strokeWidth="4" />}
            <text x={x + w * scale / 2} y={y + h * scale / 2 + 22} textAnchor="middle" className="wall-svg-label">{opening.kind}</text>
          </g>;
        })}
        <g fill="none" stroke="#65705d" strokeWidth="1.5">
          <path d={`M ${left} ${top - 15} v -30 M ${left + width * scale} ${top - 15} v -30 M ${left} ${top - 32} h ${width * scale}`} />
          <path d={`M ${left - 15} ${top} h -30 M ${left - 15} ${top + height * scale} h -30 M ${left - 32} ${top} v ${height * scale}`} />
        </g>
        <text x={WIDTH / 2} y={top - 46} textAnchor="middle" className="wall-svg-dimension">{formatMeasurement(width, unit)}</text>
        <text transform={`translate(${left - 48} ${HEIGHT / 2}) rotate(-90)`} textAnchor="middle" className="wall-svg-dimension">{formatMeasurement(height, unit)}</text>
        <circle cx={left} cy={top + height * scale} r="5" fill="#53634a" />
        <text x={left} y={top + height * scale + 30} className="wall-svg-label">0, 0 · U → · V ↑</text>
      </g>
    </svg>
    <div className="wall-viewport-tools" role="group" aria-label="Elevation camera">
      <Hand size={16} aria-hidden="true" /><span>{Math.round(camera.zoom * 100)}%</span>
      <IconButton label="Zoom in on wall" onClick={() => zoom(1.25)}><Plus size={17} /></IconButton>
      <IconButton label="Zoom out on wall" onClick={() => zoom(0.8)}><Minus size={17} /></IconButton>
      <IconButton label="Fit wall to view" onClick={() => setCamera(initialCamera)}><Maximize size={17} /></IconButton>
    </div>
  </div>;
}
