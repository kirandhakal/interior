import { bounds, connectRooms, connectionError, footprint, layoutError, physicalWalls, world } from './house';
import { dimensionError, LIMITS, roomPlan, WALL_DEFAULT, type PlanPoint, type Room } from './model';
import { planPerimeter, pointDistance, polygonError, signedPlanArea, turn } from './polygon';

export type CorridorSettings = { width: number; height: number; thickness: number; openingKind?: 'Door' | 'Passage' };
export type CorridorProposal = { rooms: Room[]; corridor: Room; length: number };
const add = (a: PlanPoint, b: PlanPoint, scale = 1): PlanPoint => ({ x: a.x + b.x * scale, z: a.z + b.z * scale });
const direction = (a: PlanPoint, b: PlanPoint) => { const d = pointDistance(a, b); return { x: (b.x-a.x)/d, z: (b.z-a.z)/d }; };

/** A constant-width, square-capped path. Rejects reversals and intersecting miters. */
export function corridorOutline(input: readonly PlanPoint[], width: number): PlanPoint[] {
  if (!Number.isFinite(width) || width < .9 || width > 6) throw new Error('Corridor width must be between 0.9 and 6 m.');
  const path = input.filter((p,i) => !i || pointDistance(p,input[i-1]) > 1e-7).map(p=>({...p}));
  for (let i=1;i<path.length-1;) {
    const a=direction(path[i-1],path[i]), b=direction(path[i],path[i+1]);
    if (Math.abs(turn(path[i-1],path[i],path[i+1]))<1e-7 && a.x*b.x+a.z*b.z>0) path.splice(i,1); else i++;
  }
  if (path.length<2) throw new Error('Draw at least two distinct corridor centerline points.');
  const sides = [-1,1].map(sign=>path.map((p,i)=>{
    const before=direction(path[Math.max(0,i-1)],path[i===0?1:i]);
    const after=direction(path[i===path.length-1?i-1:i],path[Math.min(path.length-1,i+1)]);
    const n1={x:-before.z,z:before.x}, n2={x:-after.z,z:after.x};
    const denominator=1+before.x*after.x+before.z*after.z;
    if(denominator<.08) throw new Error('This corridor turn is too sharp. Spread the corners farther apart.');
    return add(p,add(n1,n2),sign*width/2/denominator);
  }));
  const outline=[...sides[0],...sides[1].reverse()];
  return signedPlanArea(outline)>0?outline:outline.reverse();
}

export function corridorFromPath(path: readonly PlanPoint[], settings: CorridorSettings, id = crypto.randomUUID()): Room {
  const points=corridorOutline(path,settings.width), b=bounds(points);
  const center={x:(b.minX+b.maxX)/2,z:(b.minZ+b.maxZ)/2};
  const outline=points.map((p,i)=>({x:p.x-center.x,z:p.z-center.z,wallId:`wall-corridor-${i}` as const,thickness:settings.thickness}));
  const dimensions={length:b.maxX-b.minX,width:b.maxZ-b.minZ,height:settings.height,outline};
  const error=polygonError(outline)??dimensionError(dimensions);
  if(error) throw new Error(error);
  return {id,name:'Corridor',spaceType:'Corridor',placement:{...center,rotation:0},dimensions,
    walls:Object.fromEntries(outline.map(p=>[p.wallId,{color:WALL_DEFAULT,finish:'Matte' as const}])),
    daylight:'Afternoon',openings:[],furniture:[],lights:[],options:[]};
}

