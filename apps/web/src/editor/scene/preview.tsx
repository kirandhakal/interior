'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Box, Hand, LampCeiling, Maximize, Minus, MousePointer2, Plus, Scan } from 'lucide-react';
import { FURNITURE, LIGHTS, type FurnitureKind, type LightKind, type Room } from '@studio/model';
import { IconButton, Segmented } from '@/components/ui';
import { INTERIOR_DRAG_TYPE, type InteriorPlacement } from '../interior-placement';
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
  dragInterior?: boolean;
  command?: { action: CameraAction };
  onSelect?: (selection: Hit) => void;
  onMove?: (room: Room, dragStart: Room) => void;
  onDropFixture?: (kind: LightKind, placement: LightPlacement | undefined) => void;
  onDropInterior?: (kind: FurnitureKind, placement: InteriorPlacement | undefined) => void;
};

export function Preview({
  room, view, tool = 'Select', selection = null, interactive = false, dragFixtures = false, dragInterior = false, command,
  onSelect = doNothing, onMove = doNothing, onDropFixture, onDropInterior,
}: PreviewProps) {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<RoomScene>(null);
  const [error, setError] = useState(false);
  const [dropOver, setDropOver] = useState(false);
  const current = { room, view, tool, selection, interactive, dragFixtures, dragInterior, onSelect, onMove };
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

  return <div className="scene-host" data-tool={tool} data-drop-over={dropOver} ref={host}
    onDragOver={event => {
      const types = event.dataTransfer.types;
      if (error || !((onDropFixture && types.includes(FIXTURE_DRAG_TYPE)) ||
        (onDropInterior && types.includes(INTERIOR_DRAG_TYPE)))) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      setDropOver(true);
    }}
    onDragLeave={event => {
      if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDropOver(false);
    }}
    onDrop={event => {
      setDropOver(false);
      if (error) return;
      const fixture = event.dataTransfer.getData(FIXTURE_DRAG_TYPE);
      const lightKind = LIGHTS.find(item => item === fixture);
      if (lightKind && onDropFixture) {
        event.preventDefault();
        onDropFixture(lightKind, instance.current?.dropFixture(lightKind, event.clientX, event.clientY));
      } else if (onDropInterior) {
        const item = event.dataTransfer.getData(INTERIOR_DRAG_TYPE);
        const furnitureKind = FURNITURE.find(kind => kind === item);
        if (!furnitureKind) return;
        event.preventDefault();
        onDropInterior(furnitureKind, instance.current?.dropInterior(event.clientX, event.clientY));
      }
    }}>
    {error && <div className="scene-error" role="status">
      <Box size={28} />
      <strong>3D preview unavailable</strong>
      <p>Enable WebGL in your browser to view the room. You can still edit it with the room controls.</p>
    </div>}
  </div>;
}

export function ViewSwitch({ view, onChange, allowCeiling = true }: { view: View; onChange: (view: View) => void; allowCeiling?: boolean }) {
  return <Segmented label="Camera view" value={view} values={allowCeiling ? ['3D', 'Top', 'Ceiling'] : ['3D', 'Top']} onChange={onChange}
    render={value => {
      const Icon = value === '3D' ? Box : value === 'Top' ? Scan : LampCeiling;
      return <><Icon size={15} /><span>{value}<span className="sr-only"> view</span></span></>;
    }} />;
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
