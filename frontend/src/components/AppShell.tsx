import { NavLink, useNavigate, Link } from 'react-router-dom';
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
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    return onServiceWorkerUpdate((reload) => setUpdateReload(() => reload));
  }, []);

  async function onLogout() {
    setMenuOpen(false);
    await logout();
    navigate('/login');
  }

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="sticky top-0 z-40 border-b border-bark-900/40 bg-gradient-to-b from-bark-700 via-bark-700 to-bark-800 text-stone-50 shadow-lift">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:py-3">
          <Link to="/tree" className="group flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="grid h-10 w-10 place-items-center rounded-lg bg-bark-50/10 font-serif text-2xl text-bark-100 ring-1 ring-bark-200/30 transition-transform group-hover:rotate-[-2deg]"
            >
              譜
            </span>
            <div className="min-w-0">
              <div className="truncate font-serif text-base font-semibold leading-tight tracking-wide sm:text-lg">
                {vi.appName}
              </div>
              <div className="truncate text-[11px] text-bark-100/80 sm:text-xs">
                {vi.appTagline}
              </div>
            </div>
          </Link>

          <nav
            aria-label={vi.nav.primary}
            className="hidden items-center gap-1 text-sm md:flex"
          >
            <NavTab to="/tree" label={vi.nav.tree} />
            <NavTab to="/persons" label={vi.nav.persons} />
            {hasRole(user, 'admin') && <NavTab to="/admin" label={vi.nav.admin} />}
          </nav>

          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-bark-100/80 md:inline">
              {user?.username} · {user?.role}
            </span>
            <button
              type="button"
              className="hidden rounded-lg border border-bark-400/40 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-bark-800/40 md:inline-flex"
              onClick={onLogout}
            >
              {vi.nav.logout}
            </button>
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-lg border border-bark-400/40 transition-colors hover:bg-bark-800/40 md:hidden"
              aria-label={vi.nav.menu}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen((o) => !o)}
            >
              <MenuIcon open={menuOpen} />
            </button>
          </div>
        </div>

        <div
          aria-hidden="true"
          className="h-px w-full bg-gradient-to-r from-transparent via-bark-300/60 to-transparent"
        />
        {!online && (
          <div className="bg-amber-200 text-amber-900">
            <div className="mx-auto max-w-6xl px-4 py-1 text-center text-xs">
              {vi.common.offlineBanner}
            </div>
          </div>
        )}
        {updateReload && (
          <div className="bg-emerald-100 text-emerald-900">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-1.5 text-xs">
              <span>Có bản cập nhật mới của ứng dụng.</span>
              <button
                type="button"
                className="rounded-md border border-emerald-700/50 px-2 py-0.5 transition-colors hover:bg-emerald-200"
                onClick={() => updateReload()}
              >
                Tải lại
              </button>
            </div>
          </div>
        )}
      </header>

      <div
        id="mobile-menu"
        className={`${menuOpen ? 'block' : 'hidden'} border-b border-stone-200 bg-white md:hidden`}
      >
        <div className="mx-auto max-w-6xl space-y-1 px-4 py-3">
          <div className="text-xs text-stone-500">
            {user?.username} · {user?.role}
          </div>
          <button
            type="button"
            className="btn-secondary mt-2 w-full justify-center"
            onClick={onLogout}
          >
            {vi.nav.logout}
          </button>
        </div>
      </div>

      <main className="flex-1 pb-24 md:pb-0">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:py-6">{children}</div>
      </main>

      <nav
        aria-label={vi.nav.quickNav}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 backdrop-blur-md shadow-lift md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          <BottomTab to="/tree" label={vi.nav.tree}>
            <TreeIcon />
          </BottomTab>
          <BottomTab to="/persons" label={vi.nav.persons}>
            <ListIcon />
          </BottomTab>
          {hasRole(user, 'admin') && (
            <BottomTab to="/admin" label={vi.nav.admin}>
              <AdminIcon />
            </BottomTab>
          )}
        </div>
      </nav>
    </div>
  );
}

function NavTab({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `rounded-lg px-3 py-1.5 transition-colors ${
          isActive
            ? 'bg-bark-800/40 text-stone-50'
            : 'text-bark-50/90 hover:bg-bark-800/30'
        }`
      }
    >
      {label}
    </NavLink>
  );
}

function BottomTab({
  to,
  label,
  children,
}: {
  to: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <NavLink
      to={to}
      aria-label={label}
      className={({ isActive }) =>
        `flex flex-1 flex-col items-center gap-0.5 px-2 py-2.5 text-[12px] font-medium transition-colors ${
          isActive ? 'text-bark-700' : 'text-stone-500 hover:text-stone-800'
        }`
      }
    >
      {children}
    </NavLink>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {open ? (
        <>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </>
      ) : (
        <>
          <line x1="3" y1="7" x2="21" y2="7" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="17" x2="21" y2="17" />
        </>
      )}
    </svg>
  );
}

function TreeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="4" r="2" />
      <circle cx="5" cy="20" r="2" />
      <circle cx="19" cy="20" r="2" />
      <path d="M12 6v6m0 0H5v6m7-6h7v6" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="4" cy="6" r="1" />
      <circle cx="4" cy="12" r="1" />
      <circle cx="4" cy="18" r="1" />
    </svg>
  );
}

function AdminIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" />
    </svg>
  );
}
