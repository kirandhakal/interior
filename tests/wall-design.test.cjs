const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
require('ts-node').register({ project: path.join(__dirname, '../apps/api/tsconfig.json') });
require('reflect-metadata');
const { ValidationPipe } = require('@nestjs/common');
const { CreateProjectDto } = require('../apps/api/src/projects/project.dto.ts');
const { ProjectModule } = require('../apps/api/src/projects/projects.ts');
const { roomWallIds } = require('../packages/studio/model.ts');
const { isolateWall } = require('../packages/studio/wall-surface.ts');
const { resizeRoom } = require('../packages/studio/resize-room.ts');
const { applyRoomOutline } = require('../packages/studio/room-outline.ts');
const { WALL_ITEM_KINDS, MAX_WALL_ITEMS, getWallDesign, setWallDesign, wallDesignsError, wallItemError,
  wallItemContains, resizeWallItem, copyWallDesign, placeWallItem, wallPaintPolygons } = require('../packages/studio/wall-design.ts');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const room = (id = 'room', length = 6, height = 3) => ({ id, name: id, dimensions: { length, width: 4, height },
  walls: Object.fromEntries(['north', 'east', 'south', 'west'].map(id => [id, { color: '#aabbcc', finish: 'Matte' }])),
  daylight: 'Afternoon', openings: [], furniture: [], lights: [], options: [] });
const item = changes => ({ id: 'art', name: 'Art', kind: 'Wall art', u: 1, v: 0.8, width: 0.8, height: 0.7,
  depth: 0.03, rotation: 0, color: '#998877', finish: 'Matte', ...changes });
const design = items => ({ wall: 'north', surface: 'Interior', items });

test('surface paint is independent and interior paint remains compatible with legacy palette and comparisons', () => {
  const source = room();
  const before = JSON.stringify(source);
  const painted = setWallDesign(source, { ...design([]), paint: { color: '#112233', finish: 'Satin' } });
  assert.equal(painted.walls.north.color, '#112233');
  assert.equal(isolateWall(painted, 'north', 'Interior').paint.color, '#112233');
  assert.equal(isolateWall(painted, 'north', 'Exterior').paint.color, '#aabbcc');
  const exterior = setWallDesign(painted, { wall: 'north', surface: 'Exterior', paint: { color: '#abcdef', finish: 'Matte' }, items: [] });
  assert.equal(isolateWall(exterior, 'north', 'Interior').paint.color, '#112233');
  assert.equal(isolateWall(exterior, 'north', 'Exterior').paint.color, '#abcdef');
  assert.equal(JSON.stringify(source), before);
  assert.equal(painted.dimensions, source.dimensions);
  assert.equal(painted.openings, source.openings);
});

test('items fit both faces of rectangular and concave walls; rotated bounds and openings are checked', () => {
  const original = room();
  original.openings.push({ id: 'window', kind: 'Window', wall: 'north', offset: 0, width: 1.5, height: 1.2, sill: 0.8 });
  for (const kind of WALL_ITEM_KINDS) for (const surface of ['Interior', 'Exterior']) {
    const placed = placeWallItem(original, 'north', surface, kind, kind.replaceAll(' ', '-'));
    assert.ok(placed);
    assert.equal(wallItemError(original, 'north', surface, placed), undefined);
  }
  assert.match(wallItemError(original, 'north', 'Interior', item({ u: 2.5, v: 1 })), /overlaps/);
  assert.match(wallItemError(original, 'north', 'Interior', item({ u: 0, v: 0, rotation: 45 })), /past the wall/);
  assert.match(wallItemError(original, 'north', 'Interior', item({ width: NaN })), /valid/);
  const points = [[0, 0], [6, 0], [6, 2], [3, 2], [3, 5], [0, 5]].map(([x, z], i) => ({ x, z, wallId: `wall-${i}` }));
  const custom = { ...room('custom'), dimensions: { length: 6, width: 5, height: 3, outline: points },
    walls: Object.fromEntries(points.map(p => [p.wallId, { color: '#aabbcc', finish: 'Matte' }])) };
  for (const id of roomWallIds(custom.dimensions)) {
    const placed = placeWallItem(custom, id, 'Exterior', 'Mirror', 'mirror');
    assert.ok(placed);
    assert.equal(wallItemError(custom, id, 'Exterior', placed), undefined);
  }
});

