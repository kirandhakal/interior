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
