import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AuditLogPage from '../../frontend/src/pages/AuditLogPage';
import { AuthProvider } from '../../frontend/src/context/AuthContext';
import { ToastProvider } from '../../frontend/src/context/ToastContext';

const apiMocks = vi.hoisted(() => ({
  listAudit: vi.fn(),
  me: vi.fn(),
}));

vi.mock('../../frontend/src/lib/api', async () => {
  const real = await vi.importActual<typeof import('../../frontend/src/lib/api')>(
    '../../frontend/src/lib/api',
  );
  return { ApiError: real.ApiError, api: apiMocks };
});

beforeEach(() => {
  apiMocks.listAudit.mockReset();
  apiMocks.me.mockResolvedValue({ user: { id: 'u', username: 'admin', role: 'admin' } });
  localStorage.clear();
  localStorage.setItem(
    'roots.user.v1',
    JSON.stringify({ id: 'u', username: 'admin', role: 'admin' }),
  );
});

function wrap() {
  return (
    <MemoryRouter>
      <ToastProvider>
        <AuthProvider>
          <AuditLogPage />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('<AuditLogPage />', () => {
  it('renders an empty state when the API returns no rows', async () => {
    apiMocks.listAudit.mockResolvedValue({ items: [], total: 0 });
    render(wrap());
    await waitFor(() => expect(screen.getByText('Chưa có dữ liệu')).toBeInTheDocument());
  });

  it('renders one row per audit entry', async () => {
    apiMocks.listAudit.mockResolvedValue({
      items: [
        {
          id: 'a1',
          action: 'person.create',
          targetType: 'Person',
          targetId: 'p1',
          diff: { after: { fullName: 'X' } },
          createdAt: new Date().toISOString(),
          userId: 'u',
          username: 'admin',
        },
      ],
      total: 1,
    });
    render(wrap());
    await waitFor(() => expect(screen.getByText('person.create')).toBeInTheDocument());
    expect(screen.getByText('admin')).toBeInTheDocument();
  });

  it('blocks non-admin users with a Vietnamese forbidden message', async () => {
    apiMocks.me.mockResolvedValue({ user: { id: 'u', username: 'v', role: 'viewer' } });
    localStorage.setItem(
      'roots.user.v1',
      JSON.stringify({ id: 'u', username: 'v', role: 'viewer' }),
    );
    render(wrap());
    await waitFor(() => expect(screen.getByText('Bạn không có quyền')).toBeInTheDocument());
  });
});
