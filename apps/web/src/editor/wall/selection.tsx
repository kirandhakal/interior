'use client';

import { roomWallIds, wallLabel, type Room, type Wall } from '@studio/model';
import { WALL_SURFACES, type WallSurface } from '@studio/wall-surface';
import { Segmented, SelectField } from '@/components/ui';

export function WallSelection({ rooms, room, wall, surface, onRoom, onWall, onSurface }: {
  rooms: readonly Room[]; room: Room; wall: Wall; surface: WallSurface;
  onRoom: (id: string) => void; onWall: (wall: Wall) => void; onSurface: (surface: WallSurface) => void;
}) {
  return <div className="wall-selection-fields">
    <SelectField label="Wall's room" value={room.id} values={rooms.map(item => item.id)} onChange={onRoom}
      display={id => rooms.find(item => item.id === id)?.name ?? id} />
    <SelectField label="Selected wall" value={wall} values={roomWallIds(room.dimensions)} onChange={onWall}
      display={id => wallLabel(room.dimensions, id)} />
    <Segmented label="Wall surface" value={surface} values={WALL_SURFACES} onChange={onSurface} />
  </div>;
}
