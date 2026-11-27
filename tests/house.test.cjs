const assert = require('node:assert/strict');
const test = require('node:test');
require('ts-node').register({project:require('node:path').join(__dirname,'../apps/api/tsconfig.json')});
const {physicalWalls,overlaps,arrangeLegacy,totalArea,connectRooms,snapRoom}=require('../packages/studio/house.ts');
const room=(id,x=0,z=0,rotation=0)=>({id,name:id,dimensions:{length:4,width:3,height:2.6},placement:{x,z,rotation},walls:Object.fromEntries(['north','east','south','west'].map(w=>[w,{color:'#abcdef',finish:'Matte'}])),openings:[],furniture:[],lights:[],options:[],daylight:'Afternoon'});
test('rooms overlap strictly, with touching boundaries permitted',()=>{
 assert.equal(overlaps(room('a'),room('b',4)),false);
 assert.equal(overlaps(room('a'),room('b',3.99)),true);
 assert.equal(overlaps(room('a'),room('b')),true);
 assert.equal(overlaps(room('a'),room('b',0,0,90)),true);
 const stripe=room('stripe');stripe.dimensions.length=2;assert.equal(overlaps(room('a'),stripe),true);
});
test('legacy placement separates rooms and preserves area',()=>{
 const a=room('a'),b=room('b');delete a.placement;delete b.placement;
 const rooms=arrangeLegacy([a,b]);assert.equal(overlaps(...rooms),false);assert.equal(totalArea(rooms),24);assert.equal(a.placement,undefined);
});
test('partial adjacency splits into a single wall with independent paint surfaces',()=>{
 const a=room('a'),b=room('b',4,1);b.walls.west.color='#123456';
 const walls=physicalWalls([a,b]);const shared=walls.filter(w=>w.sides.length===2);
 assert.equal(shared.length,1);assert.equal(Math.hypot(shared[0].end.x-shared[0].start.x,shared[0].end.z-shared[0].start.z),2);
 const next=connectRooms(shared[0]);assert.ok(next.every(r=>r.openings.length===1));assert.equal(a.openings.length,0);assert.equal(next[1].walls.west.color,'#123456');
 assert.throws(()=>connectRooms(physicalWalls(next).find(w=>w.sides.length===2)),/conflicts/);
});
test('snapping aligns wall and avoids overlap',()=>{
 const a=room('a'),b=room('b',4.15);const next=snapRoom(b,[a]);assert.ok(Math.abs(next.placement.x-4)<1e-6);assert.equal(overlaps(a,next),false);
});
test('cloned decorations and paints are independent',()=>{
 const a=room('a'),b=structuredClone(a);b.id='b';b.walls.north.color='#000000';assert.equal(a.walls.north.color,'#abcdef');
});
require('reflect-metadata');
const {ValidationPipe}=require('@nestjs/common');
const {CreateProjectDto}=require('../apps/api/src/projects/project.dto.ts');
test('API accepts and retains placement and visibility, rejects invalid placement',async()=>{
 const pipe=new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true});
 const value={id:'83ea1736-c7a5-49e0-a3ea-c46757345ad0',name:'House',rooms:[{...room('a',12,7,90),visible:false}]};
 const saved=await pipe.transform(value,{type:'body',metatype:CreateProjectDto});
 assert.deepEqual({...saved.rooms[0].placement},{x:12,z:7,rotation:90});assert.equal(saved.rooms[0].visible,false);
 await assert.rejects(()=>pipe.transform({...value,rooms:[{...room('a'),placement:{x:Infinity,z:0,rotation:0}}]},{type:'body',metatype:CreateProjectDto}));
});
const {updateHouseRoom,connectionError}=require('../packages/studio/house.ts');
test('connected doorway edits and deletion synchronize atomically',()=>{
 const connected=connectRooms(physicalWalls([room('a'),room('b',4)]).find(s=>s.sides.length===2));
 assert.equal(connectionError(connected),undefined);
 const changed={...connected[0],openings:connected[0].openings.map(o=>({...o,width:1,offset:o.offset+.1,openAngle:45}))};
 const updated=updateHouseRoom(connected,changed);
 assert.equal(updated[1].openings[0].width,1);assert.equal(updated[1].openings[0].openAngle,45);
 assert.equal(connectionError(updated),undefined);assert.equal(connected[1].openings[0].width,.9);
 const removed=updateHouseRoom(updated,{...updated[0],openings:[]});assert.equal(removed[1].openings.length,0);
});
test('connected room moves and adjacent decoration conflicts are rejected',()=>{
 const connected=connectRooms(physicalWalls([room('a'),room('b',4)]).find(s=>s.sides.length===2));
 assert.throws(()=>updateHouseRoom(connected,{...connected[0],placement:{x:-1,z:0,rotation:0}}),/disconnect/);
 const invalid={...connected[0],openings:connected[0].openings.map(o=>({...o,width:8}))};
 assert.throws(()=>updateHouseRoom(connected,invalid),/conflicts/);
});
test('five-room example matches the hallway layout with four connected doors',()=>{
 const {exampleHouse}=require('../packages/studio/house-template.ts');
 const rooms=exampleHouse();
 assert.equal(rooms.length,5);assert.equal(new Set(rooms.map(r=>r.id)).size,5);
 assert.equal(require('../packages/studio/house.ts').layoutError(rooms),undefined);
 assert.equal(connectionError(rooms),undefined);assert.equal(totalArea(rooms),96);
 assert.equal(rooms.find(r=>r.name==='Hallway').openings.length,4);
 assert.equal(rooms.flatMap(r=>r.openings).length,8);
 assert.notEqual(exampleHouse()[0].id,rooms[0].id);
});
test('open passages and balconies reserve space without enclosing walls',()=>{
 const {isOpenSpace}=require('../packages/studio/house.ts');
 for(const spaceType of ['Passage','Balcony','Open space']) {
  const open={...room('open',4),spaceType};
  assert.equal(isOpenSpace(open),true);
  assert.equal(physicalWalls([open]).length,0);
  assert.equal(totalArea([open]),12);
  assert.equal(overlaps(room('a'),{...open,placement:{x:1,z:0,rotation:0}}),true);
  assert.equal(physicalWalls([room('a'),open]).filter(s=>s.sides.length===2).length,0);
 }
 assert.equal(physicalWalls([{...room('hall'),spaceType:'Corridor'}]).length,4);
});
test('API preserves space categories and rejects unknown categories',async()=>{
 const pipe=new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true});
 const value={id:'83ea1736-c7a5-49e0-a3ea-c46757345ad0',name:'House',rooms:[{...room('a'),spaceType:'Balcony'}]};
 const saved=await pipe.transform(value,{type:'body',metatype:CreateProjectDto});
 assert.equal(saved.rooms[0].spaceType,'Balcony');
 await assert.rejects(()=>pipe.transform({...value,rooms:[{...room('a'),spaceType:'invalid'}]},{type:'body',metatype:CreateProjectDto}));
});
test('attachments align to rotated walls, connect doors and reject occupied space',()=>{
 const {attachSpace,connectionError,layoutError,removeHouseSpace}=require('../packages/studio/house.ts');
 for(const rotation of [0,90,37]) for(const wall of ['north','east','south','west']) {
  const host=room('host',0,0,rotation), bath={...room('bath'),spaceType:'Bathroom',dimensions:{length:2.4,width:2,height:2.6}};
  const attached=attachSpace([host],host,bath,wall,true);
  assert.equal(attached.length,2);assert.equal(layoutError(attached),undefined);assert.equal(connectionError(attached),undefined);
  assert.equal(attached[0].openings.length,1);assert.equal(attached[1].openings.length,1);
  assert.throws(()=>attachSpace(attached,attached[0],{...bath,id:'other'},wall),/overlaps/);
  const removed=removeHouseSpace(attached,'bath');assert.equal(removed.length,1);assert.equal(removed[0].openings.length,0);
 }
});
test('balcony attachments add an access door without enclosing the balcony',()=>{
 const {attachSpace,connectionError}=require('../packages/studio/house.ts');
 const host=room('host');const balcony={...room('balcony'),spaceType:'Balcony',dimensions:{length:4,width:1.5,height:2.6}};
 const result=attachSpace([host],host,balcony,'north',true);
 assert.equal(result[0].openings.length,1);assert.equal(result[1].openings.length,0);
 assert.equal(physicalWalls(result).length,4);assert.equal(connectionError(result),undefined);
});
