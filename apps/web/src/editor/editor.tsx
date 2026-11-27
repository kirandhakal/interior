'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Armchair, Box, CheckCircle2, DoorOpen, FolderOpen, Info, LampCeiling, Lightbulb, Moon, PaintRoller, Palette,
  Plus, Redo2, Ruler, Save, Scan, Settings2, Sun, Sunrise, Sunset, Undo2, UserRound, X, type LucideIcon,
} from 'lucide-react';
import {
  CEILING_CATALOG, DAYLIGHTS, FIXTURE_MOUNTS, LIMITS, fitCeilingDecor, hasCabinetDoors, roomPlan, roomWallIds, wallLabel, wallSpan, type Account, type CeilingDecorKind, type Daylight,
  type FurnitureKind, type LightKind, type Project, type Room, type SavedProject, type Wall,
} from '@studio/model';
import { MEASUREMENT_UNITS, formatMeasurement, type MeasurementUnit } from '@studio/measurement';
import { MeasurementUnitContext } from '@/components/measurement-input';
import { IconButton } from '@/components/ui';
import { api, ApiError, errorMessage } from '@/projects/api';
import { AuthDialog, ProjectDialog } from '@/projects/dialogs';
import { readLocalProjects, saveLocalProject } from '@/projects/local';
import type { CeilingItem } from './ceiling/catalog';
import { CeilingPanel } from './ceiling/panel';
import { CeilingToolbar } from './ceiling/toolbar';
import { FloorPlanEditor } from './floor-plan/editor';
import { useProjectHistory } from './history';
import type { InteriorPlacement } from './interior-placement';
import { newFixture, type LightPlacement } from './lighting/fixtures';
import { ObjectPanel, type ObjectTab } from './objects';
import { CompareDialog } from './paint/compare';
import { PaintPanel, colorStyle } from './paint/panel';
import { RoomDialog } from './room-dialog';
import { addFurniture, newRoom, PRESETS, starterProject } from './rooms';
import { Preview, SceneToolbar, ViewSwitch } from './scene/preview';
import { isCeilingView, type CameraAction, type Hit, type Tool, type View } from './scene/room-scene';
import { WallWorkspace } from './wall/workspace';
import { wallDesignsError } from '@studio/wall-design';

import { arrangeLegacy, layoutError, updateHouseRoom } from '@studio/house';
import { exampleHouse } from '@studio/house-template';
import { bounds, footprint } from '@studio/house';
import { HouseEditor } from './house-editor';
import { RoomExplorer } from './room-explorer';

type Tab = 'Paint' | 'Ceiling' | ObjectTab;
type Dialog = 'add' | 'room' | 'draw' | 'plan' | 'compare' | 'auth' | 'projects' | 'wall';
type Storage = 'account' | 'browser';
type ActiveSave = { data: SavedProject; storage: Storage };
const DEFAULT_WALL = 'north';
const tabs: { name: Tab; icon: LucideIcon }[] = [
  { name: 'Paint', icon: Palette }, { name: 'Openings', icon: DoorOpen },
  { name: 'Lighting', icon: Lightbulb }, { name: 'Furniture', icon: Armchair },
  { name: 'Ceiling', icon: LampCeiling },
];
const dayIcons: Record<Daylight, LucideIcon> = { Morning: Sunrise, Afternoon: Sun, Evening: Sunset, Night: Moon };
const objectTabs = { opening: 'Openings', furniture: 'Furniture', light: 'Lighting', ceilingDecor: 'Ceiling' } as const;
const LAST_PROJECT = 'room-paint-studio.last.v1';
const MEASUREMENT_PREFERENCE = 'room-paint-studio.measurement-unit';
const initialSelection: Hit = { type: 'wall', wall: DEFAULT_WALL };

function markLast(id: string, storage: Storage) {
  try { localStorage.setItem(LAST_PROJECT, storage + '/' + id); } catch {}
}

function forgetLast() {
  try { localStorage.removeItem(LAST_PROJECT); } catch {}
}

function contents(project: SavedProject): Project {
  const { name, rooms } = project;
  return { name, rooms: arrangeLegacy(rooms) };
}

