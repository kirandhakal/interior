'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { FolderOpen, LogOut, Plus, Trash2, UserRound } from 'lucide-react';
import { LIMITS, type Account, type ProjectSummary, type SavedProject } from '@studio/model';
import { IconButton, Modal, Segmented } from '@/components/ui';
import { api, errorMessage } from './api';
import { readLocalProjects, removeLocalProject } from './local';

export function AuthDialog({ account, onAuth, onLogout, destroyUnsaved, onClose }: {
  account: Account | null; destroyUnsaved: boolean; onAuth: (account: Account) => void; onLogout: () => void; onClose: () => void;
}) {
  const [mode, setMode] = useState<'Sign in' | 'Create account'>('Sign in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (account && destroyUnsaved && !confirm) { setConfirm(true); return; }
    setBusy(true);
    setError('');
    try {
      if (account) {
        await api.logout();
        onLogout();
      } else {
        onAuth(await api.auth(mode === 'Sign in' ? 'login' : 'register', email, password));
      }
      onClose();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return <Modal title={account ? 'Account' : 'Save to an account'} onClose={busy ? () => {} : onClose}>
    <form className="modal-form" onSubmit={submit}>
      {account ? <p className="account-line"><UserRound size={19} /> {account.email}</p> : <>
        <p className="modal-description">Sign in to open your saved projects on other devices.</p>
        <Segmented label="Account action" values={['Sign in', 'Create account']} value={mode} onChange={value => { setMode(value); setError(''); }} />
        <label className="field"><span>Email</span><input required type="email" autoComplete="email" value={email}
          onChange={event => setEmail(event.currentTarget.value)} /></label>
        <label className="field"><span>Password</span><input required type="password" minLength={8} maxLength={128}
          autoComplete={mode === 'Sign in' ? 'current-password' : 'new-password'} value={password}
          onChange={event => setPassword(event.currentTarget.value)} /></label>
      </>}
      {confirm && <p className="inline-error" role="status">Signing out will close this project and discard unsaved edits.</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button className="button button-secondary" type="button" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="button button-primary" type="submit" disabled={busy}>
          {account && <LogOut size={16} />} {busy ? 'Please wait…' : account ? (confirm ? 'Sign out anyway' : 'Sign out') : mode}
        </button>
      </div>
    </form>
  </Modal>;
}

type LibraryEntry = ProjectSummary & { storage: 'account' | 'browser' };

function localEntries(): LibraryEntry[] {
  return readLocalProjects().map(({ rooms, ...rest }) => ({ ...rest, roomCount: rooms.length, storage: 'browser' }));
}

export function ProjectDialog({ account, current, currentSaved, dirty, onName, onOpen, onNew, onSaveCopy, onRemoved, onClose }: {
  account: Account | null; current: string; currentSaved: boolean; dirty: boolean; onName: (name: string) => void;
  onOpen: (saved: SavedProject, storage: LibraryEntry['storage']) => void; onNew: () => void;
  onSaveCopy: () => Promise<void>; onRemoved: (id: string, storage: LibraryEntry['storage']) => void; onClose: () => void;
}) {
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [name, setName] = useState(current);
  const [loading, setLoading] = useState(Boolean(account));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<{ message: string; label: string; run: () => void }>();

  useEffect(() => {
    let alive = true;
    async function load() {
      const local = localEntries();
      if (alive) setEntries(local);
      if (!account) return;
      try {
        const remote = await api.list();
        if (alive) setEntries([...remote.map(entry => ({ ...entry, storage: 'account' as const })), ...local]);
      } catch (failure) {
        if (alive) setError(errorMessage(failure));
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => { alive = false; };
  }, [account]);

  async function open(entry: LibraryEntry) {
    setError('');
    setBusy(true);
    try {
      const saved = entry.storage === 'account' ? await api.read(entry.id) : readLocalProjects().find(value => value.id === entry.id);
      if (!saved) throw new Error('This project is no longer saved in this browser.');
      onOpen(saved, entry.storage);
      onClose();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function remove(entry: LibraryEntry) {
    setError('');
    setBusy(true);
    try {
      if (entry.storage === 'account') await api.remove(entry.id);
      else removeLocalProject(entry.id);
      setEntries(values => values.filter(value => value.id !== entry.id || value.storage !== entry.storage));
      onRemoved(entry.id, entry.storage);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  function navigate(run: () => void, label: string) {
    if (dirty) setPending({ message: 'Your current project has unsaved changes. Continue?', label, run });
    else run();
  }

  return <Modal title="Projects" onClose={busy ? () => {} : onClose}>
    <div className="modal-form">
      <form className="rename-form" onSubmit={event => {
        event.preventDefault();
        if (name.trim()) { onName(name.trim()); onClose(); }
      }}>
        <label className="field"><span>Current project name</span><input value={name} required maxLength={LIMITS.name}
          onChange={event => setName(event.currentTarget.value)} /></label>
        <button className="button button-secondary" type="submit" disabled={busy || !name.trim() || name.trim() === current}>Rename</button>
      </form>
      <div className="library-heading">
        <h3>Saved projects</h3>
        {currentSaved && <button type="button" className="text-button" disabled={busy} onClick={async () => {
          setError('');
          setBusy(true);
          try { await onSaveCopy(); onClose(); }
          catch (failure) { setError(errorMessage(failure)); }
          finally { setBusy(false); }
        }}>Save a copy</button>}
      </div>
      {loading && <p className="empty-inline" role="status">Loading saved projects…</p>}
      {!loading && !entries.length && <p className="empty-inline">Save a project to open it here later.</p>}
      {!!entries.length && <ul className="object-list library-list">
        {entries.map(entry => <li key={entry.storage + entry.id}>
          <button type="button" disabled={busy} onClick={() => navigate(() => { void open(entry); }, 'Open project')}>
            <FolderOpen size={18} /><span>{entry.name}<small>
              {entry.roomCount} {entry.roomCount === 1 ? 'room' : 'rooms'} · {entry.storage === 'browser' ? 'This browser' : 'Account'}
            </small></span>
          </button>
          <IconButton label={`Delete ${entry.name}`} disabled={busy} onClick={() => {
            setPending({ message: `Delete “${entry.name}” from saved projects?`, label: 'Delete project', run: () => { void remove(entry); } });
          }}><Trash2 size={16} /></IconButton>
        </li>)}
      </ul>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      {pending ? <div className="confirm-box">
        <p role="status">{pending.message}</p>
        <div className="modal-actions">
          <button type="button" className="button button-secondary" onClick={() => setPending(undefined)}>Cancel</button>
          <button type="button" className="button button-danger" onClick={() => { setPending(undefined); pending.run(); }}>{pending.label}</button>
        </div>
      </div> : <div className="modal-actions">
        <button type="button" className="button button-primary" disabled={busy} onClick={() => navigate(() => { onNew(); onClose(); }, 'Create project')}>
          <Plus size={16} /> New project
        </button>
      </div>}
    </div>
  </Modal>;
}
