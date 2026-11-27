import { useId } from 'react';
import { wallPaintPolygons, type WallItem } from '@studio/wall-design';
import type { IsolatedWall } from '@studio/wall-surface';

export function WallItemVisual({ item, scale, apertures }: { item: WallItem; scale: number; apertures: IsolatedWall['apertures'] }) {
  const textureId = useId();
  const w = item.width * scale;
  const h = item.height * scale;
  if (item.kind === 'Paint section') {
    const a = item.rotation * Math.PI / 180;
    return <><defs><pattern id={textureId} width={0.08*scale} height={0.08*scale} patternUnits="userSpaceOnUse">
      <rect width={0.08*scale} height={0.08*scale} fill={item.color} />
      {item.texture === 'Linen' ? <path d={`M 0 0 H ${0.08*scale} M 0 0 V ${0.08*scale}`} stroke="#000" strokeOpacity="0.12" strokeWidth={0.01*scale} /> : <circle cx={0.04*scale} cy={0.04*scale} r={0.01*scale} fill="#000" opacity="0.12" />}
    </pattern></defs>{wallPaintPolygons(item, apertures).map((polygon, index) => <polygon key={index} fill={item.texture && item.texture !== 'Plain' ? `url(#${textureId})` : item.color}
      points={polygon.map(p => {
        const x = p.u - item.u - item.width / 2; const y = p.v - item.v - item.height / 2;
        return `${(x * Math.cos(a) + y * Math.sin(a)) * scale},${(x * Math.sin(a) - y * Math.cos(a)) * scale}`;
      }).join(' ')} />)}</>;
  }
  return <>
    <rect x={-w / 2} y={-h / 2} width={w} height={h} fill={item.color}
      stroke="#0003" strokeWidth="1" />
    {(item.kind === 'Wall art' || item.kind === 'Mirror') && <rect x={-w * 0.435} y={-h * 0.45}
      width={w * 0.87} height={h * 0.9} fill={item.kind === 'Mirror' ? '#c3d7dc' : '#f5ebdd'} />}
    {item.kind === 'Wall art' && <g fill={item.color}>
      <circle cx={w * 0.12} cy={-h * 0.13} r={Math.min(w, h) * 0.23} />
      <rect x={-w * 0.35} y={h * 0.11} width={w * 0.62} height={h * 0.22} />
    </g>}
    {item.kind === 'Mirror' && <path d={`M ${-w * 0.3} ${h * 0.25} L ${w * 0.25} ${-h * 0.3}`} stroke="#fff9" strokeWidth="2" />}
    {item.kind === 'Wall panel' && Array.from({ length: 5 }, (_, i) => <line key={i}
      x1={-w / 2 + w * (i + 1) / 6} x2={-w / 2 + w * (i + 1) / 6} y1={-h * 0.475} y2={h * 0.475} stroke="#776b5c" />)}
  </>;
}
