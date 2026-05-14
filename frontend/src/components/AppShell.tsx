import { NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useState, type ReactNode } from 'react';
import { useAuth, hasRole } from '../context/AuthContext';
import { useOnline } from '../lib/useOnline';
import { onServiceWorkerUpdate } from '../lib/registerSW';
import { vi } from '../locales/vi';

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const online = useOnline();
  const [updateReload, setUpdateReload] = useState<(() => Promise<void>) | null>(null);

  useEffect(() => {
    return onServiceWorkerUpdate((reload) => setUpdateReload(() => reload));
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-bark-700 bg-bark-600 text-stone-50">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="font-serif text-2xl">譜</span>
            <div>
              <div className="text-base font-semibold leading-tight">{vi.appName}</div>
              <div className="text-xs text-bark-100/80">{vi.appTagline}</div>
            </div>
          </div>
          <nav className="flex items-center gap-1 text-sm">
            <NavTab to="/tree" label={vi.nav.tree} />
            <NavTab to="/persons" label={vi.nav.persons} />
            {hasRole(user, 'admin') && <NavTab to="/admin" label={vi.nav.admin} />}
            <span className="ml-3 hidden text-xs text-bark-100/70 md:inline">
              {user?.username} · {user?.role}
            </span>
            <button
              type="button"
              className="ml-2 rounded-md border border-bark-400/40 px-2 py-1 text-xs hover:bg-bark-700"
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
            >
              {vi.nav.logout}
            </button>
          </nav>
        </div>
        {!online && (
          <div className="bg-amber-200 text-amber-900">
            <div className="mx-auto max-w-6xl px-4 py-1 text-center text-xs">
              {vi.common.offlineBanner}
            </div>
          </div>
        )}
        {updateReload && (
          <div className="bg-emerald-100 text-emerald-900">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-1.5 text-xs">
              <span>Có bản cập nhật mới của ứng dụng.</span>
              <button
                type="button"
                className="rounded-md border border-emerald-700/50 px-2 py-0.5 hover:bg-emerald-200"
                onClick={() => updateReload()}
              >
                Tải lại
              </button>
            </div>
          </div>
        )}
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
      </main>
    </div>
  );
}

function NavTab({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `rounded-md px-3 py-1.5 transition-colors ${
          isActive ? 'bg-bark-700 text-stone-50' : 'text-bark-50/90 hover:bg-bark-700'
        }`
      }
    >
      {label}
    </NavLink>
  );
}
