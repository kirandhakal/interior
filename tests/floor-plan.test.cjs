const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
require('ts-node').register({ project: path.join(__dirname, '../apps/api/tsconfig.json') });
require('reflect-metadata');

const { ValidationPipe } = require('@nestjs/common');
const { CreateProjectDto } = require('../apps/api/src/projects/project.dto.ts');
const { ProjectModule } = require('../apps/api/src/projects/projects.ts');
const { WALLS, dimensionError, furniturePlacementFits, pointAlongWall, roomContains, roomMeasurements, roomPlan } = require('../packages/studio/model.ts');
const { applyRoomOutline, clockwiseOutline, editableOutline } = require('../packages/studio/room-outline.ts');
const { planArea, planPerimeter, pointDistance, polygonError, segmentsIntersect, signedPlanArea, snapPlanPoint, wallEndpoint, wallHeading } = require('../packages/studio/polygon.ts');

const rectangle = { length: 6, width: 4, height: 3 };
const points = coordinates => coordinates.map(([x, z], index) => ({ x, z, wallId: `wall-${index + 1}` }));
const lShape = points([[0, 0], [6, 0], [6, 2], [3, 2], [3, 5], [0, 5]]);
const uShape = points([[0, 0], [2, 0], [2, 3], [4, 3], [4, 0], [6, 0], [6, 5], [0, 5]]);
const legacyRoom = () => ({ id: 'living-room', name: 'Living room', dimensions: rectangle, daylight: 'Afternoon',
  walls: Object.fromEntries(WALLS.map(wall => [wall, { color: '#DADDCC', finish: 'Matte' }])),
  openings: [], lights: [], furniture: [], options: [] });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);

test('validates open paths and closing edges and rejects intersections, overlaps, and degeneracy', () => {
  const open = points([[0, 0], [2, 0], [2, 2], [4, 2], [4, 4]]);
  assert.equal(polygonError(open, false), undefined);
  assert.match(polygonError(open), /cross or touch/);
  assert.match(polygonError(points([[0, 0], [2, 2], [0, 2], [2, 0]]), false), /cross or touch/);
  assert.match(polygonError(points([[0, 0], [2, 0], [1, 0], [1, 2]])), /overlap/);
  assert.match(polygonError(points([[0, 0], [2, 0], [0, 0], [0, 2]])), /different positions/);
  assert.match(polygonError(points([[0, 0], [0.01, 0], [1, 1], [0, 1]])), /at least 0.1/);
  assert.match(polygonError(points([[0, 0], [1, 0]])), /at least three/);
  assert.equal(segmentsIntersect(...points([[0, 0], [4, 0], [2, 0], [5, 0]])), true);
  assert.equal(polygonError(points([[0, 0], [2, 0], [4, 0], [4, 2], [0, 2]])), undefined);
});

test('measures concave and angled outlines without filling the cutout', () => {
  for (const [outline, area, perimeter] of [[lShape, 21, 22], [uShape, 24, 28]]) {
    assert.equal(polygonError(outline), undefined);
    assert.equal(planArea(outline), area);
    assert.equal(planPerimeter(outline), perimeter);
    const { room } = applyRoomOutline(legacyRoom(), 'Custom', 3, outline);
    assert.equal(roomPlan(room.dimensions).edges.length, outline.length);
    assert.deepEqual(roomMeasurements(room.dimensions), { floorArea: area, perimeter, wallArea: perimeter * 3, netWallArea: perimeter * 3 });
  }
  const { room } = applyRoomOutline(legacyRoom(), 'Courtyard', 3, uShape);
  assert.equal(roomContains(room.dimensions, { x: 1, z: 1 }), true);
  assert.equal(roomContains(room.dimensions, { x: 3, z: 1 }), false);
  assert.equal(furniturePlacementFits(room.dimensions, { id: 'rug', kind: 'Rug', x: 3, z: 1, rotation: 0 }), false);
  near(planPerimeter(points([[0, 0], [3, 0], [0, 4]])), 12);
  near(planArea(points([[0, 0], [3, 0], [0, 4]])), 6);
});

