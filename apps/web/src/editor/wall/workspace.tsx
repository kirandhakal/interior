'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { roomWallIds, wallLabel, type Project, type Wall } from '@studio/model';
import { MEASUREMENT_UNITS, formatMeasurement, type MeasurementUnit } from '@studio/measurement';
import { isolateWall, wallLocalToWorld, wallPointIsPaintable, type WallPoint, type WallSurface } from '@studio/wall-surface';
import { Modal, Segmented, SelectField } from '@/components/ui';
import { WallElevation } from './elevation';
import { WallIsolation } from './isolation';
import { WallSelection } from './selection';

export function WallWorkspace({ project, roomId, wallId, unit, onUnit, onClose }: {
  project: Project; roomId: string; wallId: Wall; unit: MeasurementUnit;
  onUnit: (unit: MeasurementUnit) => void; onClose: () => void;
}) {
  const [target, setTarget] = useState({ roomId, wallId });
  const [surface, setSurface] = useState<WallSurface>('Interior');
  const [view, setView] = useState<'2D elevation' | '3D preview'>('2D elevation');
  const [openingId, setOpening] = useState<string>();
  const [point, setPoint] = useState<WallPoint>();
  const room = project.rooms.find(room => room.id === target.roomId) ?? project.rooms[0];
  const id = roomWallIds(room.dimensions).includes(target.wallId) ? target.wallId : roomWallIds(room.dimensions)[0];
  const wall = useMemo(() => isolateWall(room, id, surface), [room, id, surface]);
  const selected = wall.apertures.find(item => item.opening.id === openingId);
  const measurement = (value: number, power = 1) => formatMeasurement(value, unit, power);
  const resetInspection = () => { setOpening(undefined); setPoint(undefined); };
  const world = point && wallLocalToWorld(wall.frame, point);

  return <Modal title="Wall workspace" onClose={onClose} wide>
    <div className="wall-workspace">
      <header className="wall-workspace-header">
        <button type="button" className="button button-secondary" onClick={onClose}><ArrowLeft size={16} /> Return to room</button>
        <div><p className="overline">{room.name} · {surface} surface</p><h3>{wallLabel(room.dimensions, id)}</h3></div>
        <Segmented label="Wall view" value={view} values={['2D elevation', '3D preview']} onChange={setView} />
      </header>
      <div className="wall-workspace-body">
        <section className="wall-canvas-column" aria-label="Wall preview">
          {view === '2D elevation' ? <WallElevation key={`${room.id}/${id}/${surface}`} wall={wall} unit={unit}
            selectedOpening={openingId} onOpening={setOpening} onPoint={setPoint} />
            : <WallIsolation key={`${room.id}/${id}/${surface}`} wall={wall} onOpening={setOpening} />}
          <p className="wall-instructions">{view === '2D elevation' ? 'Drag to pan · Scroll to zoom · Select a door or window to inspect · Grid: 0.5 m'
            : 'Drag to orbit · Right-drag or choose Pan to pan · Scroll to zoom'}</p>
          {view === '2D elevation' && <div className="wall-coordinate-readout">
            {point && world ? <><span>U {measurement(point.u)} · V {measurement(point.v)}</span>
              <span>World X {measurement(world.x)} · Y {measurement(world.y)} · Z {measurement(world.z)}</span>
              <span>{wallPointIsPaintable(wall, point) ? 'Wall surface' : 'Opening or outside wall'}</span></>
              : <span>Move over the elevation to inspect surface coordinates.</span>}
          </div>}
        </section>
        <aside className="wall-inspector" aria-label="Wall properties">
          <WallSelection rooms={project.rooms} room={room} wall={id} surface={surface}
            onRoom={roomId => {
              const next = project.rooms.find(room => room.id === roomId)!;
              setTarget({ roomId, wallId: roomWallIds(next.dimensions)[0] }); resetInspection();
            }} onWall={wallId => { setTarget({ roomId: room.id, wallId }); resetInspection(); }}
            onSurface={value => { setSurface(value); resetInspection(); }} />
          <SelectField label="Wall measurement units" value={unit} values={MEASUREMENT_UNITS} onChange={onUnit} />
          <dl className="wall-properties">
            <div><dt>Face width</dt><dd>{measurement(wall.frame.width)}</dd></div>
            <div><dt>Height</dt><dd>{measurement(wall.frame.height)}</dd></div>
            <div><dt>Thickness</dt><dd>{measurement(wall.frame.wall.thickness)}</dd></div>
            <div><dt>Gross area</dt><dd>{measurement(wall.grossArea, 2)}</dd></div>
            <div><dt>Net surface area</dt><dd>{measurement(wall.netArea, 2)}</dd></div>
            <div><dt>Paint</dt><dd><span className="wall-paint-chip" style={{ background: wall.paint.color }} />{wall.paint.color}</dd></div>
            <div><dt>Finish</dt><dd>{wall.paint.finish}</dd></div>
            <div><dt>Wall ID</dt><dd>{id}</dd></div>
            <div><dt>Room ID</dt><dd>{room.id}</dd></div>
          </dl>
          <p className="wall-property-note">Paint and finish are currently shared by both wall faces. U starts at the visible lower-left corner; V measures height from the floor.</p>
          <section aria-label="Wall openings">
            <h4>Doors & windows <span>({wall.openings.length})</span></h4>
            {wall.openings.length === 0 ? <p className="wall-property-note">No openings on this wall.</p> : <div className="wall-opening-list">
              {wall.openings.map((opening, index) => <button type="button" key={opening.id} aria-pressed={openingId === opening.id}
                onClick={() => setOpening(opening.id)}><span>{opening.kind} {index + 1}</span><small>{measurement(opening.width)} × {measurement(opening.height)}</small></button>)}
            </div>}
            {selected && <dl className="wall-properties" aria-label="Opening properties">
              <div><dt>ID</dt><dd>{selected.opening.id}</dd></div>
              <div><dt>Width × height</dt><dd>{measurement(selected.opening.width)} × {measurement(selected.height)}</dd></div>
              <div><dt>U · left edge</dt><dd>{measurement(selected.u)}</dd></div>
              <div><dt>Sill height · V</dt><dd>{measurement(selected.v)}</dd></div>
              <div><dt>Wall offset</dt><dd>{measurement(selected.opening.offset)}</dd></div>
              <div><dt>Open angle</dt><dd>{selected.opening.openAngle ?? 0}°</dd></div>
              {selected.opening.kind === 'Door' && <div><dt>Hinge</dt><dd>{selected.opening.hinge ?? 'Left'}</dd></div>}
              {selected.opening.curtains && <div><dt>Curtains</dt><dd>{selected.opening.curtains.length} · {selected.opening.curtains.drawn}% drawn · {selected.opening.curtains.color}</dd></div>}
            </dl>}
          </section>
        </aside>
      </div>
    </div>
  </Modal>;
}
