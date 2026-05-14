import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import LoginPage from '../../frontend/src/pages/LoginPage';
import { AuthProvider } from '../../frontend/src/context/AuthContext';
import { ToastProvider } from '../../frontend/src/context/ToastContext';

// Mock the api module so tests don't issue real fetch.
vi.mock('../../frontend/src/lib/api', async () => {
  const { ApiError } = await vi.importActual<typeof import('../../frontend/src/lib/api')>(
    '../../frontend/src/lib/api',
  );
  return {
    ApiError,
    api: {
      login: vi.fn(async ({ password }: { username: string; password: string }) => {
        if (password === 'right') {
          return { user: { id: 'u1', username: 'admin', role: 'admin' as const } };
        }
        throw new ApiError('Tên đăng nhập hoặc mật khẩu không đúng', 401);
      }),
      me: vi.fn(async () => {
        throw new ApiError('Chưa đăng nhập', 401);
      }),
      logout: vi.fn(async () => ({ ok: true as const })),
    },
  };
});

function wrap(initial = '/login') {
  return (
    <MemoryRouter initialEntries={[initial]}>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/tree" element={<div>tree-page</div>} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  // Each test gets a fresh localStorage so AuthProvider starts clean.
  localStorage.clear();
});

describe('<LoginPage />', () => {
  it('renders Vietnamese labels and button', () => {
    render(wrap());
    expect(screen.getByText('Đăng nhập gia phả')).toBeInTheDocument();
    expect(screen.getByLabelText('Tên đăng nhập')).toBeInTheDocument();
    expect(screen.getByLabelText('Mật khẩu')).toBeInTheDocument();
  });

  it('blocks submit when fields empty (HTML required)', () => {
    render(wrap());
    const form = screen.getByRole('button', { name: 'Đăng nhập' }).closest('form')!;
    expect(form.checkValidity()).toBe(false);
  });

  it('navigates to /tree on successful login', async () => {
    render(wrap());
    fireEvent.change(screen.getByLabelText('Tên đăng nhập'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'right' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    await waitFor(() => expect(screen.getByText('tree-page')).toBeInTheDocument());
  });

  it('shows a Vietnamese toast on wrong credentials', async () => {
    render(wrap());
    fireEvent.change(screen.getByLabelText('Tên đăng nhập'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    await waitFor(() =>
      expect(screen.getByText('Tên đăng nhập hoặc mật khẩu không đúng')).toBeInTheDocument(),
    );
  });
});
