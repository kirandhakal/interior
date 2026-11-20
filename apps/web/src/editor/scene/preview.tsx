'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Box, Hand, Maximize, Minus, MousePointer2, Plus, Scan } from 'lucide-react';
import { LIGHTS, type LightKind, type Room } from '@studio/model';
import { IconButton, Segmented } from '@/components/ui';
import { FIXTURE_DRAG_TYPE, type LightPlacement } from '../lighting/fixtures';
import { RoomScene, type CameraAction, type Hit, type Tool, type View } from './room-scene';

const doNothing = () => {};

type PreviewProps = {
  room: Room;
  view: View;
  tool?: Tool;
  selection?: Hit | null;
  interactive?: boolean;
  dragFixtures?: boolean;
  command?: { action: CameraAction };
  onSelect?: (selection: Hit) => void;
  onMove?: (room: Room, dragStart: Room) => void;
  onDropFixture?: (kind: LightKind, placement: LightPlacement | undefined) => void;
};

export function Preview({
  room, view, tool = 'Select', selection = null, interactive = false, dragFixtures = false, command,
  onSelect = doNothing, onMove = doNothing, onDropFixture,
}: PreviewProps) {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<RoomScene>(null);
  const [error, setError] = useState(false);
  const [fixtureOver, setFixtureOver] = useState(false);
  const current = { room, view, tool, selection, interactive, dragFixtures, onSelect, onMove };
  const latest = useRef(current);

  useLayoutEffect(() => {
    latest.current = current;
    instance.current?.update(current);
  });

  useEffect(() => {
    if (!host.current) return;
    try {
      const scene = new RoomScene(host.current, latest.current);
      instance.current = scene;
      return () => { scene.dispose(); instance.current = null; };
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    if (command) instance.current?.act(command.action);
  }, [command]);

  return <div className="scene-host" data-tool={tool} data-fixture-over={fixtureOver} ref={host}
    onDragOver={event => {
      if (!onDropFixture || error || !event.dataTransfer.types.includes(FIXTURE_DRAG_TYPE)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      setFixtureOver(true);
    }}
    onDragLeave={event => {
      if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setFixtureOver(false);
    }}
    onDrop={event => {
      setFixtureOver(false);
      if (!onDropFixture || error) return;
      const fixture = event.dataTransfer.getData(FIXTURE_DRAG_TYPE);
      const kind = LIGHTS.find(item => item === fixture);
      if (!kind) return;
      event.preventDefault();
      onDropFixture(kind, instance.current?.dropFixture(kind, event.clientX, event.clientY));
    }}>
    {error && <div className="scene-error" role="status">
      <Box size={28} />
      <strong>3D preview unavailable</strong>
      <p>Enable WebGL in your browser to view the room. You can still edit it with the room controls.</p>
    </div>}
  </div>;
}

export function ViewSwitch({ view, onChange }: { view: View; onChange: (view: View) => void }) {
  return <Segmented label="Camera view" value={view} values={['3D', 'Top']} onChange={onChange}
    render={value => value === '3D' ? <><Box size={15} /> 3D view</> : <><Scan size={15} /> Top view</>} />;
}

export function SceneToolbar({ tool, onTool, onCamera }: {
  tool: Tool; onTool: (tool: Tool) => void; onCamera: (action: CameraAction) => void;
}) {
  return <>
    <div className="scene-tools" aria-label="Scene tools" role="group">
      <IconButton label="Select surfaces and objects" pressed={tool === 'Select'} onClick={() => onTool('Select')}><MousePointer2 size={17} /></IconButton>
      <IconButton label="Move objects" pressed={tool === 'Move'} onClick={() => onTool('Move')}><Hand size={17} /></IconButton>
    </div>
    <div className="scene-camera" aria-label="Camera controls" role="group">
      <IconButton label="Zoom in" onClick={() => onCamera('in')}><Plus size={19} /></IconButton>
      <IconButton label="Zoom out" onClick={() => onCamera('out')}><Minus size={19} /></IconButton>
      <IconButton label="Reset camera" onClick={() => onCamera('reset')}><Maximize size={16} /></IconButton>
    </div>
  </>;
}
