const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

require('ts-node').register({ project: path.join(__dirname, '../apps/api/tsconfig.json') });
require('reflect-metadata');

const { ValidationPipe } = require('@nestjs/common');
const { CreateProjectDto } = require('../apps/api/src/projects/project.dto.ts');
const {
  WALLS, DEFAULT_WALL_THICKNESS, dimensionError, fitFurniture, fitLight, furniturePlacementFits, openingFits,
  pointAlongWall, roomMeasurements, roomPlan, setRoomDimension, setWallSpan, wallOffset, wallSpan, wallThickness,
} = require('../packages/studio/model.ts');
const { MEASUREMENT_UNITS, fromMeters, toMeters } = require('../packages/studio/measurement.ts');
const { resizeRoom } = require('../packages/studio/resize-room.ts');

const rectangle = { length: 6, width: 4, height: 3 };

function near(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `Expected ${actual} to be close to ${expected}`);
}

function room(dimensions = rectangle) {
  return {
    id: 'legacy-room', name: 'Living room', dimensions, daylight: 'Afternoon',
    walls: Object.fromEntries(WALLS.map(wall => [wall, { color: '#EAE4D8', finish: 'Matte' }])),
    furniture: [], openings: [], lights: [], options: [],
  };
}

test('legacy rectangular geometry and measurements use meter values and default wall thickness', () => {
  assert.equal(dimensionError(rectangle), undefined);
  assert.deepEqual(roomPlan(rectangle).inner, [{ x: -3, z: -2 }, { x: 3, z: -2 }, { x: 3, z: 2 }, { x: -3, z: 2 }]);
  assert.equal(wallThickness(rectangle, 'east'), DEFAULT_WALL_THICKNESS);
  assert.deepEqual(roomMeasurements(rectangle, [{ width: 1, height: 2 }]), { floorArea: 24, perimeter: 20, wallArea: 60, netWallArea: 58 });
});

test('editing any wall length preserves the other three lengths and closes the room', () => {
  for (const selected of WALLS) {
    const dimensions = setWallSpan(rectangle, selected, 5);
    assert.equal(dimensionError(dimensions), undefined);
    const plan = roomPlan(dimensions);
    for (const wall of WALLS) near(plan.walls[wall].span, wall === selected ? 5 : wallSpan(rectangle, wall));
  }

  const trapezoid = setWallSpan(rectangle, 'south', 8);
  near(roomMeasurements(trapezoid).floorArea, 7 * Math.sqrt(15));
  assert.equal(roomMeasurements(trapezoid).perimeter, 22);
  assert.equal(roomMeasurements(trapezoid).wallArea, 66);
  const scaled = setRoomDimension(trapezoid, 'length', 9);
  assert.deepEqual(WALLS.map(wall => wallSpan(scaled, wall)), [9, 4, 12, 4]);
});

test('wall thickness changes the exterior joins and preserves interior area', () => {
  const dimensions = { ...setWallSpan(rectangle, 'east', 5), wallThickness: { north: 0.3, west: 0.1 } };
  assert.equal(dimensionError(dimensions), undefined);
  const { edges, outer } = roomPlan(dimensions);
  for (const [index, wall] of edges.entries()) {
    for (const point of [outer[index], outer[(index + 1) % 4]]) {
      near((point.x - wall.start.x) * wall.normal.x + (point.z - wall.start.z) * wall.normal.z, wall.thickness);
    }
  }
  assert.deepEqual(roomMeasurements(dimensions), roomMeasurements({ ...dimensions, wallThickness: undefined }));
});

test('invalid scalars, impossible rings, and near-flat corners are rejected', () => {
  assert.match(dimensionError({ ...rectangle, length: NaN }), /allowed ranges/);
  assert.match(dimensionError({ ...rectangle, height: 6.1 }), /allowed ranges/);
  assert.match(dimensionError({ ...rectangle, wallThickness: { south: 0 } }), /allowed ranges/);
  assert.match(dimensionError({ length: 18, width: 2, southLength: 2, westLength: 2, height: 3 }), /other three walls/);
  assert.match(dimensionError({ length: 10, width: 3, southLength: 4.1, westLength: 3, height: 3 }), /corners/);
});

