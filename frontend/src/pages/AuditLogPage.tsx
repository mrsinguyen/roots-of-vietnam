import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { useAuth, hasRole } from '../context/AuthContext';
import { vi } from '../locales/vi';

interface Row {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  diff: unknown;
  createdAt: string;
  userId: string | null;
  username: string | null;
}

export default function AuditLogPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const isAdmin = hasRole(user, 'admin');

  useEffect(() => {
    if (!isAdmin) return;
    api
      .listAudit({ limit: 200 })
      .then((r) => {
        setItems(r.items);
        setTotal(r.total);
      })
      .catch((err) => toast.show(err instanceof ApiError ? err.message : vi.errors.generic, 'error'))
      .finally(() => setLoading(false));
  }, [isAdmin, toast]);

  if (!isAdmin) return <div className="card p-6 text-stone-500">{vi.errors.forbidden}</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Nhật ký hoạt động ({total})</h2>
      {loading ? (
        <div className="card p-6 text-stone-500">{vi.common.loading}</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="min-w-full divide-y divide-stone-200 text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase text-stone-500">
              <tr>
                <th className="px-3 py-2">Thời điểm</th>
                <th className="px-3 py-2">Người dùng</th>
                <th className="px-3 py-2">Hành động</th>
                <th className="px-3 py-2">Đối tượng</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {items.map((it) => (
                <tr key={it.id} className="align-top">
                  <td className="px-3 py-2 text-xs text-stone-500">
                    {new Date(it.createdAt).toLocaleString('vi-VN')}
                  </td>
                  <td className="px-3 py-2">{it.username ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{it.action}</td>
                  <td className="px-3 py-2">
                    {it.targetType ? `${it.targetType}` : '—'}
                    {it.targetId ? <div className="text-xs text-stone-400">{it.targetId}</div> : null}
                  </td>
                  <td className="px-3 py-2">
                    {it.diff !== null && (
                      <button
                        type="button"
                        className="text-bark-600 hover:underline"
                        onClick={() => setOpenId(openId === it.id ? null : it.id)}
                      >
                        {openId === it.id ? 'Ẩn diff' : 'Xem diff'}
                      </button>
                    )}
                    {openId === it.id && (
                      <pre className="mt-2 max-w-xl overflow-auto rounded bg-stone-900 p-2 text-[11px] text-stone-100">
                        {JSON.stringify(it.diff, null, 2)}
                      </pre>
                    )}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-stone-400">
                    {vi.common.empty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
