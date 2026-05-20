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
      <div>
        <h2 className="font-serif text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
          Nhật ký hoạt động
        </h2>
        <p className="text-sm text-stone-500">{total} mục</p>
      </div>
      {loading ? (
        <div className="card p-6 text-stone-500">{vi.common.loading}</div>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.id} className="card p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="font-mono text-xs text-bark-700">{it.action}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
                    <span>{new Date(it.createdAt).toLocaleString('vi-VN')}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-medium text-stone-700">{it.username ?? '—'}</span>
                    {it.targetType && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{it.targetType}</span>
                      </>
                    )}
                  </div>
                  {it.targetId && (
                    <div className="mt-0.5 truncate font-mono text-[11px] text-stone-400">
                      {it.targetId}
                    </div>
                  )}
                </div>
                {it.diff !== null && (
                  <button
                    type="button"
                    className="btn-ghost shrink-0 text-xs"
                    onClick={() => setOpenId(openId === it.id ? null : it.id)}
                  >
                    {openId === it.id ? 'Ẩn diff' : 'Xem diff'}
                  </button>
                )}
              </div>
              {openId === it.id && (
                <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-stone-900 p-3 text-[11px] text-stone-100">
                  {JSON.stringify(it.diff, null, 2)}
                </pre>
              )}
            </li>
          ))}
          {items.length === 0 && (
            <li className="card px-3 py-10 text-center text-sm text-stone-400">
              {vi.common.empty}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
