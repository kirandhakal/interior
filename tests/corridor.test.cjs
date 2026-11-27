const assert=require('node:assert/strict');
const test=require('node:test');
require('ts-node').register({project:require('node:path').join(__dirname,'../apps/api/tsconfig.json')});
const {corridorFromPath,generateCorridors,connectCorridor}=require('../packages/studio/corridor.ts');
const {layoutError,connectionError,footprint}=require('../packages/studio/house.ts');
const {planArea,polygonError}=require('../packages/studio/polygon.ts');
const room=(id,x,z=0)=>({id,name:id,dimensions:{length:4,width:3,height:2.6},placement:{x,z,rotation:0},walls:Object.fromEntries(['north','east','south','west'].map(w=>[w,{color:'#abcdef',finish:'Matte'}])),openings:[],furniture:[],lights:[],options:[],daylight:'Afternoon'});
const settings={width:1.2,height:2.6,thickness:.16};
const path=coords=>coords.map(([x,z])=>({x,z}));
test('constant-width straight, angled, L, U and multi-segment paths are valid',()=>{
 for(const points of [[[0,0],[4,0]],[[0,0],[4,4]],[[0,0],[4,0],[4,4]],[[0,0],[4,0],[4,4],[0,4]],[[0,0],[4,0],[4,4],[8,4],[8,8]]]) {
  const r=corridorFromPath(path(points),settings);
  assert.equal(polygonError(r.dimensions.outline),undefined);
  assert.equal(r.spaceType,'Corridor');assert.equal(r.dimensions.outline[0].thickness,.16);
 }
 assert.ok(Math.abs(planArea(footprint(corridorFromPath(path([[0,0],[4,0]]),settings)))-4.8)<1e-8);
 assert.throws(()=>corridorFromPath(path([[0,0],[4,0],[0,0]]),settings),/sharp/);
 assert.throws(()=>corridorFromPath(path([[0,0],[4,0]]),{...settings,width:.4}),/width/);
});
test('generated corridor preserves rooms and pairs persistent door IDs',()=>{
 const rooms=[room('living',0),room('bedroom',8)], before=structuredClone(rooms);
 const proposals=generateCorridors(rooms,rooms.map(r=>r.id),settings);
 assert.ok(proposals.length>0);
 for(const p of proposals) {
  assert.equal(layoutError(p.rooms),undefined);assert.equal(connectionError(p.rooms),undefined);
  assert.equal(p.corridor.openings.length,2);
  const restored=JSON.parse(JSON.stringify(p.rooms));assert.equal(connectionError(restored),undefined);
  for(let i=0;i<2;i++) {assert.deepEqual(restored[i].placement,before[i].placement);assert.deepEqual(restored[i].dimensions,before[i].dimensions);assert.deepEqual(restored[i].walls,before[i].walls);}
 }
 assert.deepEqual(rooms,before);
});
test('one corridor connects three rooms through its ends and side',()=>{
 const rooms=[room('left',0),room('right',12),room('side',6,2.1)];
 const p=generateCorridors(rooms,rooms.map(r=>r.id),settings)[0];
 assert.equal(p.corridor.openings.length,3);assert.equal(connectionError(p.rooms),undefined);assert.equal(layoutError(p.rooms),undefined);
});
test('obstacle detours are collision-free and impossible connections fail without mutations',()=>{
 const rooms=[room('left',0),room('right',12),room('obstacle',6)];
 const p=generateCorridors(rooms,['left','right'],settings)[0];
 assert.equal(layoutError(p.rooms),undefined);assert.equal(p.corridor.openings.length,2);
 const before=structuredClone(rooms);
 assert.throws(()=>connectCorridor(rooms,corridorFromPath(path([[2,0],[10,0]]),settings),['left','right']),/overlaps/);
 assert.deepEqual(rooms,before);
 assert.throws(()=>generateCorridors([room('a',0),room('b',0)],['a','b'],settings),/No clear/);
});
require('reflect-metadata');
const {ValidationPipe}=require('@nestjs/common');
const {CreateProjectDto}=require('../apps/api/src/projects/project.dto.ts');
test('API round trip retains passage connections and independent floor finishes',async()=>{
 const originals=[room('a',0),room('b',8)];
 const p=generateCorridors(originals,['a','b'],{...settings,openingKind:'Passage'})[0];
 p.corridor.floorColor='#123456';p.corridor.floorMaterial='Tile';
 const value={id:'83ea1736-c7a5-49e0-a3ea-c46757345ad0',name:'House',rooms:p.rooms};
 const pipe=new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true});
 const restored=await pipe.transform(JSON.parse(JSON.stringify(value)),{type:'body',metatype:CreateProjectDto});
 const hall=restored.rooms.find(r=>r.spaceType==='Corridor');
 assert.equal(hall.floorColor,'#123456');assert.equal(hall.floorMaterial,'Tile');
 assert.ok(hall.openings.every(o=>o.kind==='Passage'));assert.equal(connectionError(restored.rooms),undefined);
 await assert.rejects(()=>pipe.transform({...value,rooms:[{...originals[0],floorColor:'bad'}]},{type:'body',metatype:CreateProjectDto}));
});
