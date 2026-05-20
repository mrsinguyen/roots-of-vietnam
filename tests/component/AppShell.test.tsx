import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
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

  it('exposes the mobile menu toggle with aria-expanded that flips on click', () => {
    render(wrap());
    const toggle = screen.getByRole('button', { name: 'Mở thực đơn' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'mobile-menu');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders an accessible bottom navigation for quick mobile access', () => {
    render(wrap());
    const quickNav = screen.getByRole('navigation', { name: 'Điều hướng nhanh' });
    expect(quickNav).toBeInTheDocument();
    // Bottom-tab icons advertise their target via aria-label, not visible text,
    // so primary nav text only appears once in the desktop nav.
    const treeLinks = screen.getAllByRole('link', { name: 'Cây gia phả' });
    expect(treeLinks.length).toBeGreaterThanOrEqual(2);
  });

  it('hides the admin quick-nav entry for non-admin users', () => {
    localStorage.setItem(
      'roots.user.v1',
      JSON.stringify({ id: 'u', username: 'v', role: 'viewer' }),
    );
    render(wrap());
    const quickNav = screen.getByRole('navigation', { name: 'Điều hướng nhanh' });
    // The admin link should be absent from the bottom nav for viewers.
    const adminLinks = screen.queryAllByRole('link', { name: 'Quản trị' });
    expect(adminLinks).toHaveLength(0);
    expect(quickNav).toBeInTheDocument();
  });
});
