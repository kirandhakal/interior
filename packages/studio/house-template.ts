import { WALL_DEFAULT, roomWallIds, type Room } from './model';
import { connectRooms, physicalWalls } from './house';

/** Five-room starter with four doors linking the central hallway. */
export function exampleHouse(): Room[] {
  const definitions = [
    { name: 'Living room', length: 6.5, width: 4, x: 3.25, z: 2 },
    { name: 'Bedroom', length: 5.5, width: 4, x: 9.25, z: 2 },
    { name: 'Kitchen', length: 4.5, width: 4, x: 2.25, z: 6 },
    { name: 'Hallway', length: 3.5, width: 4, x: 6.25, z: 6 },
    { name: 'Bathroom', length: 4, width: 4, x: 10, z: 6 },
  ];
  let rooms: Room[] = definitions.map(({ name, length, width, x, z }) => {
    const dimensions = { length, width, height: 2.6 };
    return { id: crypto.randomUUID(), name, dimensions, placement: { x, z, rotation: 0 },
      walls: Object.fromEntries(roomWallIds(dimensions).map(wall => [wall, { color: WALL_DEFAULT, finish: 'Matte' as const }])),
      daylight: 'Afternoon', openings: [], furniture: [], lights: [], options: [] };
  });
  const hallway = rooms[3].id;
  for (const neighbour of rooms.filter(room => room.id !== hallway)) {
    const segment = physicalWalls(rooms).find(s => s.sides.length === 2 && s.sides.some(side => side.room.id === hallway) && s.sides.some(side => side.room.id === neighbour.id));
    if (!segment) throw new Error('The starter layout is missing a shared wall.');
    const connected = connectRooms(segment);
    rooms = rooms.map(room => connected.find(next => next.id === room.id) ?? room);
  }
  return rooms;
}