/** Connect only actual shared boundaries; never punch a door through an unrelated wall. */
export function connectCorridor(rooms: Room[], corridor: Room, selectedIds: string[], openingKind: 'Door' | 'Passage' = 'Door'): Room[] {
  if(rooms.length>=LIMITS.rooms) throw new Error(`A house can contain up to ${LIMITS.rooms} spaces.`);
  let result=[...rooms,corridor];
  const collision=layoutError(result);
  if(collision) throw new Error(collision);
  for(const id of new Set(selectedIds)) {
    const segments=physicalWalls(result).filter(s=>s.sides.length===2 && s.sides.some(side=>side.room.id===id) && s.sides.some(side=>side.room.id===corridor.id));
    let linked: Room[]|undefined;
    for(const segment of segments) { try { linked=connectRooms(segment).map(r=>({...r,openings:r.openings.map(o=>segment.sides.some(side=>side.room.openings.some(old=>old.id===o.id))?o:{...o,kind:openingKind})})); break; } catch { /* Try the next free wall segment. */ } }
    if(!linked) throw new Error(`No clear shared wall for a doorway to ${rooms.find(r=>r.id===id)?.name??'the selected room'}. Adjust the route or move existing wall items.`);
    result=result.map(r=>linked!.find(n=>n.id===r.id)??r);
  }
  const invalid=connectionError(result);
  if(invalid) throw new Error(invalid);
  return result;
}

/** Bounded deterministic search over wall ports and straight/L/U obstacle detours.
 * All rooms, including hidden rooms, are obstacles. Geometry is never resized.
 */
export function generateCorridors(rooms: Room[], selectedIds: string[], settings: CorridorSettings): CorridorProposal[] {
  const selected=rooms.filter(r=>selectedIds.includes(r.id));
  if(selected.length<2) throw new Error('Select at least two rooms to connect.');
  corridorOutline([{x:0,z:0},{x:2,z:0}],settings.width);
  const ports=selected.map(room=>roomPlan(room.dimensions).edges.filter(e=>e.span>=Math.max(1.15,settings.width+.16)).map(e=>{
    const point=world(room,e.midpoint), outward=world(room,add(e.midpoint,e.normal));
    return {point,stem:add(point,direction(point,outward),settings.width)};
  }));
  const obstacles=rooms.map(r=>bounds(footprint(r))), clearance=settings.width/2+.02;
  const xs=[...new Set(obstacles.flatMap(b=>[b.minX-clearance,b.maxX+clearance]))];
  const zs=[...new Set(obstacles.flatMap(b=>[b.minZ-clearance,b.maxZ+clearance]))];
  const candidates: {path:PlanPoint[];length:number}[]=[];
  for(let i=0;i<ports.length;i++) for(let j=i+1;j<ports.length;j++) for(const a of ports[i]) for(const b of ports[j]) {
    const routes=[ [a.point,b.point], [a.point,a.stem,b.stem,b.point],
      [a.point,a.stem,{x:a.stem.x,z:b.stem.z},b.stem,b.point],
      [a.point,a.stem,{x:b.stem.x,z:a.stem.z},b.stem,b.point],
      ...xs.map(x=>[a.point,a.stem,{x,z:a.stem.z},{x,z:b.stem.z},b.stem,b.point]),
      ...zs.map(z=>[a.point,a.stem,{x:a.stem.x,z},{x:b.stem.x,z},b.stem,b.point]) ];
    for(const path of routes) candidates.push({path,length:planPerimeter(path,false)});
  }
  candidates.sort((a,b)=>a.length-b.length);
  const proposals: CorridorProposal[]=[], seen=new Set<string>();
  // Cheap rejection precedes shared-wall splitting and opening creation.
  for(const candidate of candidates) {
    try {
      const corridor=corridorFromPath(candidate.path,settings);
      const key=JSON.stringify(footprint(corridor).map(p=>[+p.x.toFixed(5),+p.z.toFixed(5)]));
      if(seen.has(key)) continue; seen.add(key);
      const result=connectCorridor(rooms,corridor,selectedIds,settings.openingKind);
      proposals.push({rooms:result,corridor:result.find(r=>r.id===corridor.id)!,length:candidate.length});
      if(proposals.length===4) break;
    } catch { /* Invalid geometry, obstructed route or occupied door: evaluate next candidate. */ }
  }
  if(!proposals.length) throw new Error('No clear corridor route connects every selected room at this width. Try a narrower corridor, draw a custom outline, or reposition rooms to expose a shared doorway.');
  return proposals;
}