test('unit conversion round-trips distances and converts square units with the squared factor', () => {
  for (const unit of MEASUREMENT_UNITS) near(toMeters(fromMeters(7.123456, unit), unit), 7.123456);
  near(toMeters(100, 'cm'), 1);
  near(toMeters(12, 'in'), toMeters(1, 'ft'));
  near(fromMeters(1, 'cm', 2), 10000);
  near(fromMeters(0.3048 ** 2, 'ft', 2), 1);
  near(fromMeters(0.3048 ** 2, 'in', 2), 144);
});

test('resizing preserves fitting objects, repositions crowded openings, and refuses to shrink them', () => {
  const source = room();
  source.furniture.push({ id: 'rug', kind: 'Rug', x: 0.03, z: -0.01, rotation: 0 });
  source.openings = [
    { id: 'right', kind: 'Door', wall: 'north', offset: 2.1, width: 0.9, height: 2.1, sill: 0 },
    { id: 'left', kind: 'Door', wall: 'north', offset: 1.1, width: 0.9, height: 2.1, sill: 0 },
  ];
  const next = resizeRoom(source, source.name, { ...rectangle, length: 3.6 });
  assert.ok(next);
  assert.equal(next.furniture[0], source.furniture[0]);
  assert.equal(next.walls, source.walls);
  assert.ok(next.openings[0].offset > next.openings[1].offset);
  assert.ok(next.openings.every(opening => openingFits(next, opening) && opening.width === 0.9 && opening.height === 2.1));
  assert.equal(source.openings[0].offset, 2.1);
  assert.equal(resizeRoom(source, source.name, { ...rectangle, height: 2 }), undefined);
});

test('mounted lights follow the edited wall and furniture fits the skewed footprint', () => {
  const source = room();
  const mount = 'east';
  const light = { id: 'sconce', kind: 'Wall sconce', mount, x: 3, y: 1.5, z: 0.4, brightness: 60, warmth: 3300, direction: 0, tilt: 55 };
  source.lights.push(light);
  const dimensions = setWallSpan(rectangle, 'south', 7);
  const next = resizeRoom(source, source.name, dimensions);
  const wall = roomPlan(dimensions).walls[mount];
  const repositioned = next.lights[0];
  const expected = pointAlongWall(wall, 0.4);
  near(wallOffset(wall, repositioned), 0.4);
  near(repositioned.x, expected.x);
  near(repositioned.z, expected.z);
  near(fitLight(dimensions, repositioned).y, light.y);

  const chair = { id: 'chair', kind: 'Armchair', x: 10, z: 10, rotation: 20 };
  assert.equal(furniturePlacementFits(dimensions, chair), false);
  assert.equal(furniturePlacementFits(dimensions, fitFurniture(dimensions, chair)), true);
});

test('project DTO accepts legacy and customized rooms and rejects malformed dimension overrides', async () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const project = dimensions => ({ id: 'a7d2602b-44f1-4406-a2bf-c387df49221d', name: 'Home', rooms: [room(dimensions)] });
  const validate = dimensions => pipe.transform(project(dimensions), { type: 'body', metatype: CreateProjectDto });
  assert.deepEqual(JSON.parse(JSON.stringify((await validate(rectangle)).rooms[0].dimensions)), rectangle);
  const customized = { ...rectangle, southLength: 7, westLength: 4.5, wallThickness: { north: 0.25, east: 0.35 } };
  assert.deepEqual(JSON.parse(JSON.stringify((await validate(customized)).rooms[0].dimensions)), customized);
  for (const invalid of [
    { ...rectangle, wallThickness: { south: 0.7 } },
    { ...rectangle, wallThickness: { north: null } },
    { ...rectangle, wallThickness: { diagonal: 0.3 } },
    { ...rectangle, southLength: '7' },
  ]) await assert.rejects(validate(invalid), { status: 400 });
});