function pickCeilingPosition<T extends InteriorPlacement>(room: Room, fit: (x: number, z: number) => T): T {
  const { bounds: { length, width }, center } = roomPlan(room.dimensions);
  const positions = [[0, 0], [-0.27, -0.23], [0.27, 0.23], [-0.27, 0.23], [0.27, -0.23], [0, 0.34], [0, -0.34], [0.34, 0], [-0.34, 0]];
  const occupied = [...(room.ceilingDecor ?? []), ...room.lights.filter(light => light.mount === 'Ceiling')];
  const candidates = positions.map(([x, z]) => fit(center.x + x * length, center.z + z * width));
  return candidates.find(candidate => occupied.every(other => Math.hypot(candidate.x - other.x, candidate.z - other.z) > 0.74)) ?? candidates[0];
}

export function Editor() {
  const [history, dispatch] = useProjectHistory(starterProject);
  const project = history.current;
  const [roomId, setRoomId] = useState(project.rooms[0].id);
  const room = project.rooms.find(value => value.id === roomId) ?? project.rooms[0];
  const [houseView, setHouseView] = useState(false);
  const [tab, setTab] = useState<Tab>('Paint');
  const [selectedWall, setWall] = useState<Wall>(DEFAULT_WALL);
  const wall = room.walls[selectedWall] ? selectedWall : roomWallIds(room.dimensions)[0];
  const [selectedHit, setSelection] = useState<Hit | null>(initialSelection);
  const selection: Hit | null = selectedHit?.type === 'wall' && !room.walls[selectedHit.wall] ? { type: 'wall', wall } : selectedHit;
  const [view, setView] = useState<View>('3D');
  const ceilingView = isCeilingView(view);
  const [ceilingItem, setCeilingItem] = useState<CeilingItem>({ type: 'decor', kind: 'Ceiling fan' });
  const [placingCeiling, setPlacingCeiling] = useState(false);
  const [placementMissed, setPlacementMissed] = useState(false);
  const [tool, setTool] = useState<Tool>('Select');
  const [command, setCommand] = useState<{ action: CameraAction }>();
  const [dialog, setDialog] = useState<Dialog>();
  const [roomDraft, setRoomDraft] = useState<Room>();
  const [focusWall, setFocusWall] = useState<Wall>();
  const [unit, setUnit] = useState<MeasurementUnit>('m');
  const [account, setAccount] = useState<Account | null>(null);
  const [activeSave, setActiveSave] = useState<ActiveSave>();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>();
  const uploadId = useRef<string | undefined>(undefined);
  const touched = useRef(false);
  const savingRef = useRef(false);
  const lastGroup = useRef<{ name: string; key: string; time: number } | undefined>(undefined);
  const dirty = useMemo(() => activeSave ? JSON.stringify(project) !== JSON.stringify(contents(activeSave.data)) : history.past.length > 0,
    [activeSave, project, history.past.length]);
  const notify = useCallback((text: string, error = false) => setNotice({ text, error }), []);

  const switchRoom = useCallback((room: Room) => {
    const wall = roomWallIds(room.dimensions)[0];
    setRoomId(room.id);
    setWall(wall);
    setSelection({ type: 'wall', wall });
    setTool('Select');
    setPlacingCeiling(false);
  }, []);

  const load = useCallback((saved: SavedProject, storage: Storage) => {
    setActiveSave({ data: saved, storage });
    dispatch({ type: 'load', project: contents(saved) });
    switchRoom(saved.rooms[0]);
    markLast(saved.id, storage);
    uploadId.current = undefined;
  }, [dispatch, switchRoom]);

  useEffect(() => {
    let alive = true;
    let last: string | null = null;
    try {
      last = localStorage.getItem(LAST_PROJECT);
      const savedUnit = localStorage.getItem(MEASUREMENT_PREFERENCE);
      const preferred = MEASUREMENT_UNITS.find(value => value === savedUnit);
      if (preferred) setUnit(preferred);
    } catch {}
    const [storage, id] = last?.split('/') ?? [];
    if (storage === 'browser') {
      const saved = readLocalProjects().find(project => project.id === id);
      if (saved) load(saved, 'browser');
    }
    api.account().then(async user => {
      if (!alive) return;
      setAccount(user);
      if (storage !== 'account' || !id || touched.current) return;
      const saved = await api.read(id);
      if (alive && !touched.current) load(saved, 'account');
    }).catch(error => {
      if (alive && storage === 'account' && error instanceof ApiError && error.status !== 401) notify(error.message, true);
    });
    return () => { alive = false; };
  }, [load, notify]);

  useEffect(() => {
    if (!notice || notice.error) return;
    const timer = window.setTimeout(() => setNotice(undefined), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    function handleUndo(event: KeyboardEvent) {
      if (event.key === 'Escape' && placingCeiling && !dialog) {
        setPlacingCeiling(false);
        return;
      }
      if ((!event.metaKey && !event.ctrlKey) || event.altKey || (dialog && dialog !== 'wall') ||
        (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable=true]'))) return;
      const key = event.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      event.preventDefault();
      dispatch({ type: event.shiftKey || key === 'y' ? 'redo' : 'undo' });
    }
    window.addEventListener('keydown', handleUndo);
    return () => window.removeEventListener('keydown', handleUndo);
  }, [dialog, dispatch, placingCeiling]);

  const edit = (update: (project: Project) => Project, group?: string | Room) => {
    touched.current = true;
    let key = group;
    if (typeof group === 'string') {
      const time = performance.now();
      if (lastGroup.current?.name === group && time - lastGroup.current.time < 360) {
        lastGroup.current.time = time;
      } else lastGroup.current = { name: group, key: group + time, time };
      key = lastGroup.current.key;
    } else lastGroup.current = undefined;
    dispatch({ type: 'edit', update, key });
  };
  const changeRoom = (next: Room, group?: string | Room) => {
    const invalidDesign = wallDesignsError(next);
    if (invalidDesign) { notify(invalidDesign, true); return; }
    let rooms: Room[];
    try { rooms = updateHouseRoom(project.rooms, next); } catch (error) { notify((error as Error).message, true); return; }
    const collision = layoutError(rooms);
    if (collision) { notify(collision, true); return; }
    edit(value => ({ ...value, rooms }), group);
  };

  const selectWall = (next: Wall) => {
    setWall(next);
    setSelection({ type: 'wall', wall: next });
  };

  const sceneSelect = (hit: Hit) => {
    setSelection(hit);
    if (hit.type === 'wall') {
      setWall(hit.wall);
      if (ceilingView && tab === 'Ceiling') return;
      setTab('Paint');
    } else {
      if (hit.type === 'light' && tab === 'Ceiling' && room.lights.some(light => light.id === hit.id && light.mount === 'Ceiling')) return;
      setTab(objectTabs[hit.type]);
    }
  };

  const changeView = (next: View) => {
    setView(next);
    if (!isCeilingView(next)) setPlacingCeiling(false);
    if (isCeilingView(next)) {
      setTab('Ceiling');
      if (selection?.type !== 'ceilingDecor' && !(selection?.type === 'light' && room.lights.some(light => light.id === selection.id && light.mount === 'Ceiling'))) {
        setSelection(null);
      }
    }
  };

  const addFixture = (kind: LightKind, placement?: LightPlacement) => {
    if (room.lights.length >= LIMITS.lights) {
      notify(`This room has reached its ${LIMITS.lights}-fixture limit.`, true);
      return;
    }
    const light = !placement && tab === 'Ceiling' && FIXTURE_MOUNTS[kind].includes('Ceiling')
      ? pickCeilingPosition(room, (x, z) => newFixture(room, kind, wall, { x, z, y: room.dimensions.height, mount: 'Ceiling' }))
      : newFixture(room, kind, wall, placement);
    changeRoom({ ...room, lights: [...room.lights, light] });
    if (tab === 'Ceiling' && light.mount === 'Ceiling') {
      if (!ceilingView) setView('Ceiling');
      setSelection({ type: 'light', id: light.id });
      return;
    }
    if (ceilingView && light.mount !== 'Ceiling') setView('3D');
    sceneSelect({ type: 'light', id: light.id });
  };

  const addInterior = (kind: FurnitureKind, placement?: InteriorPlacement) => {
    if (room.furniture.length >= LIMITS.furniture) {
      notify(`This room has reached its ${LIMITS.furniture}-item limit.`, true);
      return;
    }
    const item = addFurniture(room, kind, placement);
    if (!item) { notify('This item is too large for the room.', true); return; }
    changeRoom({ ...room, furniture: [...room.furniture, item] });
    if (ceilingView) setView('3D');
    sceneSelect({ type: 'furniture', id: item.id });
  };

  const addCeilingDecor = (kind: CeilingDecorKind, placement?: InteriorPlacement) => {
    const decor = room.ceilingDecor ?? [];
    if (decor.length >= LIMITS.ceilingDecor) {
      notify(`This room has reached its ${LIMITS.ceilingDecor}-item ceiling decor limit.`, true);
      return;
    }
    const seed = { id: crypto.randomUUID(), kind, x: 0, z: 0, rotation: 0, scale: 1, color: CEILING_CATALOG[kind].color };
    const item = placement ? fitCeilingDecor(room.dimensions, { ...seed, ...placement })
      : pickCeilingPosition(room, (x, z) => fitCeilingDecor(room.dimensions, { ...seed, x, z }));
    changeRoom({ ...room, ceilingDecor: [...decor, item] });
    if (!ceilingView) setView('Ceiling');
    sceneSelect({ type: 'ceilingDecor', id: item.id });
  };

  const chooseCeilingItem = (item: CeilingItem) => {
    setCeilingItem(item);
    setPlacementMissed(false);
  };

  const startCeilingPlacement = (item: CeilingItem) => {
    chooseCeilingItem(item);
    setPlacingCeiling(true);
    setTab('Ceiling');
    if (!ceilingView) setView('Ceiling');
  };

  const placeCeilingItem = (point?: InteriorPlacement) => {
    if (ceilingItem.type === 'decor') addCeilingDecor(ceilingItem.kind, point);
    else addFixture(ceilingItem.kind, point && { ...point, y: room.dimensions.height, mount: 'Ceiling' });
    setPlacingCeiling(false);
  };

  async function save(copy = false) {
    if (savingRef.current) return;
    touched.current = true;
    savingRef.current = true;
    setSaving(true);
    const storage = account ? 'account' : 'browser';
    const existing = !copy && activeSave?.storage === storage ? activeSave : undefined;
    const id = existing?.data.id ?? (copy ? crypto.randomUUID() : (uploadId.current ??= crypto.randomUUID()));
    const value: Project = copy ? { ...project, name: project.name.slice(0, LIMITS.name - 7) + ' (copy)' } : project;
    try {
      const saved = storage === 'browser' ? saveLocalProject(id, value)
        : existing ? await api.update(id, existing.data.version, value)
          : await api.create(id, value);
      if (copy) edit(current => ({ ...current, name: saved.name }));
      setActiveSave({ data: saved, storage });
      markLast(saved.id, storage);
      uploadId.current = undefined;
      notify(storage === 'account' ? 'Project saved to your account.' : 'Project saved in this browser.');
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  }

  const reset = () => {
    touched.current = true;
    const { name, dimensions } = PRESETS[0];
    const fresh = newRoom(crypto.randomUUID(), name, dimensions);
    dispatch({ type: 'load', project: { name: 'Untitled home', rooms: [fresh] } });
    switchRoom(fresh);
    setTab('Paint');
    setActiveSave(undefined);
    uploadId.current = undefined;
    forgetLast();
  };

  const close = () => {
    setDialog(undefined);
    setRoomDraft(undefined);
    setFocusWall(undefined);
  };
  const openDimensions = (wall?: Wall) => {
    touched.current = true;
    setFocusWall(wall);
    setDialog(room.dimensions.outline ? 'plan' : 'room');
  };
  const changeUnit = (next: MeasurementUnit) => {
    setUnit(next);
    try { localStorage.setItem(MEASUREMENT_PREFERENCE, next); } catch {}
  };
  const addRoom = (next: Room) => {
    edit(value => ({ ...value, rooms: arrangeLegacy([...value.rooms, { ...next, placement: undefined }]) }));
    switchRoom(next);
    setTab('Paint');
  };
  const removeRoom = () => {
    const removed = new Set(room.openings.map(o => o.connectionId).filter(Boolean));
    const remaining = project.rooms.filter(item => item.id !== room.id).map(r => ({ ...r, openings: r.openings.map(o => removed.has(o.connectionId) ? { ...o, connectionId: undefined } : o) }));
    edit(value => ({ ...value, rooms: remaining }));
    switchRoom(remaining[0]);
  };
  const storageLabel = activeSave?.storage === 'account' ? 'Saved to account' : 'Saved in browser';
  const isWall = selection?.type === 'wall';
  const wallHex = room.walls[wall].color;
  const selectedOpening = selection?.type === 'opening' ? room.openings.find(item => item.id === selection.id) : undefined;
  const selectedCabinet = selection?.type === 'furniture' ? room.furniture.find(item => item.id === selection.id && hasCabinetDoors(item.kind)) : undefined;
  const swingLabel = selectedOpening ? selectedOpening.kind.toLowerCase() : 'cabinet doors';
  const swingIsOpen = (selectedOpening?.openAngle ?? selectedCabinet?.doorAngle ?? 0) > 0;
  const previewRoom = roomDraft ?? room;
  const dimensionText = `${formatMeasurement(previewRoom.dimensions.length, unit)} × ${formatMeasurement(previewRoom.dimensions.width, unit)} × ${formatMeasurement(previewRoom.dimensions.height, unit)}`;
  return <MeasurementUnitContext.Provider value={unit}>
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark"><PaintRoller size={20} strokeWidth={1.8} /></span>
        <span>Room Paint <strong>Studio</strong></span>
      </div>
      <div className="topbar-actions">
        <button type="button" className="button top-projects" aria-label="Projects" disabled={saving} onClick={() => setDialog('projects')}>
          <FolderOpen size={17} /> <span>Projects</span>
        </button>
        <button type="button" className="button button-primary" disabled={saving} onClick={() => {
          void save().catch(error => notify(errorMessage(error), true));
        }}><Save size={16} /> <span>{saving ? 'Saving…' : 'Save project'}</span></button>
        <IconButton label={account ? 'Account' : 'Sign in or create an account'} className="account-button" disabled={saving}
          onClick={() => setDialog('auth')}>{account ? account.email[0].toUpperCase() : <UserRound size={17} />}</IconButton>
      </div>
    </header>
    <main className={`studio-layout ${houseView ? 'house-mode' : ''}`}>
      <aside className="room-sidebar" aria-label="Project and room tools">
        <div className="project-title">
          <span className="overline">PROJECT</span>
          <div><strong>{project.name}</strong><IconButton label="Project settings" disabled={saving} onClick={() => setDialog('projects')}><Settings2 size={15} /></IconButton></div>
          <p aria-live="polite">{activeSave && !dirty ? <><CheckCircle2 size={13} /> {storageLabel}</> : dirty ? 'Unsaved changes' : 'Working project'}</p>
        </div>
        <section className="room-navigation">
          <div className="side-section-title"><h2>Rooms</h2><span>{project.rooms.length}</span></div>
          <RoomExplorer rooms={project.rooms} active={room.id} onSelect={switchRoom} onChange={changeRoom}
            onDuplicate={source => { const copy = structuredClone(source); copy.id = crypto.randomUUID(); copy.openings = copy.openings.map(({ connectionId, ...opening }) => opening); copy.name = (source.name.slice(0, 73) + ' (copy)'); addRoom(copy); }}
            onRemove={target => { const removed = new Set(target.openings.map(o => o.connectionId).filter(Boolean)); const remaining = project.rooms.filter(r => r.id !== target.id).map(r => ({ ...r, openings: r.openings.map(o => removed.has(o.connectionId) ? { ...o, connectionId: undefined } : o) })); edit(p => ({ ...p, rooms: remaining })); if (target.id === room.id) switchRoom(remaining[0]); }} />
          <button className="button button-primary house-entry" aria-pressed={houseView} onClick={() => setHouseView(true)}><Scan size={17} /> House layout &amp; preview</button>
          <div className="room-create-actions">
            <button type="button" className="button add-room" disabled={project.rooms.length >= LIMITS.rooms} onClick={() => {
              touched.current = true;
              setDialog('add');
            }}><Plus size={17} /> Add room</button>
            <button type="button" className="button add-room" disabled={project.rooms.length >= LIMITS.rooms} onClick={() => {
              touched.current = true;
              setDialog('draw');
            }}><Scan size={17} /> Draw room</button>
          </div>
        </section>
        <nav className="editor-navigation" aria-label="Editor tools">
          <h2>Edit room</h2>
          {tabs.map(({ name, icon: Icon }) => <button key={name} type="button" aria-pressed={tab === name} onClick={() => {
            setTab(name);
            if (name !== 'Ceiling') setPlacingCeiling(false);
            if (name === 'Paint') selectWall(wall);
            if (name === 'Ceiling' && !ceilingView) changeView('Ceiling');
          }}><Icon size={18} /><span>{name}</span></button>)}
        </nav>
        <section className="dimensions-card">
          <div><Ruler size={17} /><h2>Dimensions</h2>
            <IconButton label="Edit room dimensions" onClick={() => openDimensions()}><Settings2 size={15} /></IconButton>
          </div>
          <button type="button" className="dimension-summary" aria-label={`Edit room dimensions, ${dimensionText}`} onClick={() => openDimensions()}>{dimensionText}</button>
          <span>{room.dimensions.outline ? 'Footprint bounds × height' : 'Length × width × height'}</span>
        </section>
      </aside>

      <section className="workspace" aria-label="Room preview">
        <header className="workspace-header">
          <div className="workspace-heading">
            <p className="overline">{houseView ? 'HOUSE LAYOUT' : 'ROOM PREVIEW'}</p>
            <h1>{houseView ? project.name : room.name}</h1>
          </div>
          <div className="workspace-actions">
            <button className="button button-primary" aria-pressed={houseView} onClick={() => setHouseView(!houseView)}>{houseView ? 'Edit selected room' : 'Whole house'}</button>
            {!houseView && <><button type="button" className="button button-secondary" onClick={() => {
              setPlacingCeiling(false);
              setDialog('wall');
            }}><Scan size={16} /> Open wall</button>
            <button type="button" className="button button-secondary floor-plan-button" onClick={() => {
              touched.current = true;
              setDialog('plan');
            }}><Scan size={16} /> Floor plan</button></>}
            <div className="undo-tools" role="group" aria-label="Edit history">
              <IconButton label="Undo" disabled={!history.past.length} onClick={() => dispatch({ type: 'undo' })}><Undo2 size={18} /></IconButton>
              <IconButton label="Redo" disabled={!history.future.length} onClick={() => dispatch({ type: 'redo' })}><Redo2 size={18} /></IconButton>
            </div>
            {!houseView && <ViewSwitch view={view} onChange={changeView} />}
          </div>
        </header>
        {houseView ? <HouseEditor project={project} active={room} onSelect={switchRoom} onClose={() => setHouseView(false)}
          onAddRoom={() => setDialog('add')} onOpenings={() => { setHouseView(false); setTab('Openings'); }}
          onExample={() => {
            if (project.rooms.length > LIMITS.rooms - 5) { notify('Make space for five more rooms before adding the example house.', true); return; }
            const right = bounds(project.rooms.flatMap(footprint)).maxX + 2;
            const rooms = exampleHouse().map(r => ({ ...r, placement: { ...r.placement!, x: r.placement!.x + right } }));
            edit(p => ({ ...p, rooms: [...p.rooms, ...rooms] })); switchRoom(rooms[3]);
            notify('Added five connected rooms. Your existing rooms are retained alongside the example.');
          }}
          onChange={rooms => { try { const changed = rooms.filter(r => r !== project.rooms.find(old => old.id === r.id)); const updated = rooms.length === project.rooms.length && changed.length === 1 && project.rooms.some(r => r.id === changed[0].id) ? updateHouseRoom(project.rooms, changed[0]) : rooms; const error = layoutError(updated); if (error) notify(error, true); else edit(p => ({ ...p, rooms: updated })); } catch (error) { notify((error as Error).message, true); } }} /> : <>
        {ceilingView && <CeilingToolbar room={room} item={ceilingItem} placing={placingCeiling} missed={placementMissed} inside={view === 'Interior'}
          onChoose={chooseCeilingItem} onStart={() => startCeilingPlacement(ceilingItem)}
          onFinish={ceilingFinish => changeRoom({ ...room, ceilingFinish })}
          onAutoPlace={() => placeCeilingItem()} onCancel={() => setPlacingCeiling(false)}
          onToggleInterior={() => changeView(view === 'Interior' ? 'Ceiling' : 'Interior')} />}
        <div className="scene-stage">
          <Preview room={previewRoom} view={view} tool={tool} selection={roomDraft && focusWall ? { type: 'wall', wall: focusWall } : selection} command={command} interactive={!roomDraft}
            dragFixtures={tab === 'Lighting' || tab === 'Ceiling'} dragInterior={tab === 'Furniture'} dragCeilingDecor={tab === 'Ceiling'}
            onPlaceCeiling={ceilingView && placingCeiling ? point => {
              if (point) placeCeilingItem(point);
              else setPlacementMissed(true);
            } : undefined}
            onSelect={sceneSelect} onMove={changeRoom} onDropFixture={(kind, placement) => {
              if (placement) {
                setPlacingCeiling(false);
                addFixture(kind, placement);
              }
              else notify(ceilingView ? 'Drop a ceiling-mounted fixture onto the ceiling.'
                : kind === 'Wall sconce' ? 'Drop the sconce onto a visible wall in 3D view.' : 'Drop the fixture inside the room.', true);
            }} onDropInterior={(kind, placement) => {
              if (placement) addInterior(kind, placement);
              else notify('Drop the item onto the floor in 3D or Top view.', true);
            }} onDropCeilingDecor={(kind, placement) => {
              if (placement) {
                setPlacingCeiling(false);
                addCeilingDecor(kind, placement);
              }
              else notify('Drop the item onto the ceiling surface.', true);
            }} />
          <SceneToolbar tool={tool} onTool={next => { setTool(next); setPlacingCeiling(false); }} onCamera={action => setCommand({ action })} />
          {(!ceilingView || view === 'Interior') && !placingCeiling && (selectedOpening || selectedCabinet) &&
            <div className="scene-swing-controls" role="group" aria-label="Swing controls">
              <button type="button" className="button button-secondary" onClick={() => {
                const angle = swingIsOpen ? 0 : 90;
                if (selectedOpening) changeRoom({ ...room, openings: room.openings.map(item =>
                  item.id === selectedOpening.id ? { ...item, openAngle: angle } : item) });
                else if (selectedCabinet) changeRoom({ ...room, furniture: room.furniture.map(item =>
                  item.id === selectedCabinet.id ? { ...item, doorAngle: angle } : item) });
              }}><DoorOpen size={16} /> {swingIsOpen ? 'Close' : 'Open'} {swingLabel}</button>
              {view !== 'Top' && <button type="button" className="button button-secondary" onClick={() => changeView('Top')}>
                Show swing in Top
              </button>}
            </div>}
          {isWall && (view === '3D' || view === 'Top') && <button type="button" className="scene-selection" onClick={() => openDimensions(wall)}
            aria-label={`Edit ${wallLabel(room.dimensions, wall).toLowerCase()} dimensions`}><span style={colorStyle(wallHex)} />
            {wallLabel(room.dimensions, wall)} · {formatMeasurement(wallSpan(previewRoom.id === room.id ? previewRoom.dimensions : room.dimensions, wall), unit)}
          </button>}
          {!placingCeiling && <span className="scene-hint">{view === 'Ceiling' ? 'Drag an item to reposition it'
            : view === 'Ceiling Outside' ? 'Drag empty space to orbit · Drag decor to move it'
            : view === 'Interior' ? 'Drag empty space to look around' : tab === 'Lighting' ? 'Drag a fixture to move it'
            : tab === 'Furniture' || tool === 'Move' ? 'Drag an object to move it'
            : view === '3D' ? 'Drag to orbit · Scroll to zoom' : 'Scroll or pinch to zoom'}</span>}
        </div>
        <div className="daylight-strip">
          <div className="daylight-label"><Sun size={18} /><span>Daylight</span></div>
          <div className="daylight-options" role="group" aria-label="Daylight conditions">
            {DAYLIGHTS.map(day => {
              const Icon = dayIcons[day];
              return <button type="button" key={day} aria-pressed={room.daylight === day} onClick={() => {
                if (day !== room.daylight) changeRoom({ ...room, daylight: day });
              }}><Icon size={16} /> <span>{day}</span></button>;
            })}
          </div>
        </div>
        <p className="preview-note"><Info size={15} /> Screen settings and real-world lighting can change how paint looks.</p>
        </>}
      </section>

      <aside className="inspector" aria-label={tab + ' options'}>
        <div className="inspector-content" key={tab + room.id}>
          {tab === 'Paint' ? <PaintPanel key={wall} room={room} wall={wall} onWall={selectWall} onChange={changeRoom} onCompare={() => setDialog('compare')} />
            : tab === 'Ceiling' ? <CeilingPanel room={room} selection={selection} inCeilingView={ceilingView}
              onAddDecor={kind => startCeilingPlacement({ type: 'decor', kind })} onAddFixture={kind => startCeilingPlacement({ type: 'light', kind })}
              onSelect={hit => { setSelection(hit); setPlacingCeiling(false); }} onChange={(next, group) => {
                if (next.ceilingFinish !== room.ceilingFinish && !ceilingView) setView('Ceiling');
                changeRoom(next, group);
              }} />
            : <ObjectPanel tab={tab} room={room} wall={wall} selection={selection} onAddFixture={addFixture} onAddInterior={addInterior} onSelect={hit => {
              if (hit?.type === 'wall') selectWall(hit.wall);
              else setSelection(hit);
            }} onChange={changeRoom} notify={message => notify(message, true)} />}
        </div>
      </aside>
    </main>

    {notice && <div className="toast" role={notice.error ? 'alert' : 'status'} data-error={notice.error}>
      {notice.error ? <Info size={19} /> : <CheckCircle2 size={19} />}
      <span>{notice.text}</span>
      <IconButton label="Dismiss notification" onClick={() => setNotice(undefined)}><X size={16} /></IconButton>
    </div>}
    {(dialog === 'room' || dialog === 'add') && <RoomDialog key={dialog} room={dialog === 'room' ? room : undefined} preview={roomDraft}
      unit={unit} onUnit={changeUnit} onPreview={setRoomDraft} focusWall={focusWall} canRemove={project.rooms.length > 1} onClose={close} onSave={draft => {
        if (dialog === 'room') {
          if (draft !== room) changeRoom(draft);
        } else addRoom({ ...draft, id: crypto.randomUUID() });
      }} onRemove={removeRoom} />}
    {(dialog === 'plan' || dialog === 'draw') && <FloorPlanEditor key={dialog} room={dialog === 'plan' ? room : undefined}
      unit={unit} onUnit={changeUnit} focusWall={focusWall} onClose={close} onSave={next => {
        if (dialog === 'draw') addRoom(next);
        else if (next !== room) changeRoom(next);
      }} onRemove={dialog === 'plan' && project.rooms.length > 1 ? removeRoom : undefined} />}
    {dialog === 'compare' && <CompareDialog room={room} onChange={changeRoom} onClose={close} />}
    {dialog === 'wall' && <WallWorkspace project={project} roomId={room.id} wallId={wall} unit={unit} onUnit={changeUnit} onClose={close}
      onChange={changeRoom} canUndo={!!history.past.length} canRedo={!!history.future.length}
      onUndo={() => dispatch({ type: 'undo' })} onRedo={() => dispatch({ type: 'redo' })}
      saving={saving} onSave={() => save()} />}
    {dialog === 'projects' && <ProjectDialog account={account} current={project.name} currentSaved={!!activeSave}
      dirty={dirty} onClose={close} onName={name => edit(value => ({ ...value, name }))} onOpen={(saved, storage) => {
        touched.current = true;
        load(saved, storage);
        setTab('Paint');
      }} onNew={reset} onSaveCopy={() => save(true)} onRemoved={(id, storage) => {
        if (activeSave?.data.id === id && activeSave.storage === storage) {
          setActiveSave(undefined);
          uploadId.current = undefined;
          forgetLast();
        }
      }} />}
    {dialog === 'auth' && <AuthDialog account={account} onAuth={user => {
      touched.current = true;
      setAccount(user);
      uploadId.current = undefined;
      notify('Signed in. Save your project to add it to your account.');
    }} onLogout={() => {
      setAccount(null);
      if (activeSave?.storage === 'account') reset();
      else uploadId.current = undefined;
      notify('Signed out.');
    }} destroyUnsaved={dirty && activeSave?.storage === 'account'} onClose={close} />}
  </MeasurementUnitContext.Provider>;
}
