import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminPage from '../../frontend/src/pages/AdminPage';
import { AuthProvider } from '../../frontend/src/context/AuthContext';
import { ToastProvider } from '../../frontend/src/context/ToastContext';

const apiMocks = vi.hoisted(() => ({
  createBackup: vi.fn(),
  createMediaZip: vi.fn(),
  listBackups: vi.fn(),
  listUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  me: vi.fn(),
}));

vi.mock('../../frontend/src/lib/api', async () => {
  const real = await vi.importActual<typeof import('../../frontend/src/lib/api')>(
    '../../frontend/src/lib/api',
  );
  return { ApiError: real.ApiError, api: apiMocks };
});

beforeEach(() => {
  Object.values(apiMocks).forEach((m) => 'mockReset' in m && (m as ReturnType<typeof vi.fn>).mockReset());
  apiMocks.listBackups.mockResolvedValue({ items: [] });
  apiMocks.listUsers.mockResolvedValue({ items: [] });
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
          <AdminPage />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('<AdminPage />', () => {
  it('renders the backup and users sections for admin', async () => {
    render(wrap());
    await waitFor(() => expect(screen.getByText('Sao lưu dữ liệu')).toBeInTheDocument());
    expect(screen.getByText('Người dùng')).toBeInTheDocument();
  });

  it('calls createBackup when the "Sao lưu ngay" button is clicked', async () => {
    apiMocks.createBackup.mockResolvedValue({
      filename: 'backup-x.json',
      counts: { persons: 1 },
    });
    render(wrap());
    await waitFor(() => screen.getByRole('button', { name: 'Sao lưu ngay' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sao lưu ngay' }));
    await waitFor(() => expect(apiMocks.createBackup).toHaveBeenCalledTimes(1));
  });

  it('shows the forbidden screen for non-admin users', async () => {
    apiMocks.me.mockResolvedValue({ user: { id: 'u', username: 'v', role: 'viewer' } });
    localStorage.setItem(
      'roots.user.v1',
      JSON.stringify({ id: 'u', username: 'v', role: 'viewer' }),
    );
    render(wrap());
    await waitFor(() => expect(screen.getByText('Bạn không có quyền')).toBeInTheDocument());
  });
});
