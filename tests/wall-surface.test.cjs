const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
require('ts-node').register({ project: path.join(__dirname, '../apps/api/tsconfig.json') });
const { roomPlan, roomWallIds, pointAlongWall } = require('../packages/studio/model.ts');
const { WALL_SURFACES, isolateWall, wallSurfaceFrame, wallLocalToWorld, worldToWallLocal, wallPointIsPaintable } = require('../packages/studio/wall-surface.ts');

const rectangle = { length: 6, width: 4, height: 3, wallThickness: { north: 0.3, east: 0.2, west: 0.1 } };
const outline = coordinates => coordinates.map(([x, z], i) => ({ x, z, wallId: `wall-${i}`, thickness: i % 2 ? 0.2 : 0.3 }));
const shapes = [rectangle, { ...rectangle, southLength: 7, westLength: 5 },
  { length: 6, width: 5, height: 2.8, outline: outline([[0, 0], [6, 0], [6, 2], [3, 2], [3, 5], [0, 5]]) },
  { length: 6, width: 5, height: 4, outline: outline([[0, 0], [3, 0], [6, 0], [5, 4], [0, 5]]) }];
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const nearPoint = (actual, expected) => Object.keys(expected).forEach(key => near(actual[key], expected[key]));
const makeRoom = dimensions => ({ id: 'room', name: 'Room', dimensions,
  walls: Object.fromEntries(roomWallIds(dimensions).map(id => [id, { color: '#aabbcc', finish: 'Satin' }])),
  daylight: 'Afternoon', openings: [], furniture: [], lights: [], options: [] });
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

test('wall-local coordinates round-trip every surface of rectangular, skewed, concave and collinear outlines', () => {
  for (const dimensions of shapes) for (const id of roomWallIds(dimensions)) for (const surface of WALL_SURFACES) {
    const frame = wallSurfaceFrame(dimensions, id, surface);
    for (const point of [{ u: 0, v: 0, depth: 0 }, { u: frame.width, v: frame.height, depth: 0 },
      { u: frame.width * 0.37, v: 1.2, depth: 0.23 }, { u: -0.5, v: -1, depth: -0.4 }]) {
      nearPoint(worldToWallLocal(frame, wallLocalToWorld(frame, point)), point);
    }
    const edge = roomPlan(dimensions).walls[id];
    const start = surface === 'Interior' ? edge.start : edge.outerEnd;
    const end = surface === 'Interior' ? edge.end : edge.outerStart;
    nearPoint(wallLocalToWorld(frame, { u: 0, v: 0, depth: 0 }), { x: start.x, z: start.z, y: 0 });
    nearPoint(wallLocalToWorld(frame, { u: frame.width, v: 2, depth: 0 }), { x: end.x, z: end.z, y: 2 });
    near(frame.horizontal.x * frame.normal.x + frame.horizontal.z * frame.normal.z, 0);
  }
});

test('exterior dimensions include actual corner joins and reverse horizontal viewing direction', () => {
  const inside = wallSurfaceFrame(rectangle, 'north', 'Interior');
  const outside = wallSurfaceFrame(rectangle, 'north', 'Exterior');
  near(inside.width, 6);
  near(outside.width, 6.3);
  near(outside.origin.z, -2.3);
  near(outside.origin.x, 3.2);
  nearPoint(outside.horizontal, { x: -1, z: 0 });
  nearPoint(outside.normal, { x: 0, z: -1 });
  assert.throws(() => wallSurfaceFrame(rectangle, 'wall-missing', 'Interior'), /Unknown wall/);
});

test('isolation retains source identity, room relationships, openings and all project data', () => {
  for (const dimensions of shapes) {
    const room = makeRoom(dimensions);
    room.openings = roomWallIds(dimensions).map((wall, i) => ({ id: `opening-${i}`, wall, kind: i % 2 ? 'Window' : 'Door',
      offset: 0, width: 0.7, height: 1.5, sill: i % 2 ? 0.8 : 0, openAngle: 30 }));
    const project = freeze({ name: 'Home', rooms: [room] });
    const before = JSON.stringify(project);
    for (const id of roomWallIds(dimensions)) for (const surface of WALL_SURFACES) {
      const wall = isolateWall(room, id, surface);
      assert.equal(wall.room, room);
      assert.equal(wall.paint, room.walls[id]);
      assert.equal(wall.frame.wall, roomPlan(dimensions).walls[id]);
      assert.equal(wall.openings.length, 1);
      assert.equal(wall.openings[0], room.openings.find(o => o.wall === id));
      assert.equal(wall.apertures[0].opening, wall.openings[0]);
    }
    assert.equal(JSON.stringify(project), before);
  }
});

test('off-center openings project through thickness onto either face and retain sill heights', () => {
  for (const dimensions of shapes) for (const id of roomWallIds(dimensions)) {
    const room = makeRoom(dimensions);
    const opening = { id: 'window', kind: 'Window', wall: id, offset: 0.25, width: 0.8, height: 1.2, sill: 0.7 };
    room.openings.push(opening);
    for (const surface of WALL_SURFACES) {
      const wall = isolateWall(room, id, surface);
      const aperture = wall.apertures[0];
      near(aperture.width, opening.width);
      const point = wallLocalToWorld(wall.frame, { u: aperture.u + aperture.width / 2, v: aperture.v, depth: 0 });
      const expected = pointAlongWall(wall.frame.wall, opening.offset, surface === 'Exterior' ? wall.frame.wall.thickness : 0);
      nearPoint(point, { ...expected, y: opening.sill });
      near(wall.netArea, wall.frame.width * dimensions.height - opening.width * opening.height);
    }
  }
});

test('surface placement excludes apertures, non-finite points, depth and out-of-bounds locations', () => {
  const room = makeRoom(rectangle);
  room.openings.push({ id: 'door', kind: 'Door', wall: 'north', offset: 1, width: 1, height: 2, sill: 0 });
  for (const surface of WALL_SURFACES) {
    const wall = isolateWall(room, 'north', surface);
    const opening = wall.apertures[0];
    assert.equal(wallPointIsPaintable(wall, { u: opening.u + 0.5, v: 1, depth: 0 }), false);
    assert.equal(wallPointIsPaintable(wall, { u: opening.u + 0.5, v: 2.5, depth: 0 }), true);
    for (const point of [{ u: -0.1, v: 1, depth: 0 }, { u: 1, v: 3.1, depth: 0 },
      { u: 0.1, v: 1, depth: 0.2 }, { u: NaN, v: 1, depth: 0 }, { u: 1, v: Infinity, depth: 0 }]) {
      assert.equal(wallPointIsPaintable(wall, point), false);
    }
  }
});
