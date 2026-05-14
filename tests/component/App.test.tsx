import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../../frontend/src/App';
import { AuthProvider } from '../../frontend/src/context/AuthContext';
import { ToastProvider } from '../../frontend/src/context/ToastContext';

vi.mock('../../frontend/src/lib/api', () => ({
  ApiError: class extends Error {},
  api: {
    me: vi.fn(async () => {
      throw Object.assign(new Error('Chưa đăng nhập'), { status: 401 });
    }),
    logout: vi.fn(async () => ({ ok: true })),
  },
}));
vi.mock('../../frontend/src/lib/registerSW', () => ({
  onServiceWorkerUpdate: vi.fn(() => () => undefined),
}));
vi.mock('../../frontend/src/lib/offlineCache', () => ({
  getLastSyncedAt: vi.fn(async () => null),
}));

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
});

function wrap(initial = '/') {
  return (
    <MemoryRouter initialEntries={[initial]}>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('<App />', () => {
  it('redirects an unauthenticated user to /login', async () => {
    render(wrap('/'));
    await waitFor(() => expect(screen.getByText('Đăng nhập gia phả')).toBeInTheDocument());
  });

  it('shows the cold-start gate when offline and never synced', async () => {
    localStorage.setItem(
      'roots.user.v1',
      JSON.stringify({ id: 'u', username: 'a', role: 'admin' }),
    );
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    render(wrap('/'));
    await waitFor(() =>
      expect(screen.getByText('Cần kết nối lần đầu')).toBeInTheDocument(),
    );
  });
});