test('rotated hit testing and resizing preserve the opposite corner in wall-local coordinates', () => {
  const value = item({ u: 1, v: 1, width: 2, height: 1, rotation: 90 });
  assert.equal(wallItemContains(value, { u: 2, v: 2.4 }), true);
  assert.equal(wallItemContains(value, { u: 2.9, v: 1.5 }), false);
  const resized = resizeWallItem(value, { u: 0.5, v: 3.5 });
  near(resized.width, 3); near(resized.height, 2);
  near(resized.u, 0); near(resized.v, 1);
  assert.equal(resized.rotation, 90);
});

test('new mounted items prefer free space and paint layers remain below mounted objects', () => {
  const original = setWallDesign(room(), design([item({ u: 2.6, v: 1.15 })]));
  const mirror = placeWallItem(original, 'north', 'Interior', 'Mirror', 'mirror');
  assert.ok(mirror);
  assert.equal(wallItemContains(original.wallDesigns[0].items[0], { u: mirror.u + mirror.width / 2, v: mirror.v + mirror.height / 2 }), false);
  const updated = setWallDesign(original, design([item({}), item({ id: 'paint', kind: 'Paint section' }), mirror]));
  assert.equal(getWallDesign(updated, 'north', 'Interior').items[0].kind, 'Paint section');
});

test('paint sections wrap around openings with disjoint clipped polygons, including rotated and edge-touching cuts', () => {
  const area = polygons => polygons.reduce((total, polygon) => total + Math.abs(polygon.reduce((sum, p, i) => {
    const q = polygon[(i + 1) % polygon.length]; return sum + p.u * q.v - q.u * p.v;
  }, 0)) / 2, 0);
  const patch = item({ kind: 'Paint section', u: 0, v: 0, width: 6, height: 3 });
  near(area(wallPaintPolygons(patch, [{ u: 1, v: 0, width: 1, height: 2 }, { u: 4, v: 1, width: 1, height: 1 }])), 15);
  near(area(wallPaintPolygons(patch, [{ u: 6, v: 0, width: 1, height: 2 }])), 18);
  near(area(wallPaintPolygons(patch, [{ u: 0, v: 0, width: 6, height: 3 }])), 0);
  const rotated = item({ kind: 'Paint section', u: 1, v: 1, width: 1, height: 1, rotation: 45 });
  near(area(wallPaintPolygons(rotated, [{ u: 1.5, v: 0, width: 5, height: 5 }])), 0.5);
  const original = room();
  original.openings.push({ id: 'door', kind: 'Door', wall: 'north', width: 1, height: 2, offset: 0, sill: 0 });
  assert.equal(wallItemError(original, 'north', 'Interior', patch), undefined);
});

test('copy scales uniformly, creates independent IDs and preserves destination geometry and openings', () => {
  const original = setWallDesign(room('source'), design([item({ u: 3, v: 1, width: 2, height: 1 })]));
  const target = room('target', 3, 2);
  const before = JSON.stringify([original, target]);
  assert.ok('error' in copyWallDesign(original, 'north', 'Interior', target, 'north', 'Interior', 'Actual size', 'Replace', () => 'copy'));
  const result = copyWallDesign(original, 'north', 'Interior', target, 'north', 'Interior', 'Scale to fit', 'Replace', () => 'copy');
  assert.ok(result.room);
  const copied = getWallDesign(result.room, 'north', 'Interior').items[0];
  near(copied.u, 1.5); near(copied.v, 0.5); near(copied.width, 1); near(copied.height, 0.5);
  assert.equal(copied.id, 'copy'); assert.notEqual(copied, original.wallDesigns[0].items[0]);
  assert.equal(result.room.dimensions, target.dimensions); assert.equal(result.room.openings, target.openings);
  assert.equal(JSON.stringify([original, target]), before);
  const obstructed = { ...target, openings: [{ id: 'door', kind: 'Door', wall: 'north', width: 1, height: 1.8, offset: 0.5, sill: 0 }] };
  assert.match(copyWallDesign(original, 'north', 'Interior', obstructed, 'north', 'Interior', 'Scale to fit', 'Replace', () => 'copy').error, /overlaps/);
  assert.match(copyWallDesign(original, 'north', 'Interior', original, 'north', 'Interior', 'Actual size', 'Replace', () => 'copy').error, /different wall/);
});

