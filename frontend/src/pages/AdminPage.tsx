import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Role } from '@roots/shared';
import { api, ApiError } from '../lib/api';
import { useAuth, hasRole } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { vi } from '../locales/vi';

interface BackupItem {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}
interface UserRow {
  id: string;
  username: string;
  role: Role;
  createdAt: string;
}

const ROLE_LABEL: Record<Role, string> = {
  admin: vi.admin.role_admin,
  editor: vi.admin.role_editor,
  viewer: vi.admin.role_viewer,
};

export default function AdminPage() {
  const { user } = useAuth();
  const toast = useToast();

  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [creatingZip, setCreatingZip] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<Role>('viewer');
  const [savingUser, setSavingUser] = useState(false);

  const isAdmin = hasRole(user, 'admin');

  async function loadAll(): Promise<void> {
    if (!isAdmin) return;
    try {
      const [b, u] = await Promise.all([api.listBackups(), api.listUsers()]);
      setBackups(b.items);
      setUsers(u.items);
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : vi.errors.generic, 'error');
    }
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function onMediaZip(): Promise<void> {
    setCreatingZip(true);
    try {
      const res = await api.createMediaZip();
      toast.show(vi.admin.backupSuccess(res.filename), 'success');
      await loadAll();
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : vi.errors.generic, 'error');
    } finally {
      setCreatingZip(false);
    }
  }

  async function onBackup(): Promise<void> {
    setCreatingBackup(true);
    try {
      const res = await api.createBackup();
      toast.show(vi.admin.backupSuccess(res.filename), 'success');
      await loadAll();
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : vi.errors.generic, 'error');
    } finally {
      setCreatingBackup(false);
    }
  }

  async function onCreateUser(e: FormEvent): Promise<void> {
    e.preventDefault();
    setSavingUser(true);
    try {
      await api.createUser({ username: newUsername, password: newPassword, role: newRole });
      toast.show(vi.person.saveSuccess, 'success');
      setNewUsername('');
      setNewPassword('');
      setNewRole('viewer');
      await loadAll();
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : vi.errors.generic, 'error');
    } finally {
      setSavingUser(false);
    }
  }

  async function onRoleChange(u: UserRow, role: Role): Promise<void> {
    try {
      await api.updateUser(u.id, { role });
      await loadAll();
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : vi.errors.generic, 'error');
    }
  }

  if (!isAdmin) {
    return <div className="card p-6 text-stone-500">{vi.errors.forbidden}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-serif text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
          {vi.admin.title}
        </h2>
        <Link className="btn-secondary" to="/admin/audit">
          Nhật ký hoạt động
        </Link>
      </div>

      <section className="card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
            {vi.admin.backup}
          </h3>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="btn-secondary"
              onClick={onMediaZip}
              disabled={creatingZip}
            >
              {creatingZip ? vi.common.loading : 'Sao lưu hình ảnh (.zip)'}
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={onBackup}
              disabled={creatingBackup}
            >
              {creatingBackup ? vi.common.loading : vi.admin.backupNow}
            </button>
          </div>
        </div>
        <ul className="mt-3 divide-y divide-stone-100 overflow-hidden rounded-lg border border-stone-200">
          {backups.map((b) => (
            <li
              key={b.filename}
              className="grid grid-cols-1 gap-1 px-3 py-2.5 text-sm md:grid-cols-3 md:items-center"
            >
              <div className="font-mono text-xs text-stone-700 break-all">{b.filename}</div>
              <div className="text-xs text-stone-500 md:text-sm">
                {Math.round(b.sizeBytes / 1024)} KB
              </div>
              <div className="text-xs text-stone-500 md:text-sm">
                {new Date(b.createdAt).toLocaleString('vi-VN')}
              </div>
            </li>
          ))}
          {backups.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-stone-400">{vi.common.empty}</li>
          )}
        </ul>
      </section>

      <section className="card p-4 sm:p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          {vi.admin.users}
        </h3>
        <form
          onSubmit={onCreateUser}
          className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <input
            className="input"
            placeholder={vi.auth.username}
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            required
            minLength={3}
          />
          <input
            className="input"
            placeholder={vi.auth.password}
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
          />
          <select
            className="input"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as Role)}
            aria-label={vi.admin.role}
          >
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-primary" disabled={savingUser}>
            {savingUser ? vi.common.loading : vi.admin.addUser}
          </button>
        </form>
        <ul className="mt-4 divide-y divide-stone-100 overflow-hidden rounded-lg border border-stone-200">
          {users.map((u) => (
            <li
              key={u.id}
              className="flex flex-col gap-2 px-3 py-3 text-sm md:flex-row md:items-center md:gap-4"
            >
              <div className="flex-1">
                <div className="font-medium text-stone-900">{u.username}</div>
                <div className="text-xs text-stone-500">
                  {new Date(u.createdAt).toLocaleString('vi-VN')}
                </div>
              </div>
              <select
                className="input w-full md:w-44"
                value={u.role}
                onChange={(e) => onRoleChange(u, e.target.value as Role)}
                disabled={u.id === user?.id}
                aria-label={`${vi.admin.role} cho ${u.username}`}
              >
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
