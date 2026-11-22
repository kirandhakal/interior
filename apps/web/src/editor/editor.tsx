'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Armchair, Box, CheckCircle2, DoorOpen, FolderOpen, Info, LampCeiling, Lightbulb, Moon, PaintRoller, Palette,
  Plus, Redo2, Ruler, Save, Settings2, Sun, Sunrise, Sunset, Undo2, UserRound, X, type LucideIcon,
} from 'lucide-react';
import {
  CEILING_CATALOG, DAYLIGHTS, FIXTURE_MOUNTS, LIMITS, WALL_LABELS, fitCeilingDecor, type Account, type CeilingDecorKind, type Daylight,
  type FurnitureKind, type LightKind, type Project, type Room, type SavedProject, type Wall,
} from '@studio/model';
import { IconButton } from '@/components/ui';
import { api, ApiError, errorMessage } from '@/projects/api';
import { AuthDialog, ProjectDialog } from '@/projects/dialogs';
import { readLocalProjects, saveLocalProject } from '@/projects/local';
import { CeilingPanel } from './ceiling/panel';
import { useProjectHistory } from './history';
import type { InteriorPlacement } from './interior-placement';
import { newFixture, type LightPlacement } from './lighting/fixtures';
import { ObjectPanel, type ObjectTab } from './objects';
import { CompareDialog } from './paint/compare';
import { PaintPanel, colorStyle } from './paint/panel';
import { RoomDialog } from './room-dialog';
import { addFurniture, newRoom, PRESETS, resizeRoom, starterProject } from './rooms';
import { Preview, SceneToolbar, ViewSwitch } from './scene/preview';
import type { CameraAction, Hit, Tool, View } from './scene/room-scene';

type Tab = 'Paint' | 'Ceiling' | ObjectTab;
type Dialog = 'add' | 'room' | 'compare' | 'auth' | 'projects';
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
const initialSelection: Hit = { type: 'wall', wall: DEFAULT_WALL };

function markLast(id: string, storage: Storage) {
  try { localStorage.setItem(LAST_PROJECT, storage + '/' + id); } catch {}
}

function forgetLast() {
  try { localStorage.removeItem(LAST_PROJECT); } catch {}
}

function contents(project: SavedProject): Project {
  const { name, rooms } = project;
  return { name, rooms };
}

function pickCeilingPosition<T extends InteriorPlacement>(room: Room, fit: (x: number, z: number) => T): T {
  const { length, width } = room.dimensions;
  const positions = [[0, 0], [-0.27, -0.23], [0.27, 0.23], [-0.27, 0.23], [0.27, -0.23], [0, 0.34], [0, -0.34], [0.34, 0], [-0.34, 0]];
  const occupied = [...(room.ceilingDecor ?? []), ...room.lights.filter(light => light.mount === 'Ceiling')];
  const candidates = positions.map(([x, z]) => fit(x * length, z * width));
  return candidates.find(candidate => occupied.every(other => Math.hypot(candidate.x - other.x, candidate.z - other.z) > 0.74)) ?? candidates[0];
}