test('copy merge and replace have explicit atomic semantics and enforce item limits', () => {
  const source = setWallDesign(room('source'), design([item({ id: 'first' })]));
  const target = setWallDesign(room('target'), design([item({ id: 'existing' })]));
  for (const [mode, count] of [['Merge', 2], ['Replace', 1]]) {
    const result = copyWallDesign(source, 'north', 'Interior', target, 'north', 'Interior', 'Actual size', mode, () => 'copy');
    assert.equal(getWallDesign(result.room, 'north', 'Interior').items.length, count);
  }
  const full = setWallDesign(room('target'), design(Array.from({ length: MAX_WALL_ITEMS }, (_, i) => item({ id: `item-${i}` }))));
  assert.match(copyWallDesign(source, 'north', 'Interior', full, 'north', 'Interior', 'Actual size', 'Merge', () => 'copy').error, /up to/);
  assert.match(wallDesignsError({ ...target, wallDesigns: [design([item({}), item({})])] }), /unique/);
  assert.match(wallDesignsError({ ...target, wallDesigns: [design([]), design([])] }), /only one/);
});

test('room resizing and wall removal cannot silently strand or delete wall designs', () => {
  const source = setWallDesign(room(), design([item({ u: 4, v: 2 })]));
  assert.equal(resizeRoom(source, source.name, { ...source.dimensions, length: 3 }), undefined);
  const points = [[0, 0], [6, 0], [6, 4], [0, 4]].map(([x, z], i) => ({ x, z, wallId: `wall-new-${i}` }));
  assert.ok('error' in applyRoomOutline(source, source.name, 3, points));
  assert.equal(source.wallDesigns[0].items.length, 1);
});

test('API accepts and round-trips designs and rejects malformed or invalid wall placements before storage', async () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const document = { id: 'a7d2602b-44f1-4406-a2bf-c387df49221d', name: 'Home', rooms: [setWallDesign(room(), design([item({})]))] };
  const validate = value => pipe.transform(value, { type: 'body', metatype: CreateProjectDto });
  const valid = await validate(document);
  assert.deepEqual(JSON.parse(JSON.stringify(valid.rooms[0].wallDesigns)), document.rooms[0].wallDesigns);
  for (const changes of [{ width: 0 }, { depth: Infinity }, { rotation: -1 }, { color: 'red' }, { kind: 'Unknown' }, { extra: 1 }]) {
    const invalid = structuredClone(document); invalid.rooms[0].wallDesigns[0].items[0] = item(changes);
    await assert.rejects(validate(invalid), { status: 400 });
  }
  const [Service] = Reflect.getMetadata('providers', ProjectModule);
  const service = new Service({ createQueryBuilder() { throw new Error('Storage reached'); } });
  await assert.rejects(service.create('account', valid), /Storage reached/);
  for (const invalidDesign of [{ ...design([]), wall: 'wall-missing' }, design([item({ u: 20 })]), design([item({}), item({})])]) {
    const invalid = structuredClone(document); invalid.rooms[0].wallDesigns = [invalidDesign];
    await assert.rejects(service.create('account', await validate(invalid)), { status: 400 });
  }
});

test('polygon regions validate simple boundaries, triangulate concavity and persist materials', async () => {
  const {validPaintPolygon,paintPreset}=require('../packages/studio/wall-design.ts');
  const polygon=[{u:0,v:0},{u:1,v:0},{u:1,v:0.4},{u:0.4,v:0.4},{u:0.4,v:1},{u:0,v:1}];
  assert.equal(validPaintPolygon(polygon),true);
  assert.equal(validPaintPolygon([{u:0,v:0},{u:1,v:1},{u:0,v:1},{u:1,v:0}]),false);
  const region=item({kind:'Paint section',u:0,v:0,width:2,height:2,polygon,finish:'Gloss',texture:'Linen',material:'Metallic'});
  const pieces=wallPaintPolygons(region,[]);
  const area=pieces.reduce((sum,p)=>sum+Math.abs(p.reduce((s,a,i)=>s+a.u*p[(i+1)%p.length].v-p[(i+1)%p.length].u*a.v,0))/2,0);
  near(area,2.56);
  assert.equal(wallItemContains(region,{u:1.8,v:1.8}),false);
  assert.equal(wallItemContains(region,{u:0.2,v:1.8}),true);
  let n=0;
  for(const preset of ['Horizontal','Vertical','Diagonal','Stripes','Checkerboard']) {
    const items=paintPreset(6,3,preset,0.35,()=>`p${n++}`);
    assert.equal(wallDesignsError(setWallDesign(room(),design(items))),undefined);
  }
  const pipe=new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true});
  const doc={id:'a7d2602b-44f1-4406-a2bf-c387df49221d',name:'Paint',rooms:[setWallDesign(room(),design([region]))]};
  const result=await pipe.transform(JSON.parse(JSON.stringify(doc)),{type:'body',metatype:CreateProjectDto});
  assert.deepEqual(JSON.parse(JSON.stringify(result.rooms[0].wallDesigns)),doc.rooms[0].wallDesigns);
});
