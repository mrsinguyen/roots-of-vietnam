import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppShell from '../../frontend/src/components/AppShell';
import { AuthProvider } from '../../frontend/src/context/AuthContext';
import { ToastProvider } from '../../frontend/src/context/ToastContext';

vi.mock('../../frontend/src/lib/api', () => ({
  ApiError: class extends Error {},
  api: {
    me: vi.fn(async () => ({ user: { id: 'u', username: 'admin', role: 'admin' } })),
    logout: vi.fn(async () => ({ ok: true })),
  },
}));
vi.mock('../../frontend/src/lib/registerSW', () => ({
  onServiceWorkerUpdate: vi.fn(() => () => undefined),
}));

beforeEach(() => {
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
          <AppShell>
            <div>page-body</div>
          </AppShell>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('<AppShell />', () => {
  it('renders the Vietnamese brand and tabs', () => {
    render(wrap());
    expect(screen.getByText('Gia Phả Việt')).toBeInTheDocument();
    expect(screen.getByText('Cây gia phả')).toBeInTheDocument();
    expect(screen.getByText('Danh sách')).toBeInTheDocument();
  });

  it('shows the offline banner when navigator goes offline', () => {
    render(wrap());
    expect(screen.queryByText(/ngoại tuyến/i)).not.toBeInTheDocument();
    act(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByText(/bộ nhớ đệm/)).toBeInTheDocument();
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
  });

  it('does not show the admin tab for non-admin users', () => {
    localStorage.setItem(
      'roots.user.v1',
      JSON.stringify({ id: 'u', username: 'v', role: 'viewer' }),
    );
    render(wrap());
    expect(screen.queryByText('Quản trị')).not.toBeInTheDocument();
  });
});