export function Editor() {
  const [history, dispatch] = useProjectHistory(starterProject);
  const project = history.current;
  const [roomId, setRoomId] = useState(project.rooms[0].id);
  const room = project.rooms.find(value => value.id === roomId) ?? project.rooms[0];
  const [tab, setTab] = useState<Tab>('Paint');
  const [wall, setWall] = useState<Wall>(DEFAULT_WALL);
  const [selection, setSelection] = useState<Hit | null>(initialSelection);
  const [view, setView] = useState<View>('3D');
  const [tool, setTool] = useState<Tool>('Select');
  const [command, setCommand] = useState<{ action: CameraAction }>();
  const [dialog, setDialog] = useState<Dialog>();
  const [account, setAccount] = useState<Account | null>(null);
  const [activeSave, setActiveSave] = useState<ActiveSave>();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>();
  const uploadId = useRef<string | undefined>(undefined);
  const touched = useRef(false);
  const savingRef = useRef(false);
  const lastGroup = useRef<{ name: string; key: string; time: number } | undefined>(undefined);
  const dirty = activeSave ? JSON.stringify(project) !== JSON.stringify(contents(activeSave.data)) : history.past.length > 0;
  const notify = useCallback((text: string, error = false) => setNotice({ text, error }), []);

  const switchRoom = useCallback((id: string) => {
    setRoomId(id);
    setWall(DEFAULT_WALL);
    setSelection(initialSelection);
    setTool('Select');
  }, []);

  const load = useCallback((saved: SavedProject, storage: Storage) => {
    setActiveSave({ data: saved, storage });
    dispatch({ type: 'load', project: contents(saved) });
    switchRoom(saved.rooms[0].id);
    markLast(saved.id, storage);
    uploadId.current = undefined;
  }, [dispatch, switchRoom]);

  useEffect(() => {
    let alive = true;
    let last: string | null = null;
    try { last = localStorage.getItem(LAST_PROJECT); } catch {}
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
      if ((!event.metaKey && !event.ctrlKey) || event.altKey || dialog ||
        (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable=true]'))) return;
      const key = event.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      event.preventDefault();
      dispatch({ type: event.shiftKey || key === 'y' ? 'redo' : 'undo' });
    }
    window.addEventListener('keydown', handleUndo);
    return () => window.removeEventListener('keydown', handleUndo);
  }, [dialog, dispatch]);

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
    edit(value => ({ ...value, rooms: value.rooms.map(item => item.id === next.id ? next : item) }), group);
  };

  const selectWall = (next: Wall) => {
    setWall(next);
    setSelection({ type: 'wall', wall: next });
  };

  const sceneSelect = (hit: Hit) => {
    setSelection(hit);
    if (hit.type === 'wall') {
      setWall(hit.wall);
      if (view === 'Ceiling' && tab === 'Ceiling') return;
      setTab('Paint');
    } else {
      if (hit.type === 'light' && tab === 'Ceiling' && room.lights.some(light => light.id === hit.id && light.mount === 'Ceiling')) return;
      setTab(objectTabs[hit.type]);
    }
  };

  const changeView = (next: View) => {
    setView(next);
    if (next === 'Ceiling') {
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
      setView('Ceiling');
      setSelection({ type: 'light', id: light.id });
      return;
    }
    if (view === 'Ceiling' && light.mount !== 'Ceiling') setView('3D');
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
    if (view === 'Ceiling') setView('3D');
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
    setView('Ceiling');
    sceneSelect({ type: 'ceilingDecor', id: item.id });
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
    const { name, length, height, width } = PRESETS[0];
    const fresh = newRoom(crypto.randomUUID(), name, { length, width, height });
    dispatch({ type: 'load', project: { name: 'Untitled home', rooms: [fresh] } });
    switchRoom(fresh.id);
    setTab('Paint');
    setActiveSave(undefined);
    uploadId.current = undefined;
    forgetLast();
  };

  const close = () => setDialog(undefined);
  const storageLabel = activeSave?.storage === 'account' ? 'Saved to account' : 'Saved in browser';
  const isWall = selection?.type === 'wall';
  const wallHex = room.walls[wall].color;
  return <>
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
    <main className="studio-layout">
      <aside className="room-sidebar" aria-label="Project and room tools">
        <div className="project-title">
          <span className="overline">PROJECT</span>
          <div><strong>{project.name}</strong><IconButton label="Project settings" disabled={saving} onClick={() => setDialog('projects')}><Settings2 size={15} /></IconButton></div>
          <p aria-live="polite">{activeSave && !dirty ? <><CheckCircle2 size={13} /> {storageLabel}</> : dirty ? 'Unsaved changes' : 'Working project'}</p>
        </div>
        <section className="room-navigation">
          <div className="side-section-title"><h2>Rooms</h2><span>{project.rooms.length}</span></div>
          <ul>
            {project.rooms.map(item => <li key={item.id}>
              <button type="button" aria-current={item.id === room.id ? 'true' : undefined} onClick={() => {
                touched.current = true;
                switchRoom(item.id);
              }}><Box size={17} /><span>{item.name}</span></button>
            </li>)}
          </ul>
          <button type="button" className="button add-room" disabled={project.rooms.length >= LIMITS.rooms} onClick={() => setDialog('add')}><Plus size={17} /> Add room</button>
        </section>
        <nav className="editor-navigation" aria-label="Editor tools">
          <h2>Edit room</h2>
          {tabs.map(({ name, icon: Icon }) => <button key={name} type="button" aria-pressed={tab === name} onClick={() => {
            setTab(name);
            if (name === 'Paint') selectWall(wall);
            if (name === 'Ceiling') changeView('Ceiling');
          }}><Icon size={18} /><span>{name}</span></button>)}
        </nav>
        <section className="dimensions-card">
          <div><Ruler size={17} /><h2>Dimensions</h2>
            <IconButton label="Edit room dimensions" onClick={() => setDialog('room')}><Settings2 size={15} /></IconButton>
          </div>
          <p>{room.dimensions.length} × {room.dimensions.width} × {room.dimensions.height} m</p>
          <span>Length × width × height</span>
        </section>
      </aside>

      <section className="workspace" aria-label="Room preview">
        <header className="workspace-header">
          <div className="workspace-heading">
            <p className="overline">ROOM PREVIEW</p>
            <h1>{room.name}</h1>
          </div>
          <div className="workspace-actions">
            <div className="undo-tools" role="group" aria-label="Edit history">
              <IconButton label="Undo" disabled={!history.past.length} onClick={() => dispatch({ type: 'undo' })}><Undo2 size={18} /></IconButton>
              <IconButton label="Redo" disabled={!history.future.length} onClick={() => dispatch({ type: 'redo' })}><Redo2 size={18} /></IconButton>
            </div>
            <ViewSwitch view={view} onChange={changeView} />
          </div>
        </header>
        <div className="scene-stage">
          <Preview room={room} view={view} tool={tool} selection={selection} command={command} interactive
            dragFixtures={tab === 'Lighting' || tab === 'Ceiling'} dragInterior={tab === 'Furniture'} dragCeilingDecor={tab === 'Ceiling'}
            onSelect={sceneSelect} onMove={changeRoom} onDropFixture={(kind, placement) => {
              if (placement) addFixture(kind, placement);
              else notify(view === 'Ceiling' ? 'Drop a ceiling-mounted fixture onto the ceiling.'
                : kind === 'Wall sconce' ? 'Drop the sconce onto a visible wall in 3D view.' : 'Drop the fixture inside the room.', true);
            }} onDropInterior={(kind, placement) => {
              if (placement) addInterior(kind, placement);
              else notify('Drop the item onto the floor in 3D or Top view.', true);
            }} onDropCeilingDecor={(kind, placement) => {
              if (placement) addCeilingDecor(kind, placement);
              else notify('Drop the item onto the ceiling surface.', true);
            }} />
          <SceneToolbar tool={tool} onTool={setTool} onCamera={action => setCommand({ action })} />
          {isWall && view === '3D' && <span className="scene-selection"><span style={colorStyle(wallHex)} /> {WALL_LABELS[wall]}</span>}
          <span className="scene-hint">{view === 'Ceiling' ? 'Drag empty space to orbit · Drag decor to move it' : tab === 'Lighting' ? 'Drag a fixture to move it'
            : tab === 'Furniture' || tool === 'Move' ? 'Drag an object to move it'
            : view === '3D' ? 'Drag to orbit · Scroll to zoom' : 'Scroll or pinch to zoom'}</span>
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
      </section>

      <aside className="inspector" aria-label={tab + ' options'}>
        <div className="inspector-content" key={tab + room.id}>
          {tab === 'Paint' ? <PaintPanel key={wall} room={room} wall={wall} onWall={selectWall} onChange={changeRoom} onCompare={() => setDialog('compare')} />
            : tab === 'Ceiling' ? <CeilingPanel room={room} selection={selection} inCeilingView={view === 'Ceiling'}
              onAddDecor={addCeilingDecor} onAddFixture={addFixture} onSelect={setSelection} onChange={(next, group) => {
                if (next.ceilingFinish !== room.ceilingFinish) setView('Ceiling');
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
    {(dialog === 'room' || dialog === 'add') && <RoomDialog key={dialog} room={dialog === 'room' ? room : undefined}
      canRemove={project.rooms.length > 1} onClose={close} onSave={(name, dimensions) => {
        if (dialog === 'room') {
          const next = resizeRoom(room, name, dimensions);
          if (!next) return 'The new dimensions would overlap openings or leave insufficient space for furniture.';
          changeRoom(next);
        } else {
          const next = newRoom(crypto.randomUUID(), name, dimensions);
          edit(value => ({ ...value, rooms: [...value.rooms, next] }));
          switchRoom(next.id);
          setTab('Paint');
        }
      }} onRemove={() => {
        const remaining = project.rooms.filter(item => item.id !== room.id);
        edit(value => ({ ...value, rooms: remaining }));
        switchRoom(remaining[0].id);
      }} />}
    {dialog === 'compare' && <CompareDialog room={room} onChange={changeRoom} onClose={close} />}
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
  </>;
}
