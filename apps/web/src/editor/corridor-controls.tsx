import { useEffect, useState } from 'react';
import { generateCorridors, type CorridorProposal } from '@studio/corridor';
import { isOpenSpace } from '@studio/house';
import type { Room } from '@studio/model';

type Props = { rooms: Room[]; onPreview: (rooms?: Room[]) => void; onApply: (rooms: Room[], corridor: Room) => boolean };
export function CorridorControls({ rooms, onPreview, onApply }: Props) {
  const [openingKind,setOpeningKind]=useState<'Door' | 'Passage'>('Door');
  const [selected,setSelected]=useState<string[]>([]);
  const [width,setWidth]=useState(1.2), [height,setHeight]=useState(2.6), [thickness,setThickness]=useState(.16);
  const [proposals,setProposals]=useState<CorridorProposal[]>([]),[index,setIndex]=useState(0),[error,setError]=useState<string>();
  useEffect(()=>{setProposals([]);setSelected(ids=>ids.filter(id=>rooms.some(r=>r.id===id)));onPreview(undefined);},[rooms]); // Parent edits invalidate the captured proposal.
  const reject=()=>{setProposals([]);onPreview(undefined);setError(undefined);};
  const current=proposals[index];
  return <details className="house-attach"><summary>Connect rooms with a corridor</summary>
    <p className="house-help">Select rooms, then preview a clear route. Existing rooms keep their shape and position.</p>
    <fieldset disabled={!!current}><legend>Rooms to connect</legend>{rooms.filter(r=>!isOpenSpace(r)&&r.spaceType!=='Corridor').map(r=><label className="house-check" key={r.id}><input type="checkbox" checked={selected.includes(r.id)} onChange={e=>setSelected(e.target.checked?[...selected,r.id]:selected.filter(id=>id!==r.id))}/>{r.name}</label>)}</fieldset>
    <fieldset disabled={!!current}><legend>Corridor dimensions</legend><label className="field"><span>Connections</span><select aria-label="Corridor connection type" value={openingKind} onChange={e=>setOpeningKind(e.target.value as typeof openingKind)}><option>Door</option><option>Passage</option></select></label>{([
      ['Width (m)',width,setWidth,.9,6,.1],['Height (m)',height,setHeight,2,6,.1],['Wall thickness (m)',thickness,setThickness,.05,.6,.01],
    ] as const).map(([label,value,set,min,max,step])=><label className="field" key={label}><span>{label}</span><input aria-label={`Corridor ${label}`} type="number" min={min} max={max} step={step} value={value} onChange={e=>set(Number(e.target.value))}/></label>)}</fieldset>
    {!current&&<button className="button button-secondary" disabled={selected.length<2} onClick={()=>{try{const next=generateCorridors(rooms,selected,{width,height,thickness,openingKind});setProposals(next);setIndex(0);onPreview(next[0].rooms);setError(undefined);}catch(e){setError((e as Error).message);}}}>Preview corridor routes</button>}
    {current&&<section aria-label="Corridor route preview"><p role="status">Route {index+1} of {proposals.length} · {current.length.toFixed(2)} m centerline · {width.toFixed(2)} m wide. {selected.length} connected rooms. Existing room positions unchanged.</p>
      <button className="button" disabled={proposals.length<2} onClick={()=>{const next=(index+1)%proposals.length;setIndex(next);onPreview(proposals[next].rooms);}}>Alternative route</button>
      <button className="button button-primary" onClick={()=>{if(onApply(current.rooms,current.corridor))reject();}}>Apply corridor</button>
      <button className="button button-secondary" onClick={reject}>Reject preview</button>
    </section>}
    {error&&<p role="alert" className="inline-error">{error}</p>}
  </details>;
}
