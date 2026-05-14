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
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{vi.admin.title}</h2>
        <Link className="btn-secondary" to="/admin/audit">
          Nhật ký hoạt động
        </Link>
      </div>

      <section className="card p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{vi.admin.backup}</h3>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onMediaZip} disabled={creatingZip}>
              {creatingZip ? vi.common.loading : 'Sao lưu hình ảnh (.zip)'}
            </button>
            <button className="btn-primary" onClick={onBackup} disabled={creatingBackup}>
              {creatingBackup ? vi.common.loading : vi.admin.backupNow}
            </button>
          </div>
        </div>
        <div className="mt-3 overflow-hidden rounded-md border border-stone-200">
          <table className="min-w-full divide-y divide-stone-200 text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase text-stone-500">
              <tr>
                <th className="px-3 py-2">Tệp</th>
                <th className="px-3 py-2">Kích thước</th>
                <th className="px-3 py-2">Thời điểm</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {backups.map((b) => (
                <tr key={b.filename}>
                  <td className="px-3 py-2 font-mono text-xs">{b.filename}</td>
                  <td className="px-3 py-2">{Math.round(b.sizeBytes / 1024)} KB</td>
                  <td className="px-3 py-2">{new Date(b.createdAt).toLocaleString('vi-VN')}</td>
                </tr>
              ))}
              {backups.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-center text-stone-400">
                    {vi.common.empty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-4">
        <h3 className="font-semibold">{vi.admin.users}</h3>
        <form onSubmit={onCreateUser} className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
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
          >
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <button className="btn-primary" disabled={savingUser}>
            {savingUser ? vi.common.loading : vi.admin.addUser}
          </button>
        </form>
        <div className="mt-4 overflow-hidden rounded-md border border-stone-200">
          <table className="min-w-full divide-y divide-stone-200 text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase text-stone-500">
              <tr>
                <th className="px-3 py-2">{vi.auth.username}</th>
                <th className="px-3 py-2">{vi.admin.role}</th>
                <th className="px-3 py-2">Tạo lúc</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-3 py-2">{u.username}</td>
                  <td className="px-3 py-2">
                    <select
                      className="input w-40"
                      value={u.role}
                      onChange={(e) => onRoleChange(u, e.target.value as Role)}
                      disabled={u.id === user?.id}
                    >
                      {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">{new Date(u.createdAt).toLocaleString('vi-VN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
