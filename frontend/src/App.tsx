import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useOnline } from './lib/useOnline';
import { getLastSyncedAt } from './lib/offlineCache';
import { vi } from './locales/vi';
import LoginPage from './pages/LoginPage';
import TreePage from './pages/TreePage';
import PersonListPage from './pages/PersonListPage';
import PersonProfilePage from './pages/PersonProfilePage';
import PersonEditPage from './pages/PersonEditPage';
import AdminPage from './pages/AdminPage';
import AuditLogPage from './pages/AuditLogPage';
import AppShell from './components/AppShell';

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  const online = useOnline();
  const [primed, setPrimed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getLastSyncedAt().then((iso) => {
      if (!cancelled) setPrimed(iso !== null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || primed === null) {
    return (
      <div className="flex h-screen items-center justify-center text-stone-500">
        {vi.common.loading}
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!online && !primed) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-bark-50 px-6 text-center">
        <div className="card max-w-md p-6">
          <div className="mb-2 font-serif text-4xl text-bark-600">譜</div>
          <h1 className="text-lg font-semibold">Cần kết nối lần đầu</h1>
          <p className="mt-2 text-sm text-stone-600">
            Lần đầu mở ứng dụng cần kết nối mạng để tải dữ liệu gia phả. Sau đó bạn có
            thể dùng ngoại tuyến.
          </p>
        </div>
      </div>
    );
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <AppShell>
              <Routes>
                <Route index element={<Navigate to="/tree" replace />} />
                <Route path="tree" element={<TreePage />} />
                <Route path="persons" element={<PersonListPage />} />
                <Route path="persons/new" element={<PersonEditPage />} />
                <Route path="persons/:id" element={<PersonProfilePage />} />
                <Route path="persons/:id/edit" element={<PersonEditPage />} />
                <Route path="admin" element={<AdminPage />} />
                <Route path="admin/audit" element={<AuditLogPage />} />
                <Route path="*" element={<Navigate to="/tree" replace />} />
              </Routes>
            </AppShell>
          </RequireAuth>
        }
      />
    </Routes>
  );
}