test('normalizes either drawing direction and keeps wall IDs on their physical edges', () => {
  const counterclockwise = points([[0, 0], [0, 4], [3, 0]]);
  const clockwise = clockwiseOutline(counterclockwise);
  assert.ok(signedPlanArea(clockwise) > 0);
  for (const [i, point] of counterclockwise.entries()) {
    const next = counterclockwise[(i + 1) % counterclockwise.length];
    const startIndex = clockwise.findIndex(vertex => vertex.wallId === point.wallId);
    const end = clockwise[(startIndex + 1) % clockwise.length];
    assert.equal(pointDistance(clockwise[startIndex], next), 0);
    assert.equal(pointDistance(end, point), 0);
  }
});

test('snaps grid positions, headings, and joint distance increments', () => {
  const origin = { x: 0, z: 0 };
  const target = { x: 1.12, z: 0.39 };
  assert.deepEqual(snapPlanPoint(target, 0.25, 0), { x: 1, z: 0.5 });
  const angled = snapPlanPoint(target, 0, 15, origin);
  near(wallHeading(origin, angled), 15);
  near(pointDistance(origin, angled), pointDistance(origin, target));
  const both = snapPlanPoint(target, 0.25, 15, origin);
  near(wallHeading(origin, both), 15);
  near(pointDistance(origin, both), 1.25);
  near(wallHeading(origin, wallEndpoint(origin, 2, 135)), 135);
});

test('preserves legacy rooms and remaps paint, openings, and fixtures when an existing wall is split', () => {
  const original = legacyRoom();
  const outline = editableOutline(rectangle);
  assert.equal(applyRoomOutline(original, original.name, 3, outline).room, original);
  original.openings.push({ id: 'door', kind: 'Door', wall: 'north', width: 0.9, height: 2.1, offset: 1.2, sill: 0 });
  original.lights.push({ id: 'light', kind: 'Wall sconce', mount: 'north', x: 1.4, z: -2, y: 1.4, brightness: 50, warmth: 3300, tilt: 45, direction: 0 });
  original.options.push({ id: 'paint-option', name: 'Green', walls: original.walls });
  const split = [outline[0], { x: 0, z: -2, wallId: 'wall-split' }, ...outline.slice(1)];
  const { room } = applyRoomOutline(original, original.name, 3, split);
  assert.equal(dimensionError(room.dimensions), undefined);
  assert.equal(room.openings[0].wall, 'wall-split');
  near(pointAlongWall(roomPlan(room.dimensions).walls['wall-split'], room.openings[0].offset).x, 1.2);
  assert.equal(room.lights[0].mount, 'wall-split');
  near(room.lights[0].x, 1.4);
  assert.deepEqual(room.walls['wall-split'], original.walls.north);
  assert.deepEqual(room.options[0].walls['wall-split'], original.walls.north);
  assert.match(applyRoomOutline(original, original.name, 3, lShape).error, /still has a door or window/);
});

test('accepts a custom room payload and rejects invalid geometry or mismatched wall keys at the API boundary', async () => {
  const { room } = applyRoomOutline(legacyRoom(), 'Custom', 3, lShape);
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const document = { id: 'a7d2602b-44f1-4406-a2bf-c387df49221d', name: 'Home', rooms: [room] };
  const input = await pipe.transform(document, { type: 'body', metatype: CreateProjectDto });
  assert.deepEqual(JSON.parse(JSON.stringify(input.rooms[0].dimensions.outline)), lShape);
  const [ProjectService] = Reflect.getMetadata('providers', ProjectModule);
  const service = new ProjectService({ createQueryBuilder() { throw new Error('Storage reached'); } });
  await assert.rejects(service.create('account', input), /Storage reached/);
  await assert.rejects(service.create('account', { ...document, rooms: [{ ...room, walls: legacyRoom().walls }] }), /Paint entries must match/);
  const bow = points([[0, 0], [2, 2], [0, 2], [2, 0]]);
  await assert.rejects(service.create('account', { ...document, rooms: [{ ...room, dimensions: { ...room.dimensions, outline: bow } }] }), /cross or touch/);
});
