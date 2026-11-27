import { roomPlan, type Room } from '@studio/model';
import { planArea } from '@studio/polygon';
export function RoomExplorer({rooms,active,onSelect,onChange,onDuplicate,onRemove}:{rooms:Room[];active:string;onSelect:(r:Room)=>void;onChange:(r:Room)=>void;onDuplicate:(r:Room)=>void;onRemove:(r:Room)=>void}) {
  return <ul className="room-explorer">{rooms.map(r=><li key={r.id}>
    <button type="button" aria-current={r.id===active?'true':undefined} onClick={()=>onSelect(r)}>{r.name}</button>
    <small>{planArea(roomPlan(r.dimensions).inner).toFixed(2)} m² · {r.dimensions.height} m high</small>
    <div><button aria-label={`Rename ${r.name}`} onClick={()=>{const name=window.prompt('Room name',r.name)?.trim();if(name&&name.length<=80)onChange({...r,name});}}>Rename</button>
    <button aria-label={`Duplicate ${r.name}`} disabled={rooms.length>=30} onClick={()=>onDuplicate(r)}>Copy</button>
    <button aria-label={`Toggle visibility of ${r.name}`} aria-pressed={r.visible!==false} onClick={()=>onChange({...r,visible:r.visible===false})}>{r.visible===false?'Show':'Hide'}</button>
    <button aria-label={`Delete ${r.name}`} disabled={rooms.length===1} onClick={()=>{if(window.confirm(`Delete ${r.name} and all its contents?`))onRemove(r);}}>Delete</button></div>
  </li>)}</ul>;
}
