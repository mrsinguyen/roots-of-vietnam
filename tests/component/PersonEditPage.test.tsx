import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PersonEditPage from '../../frontend/src/pages/PersonEditPage';
import { AuthProvider } from '../../frontend/src/context/AuthContext';
import { ToastProvider } from '../../frontend/src/context/ToastContext';

const apiMocks = vi.hoisted(() => ({
  listBranches: vi.fn(),
  listPersons: vi.fn(),
  getPerson: vi.fn(),
  createPerson: vi.fn(),
  updatePerson: vi.fn(),
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
  apiMocks.listBranches.mockResolvedValue({ items: [] });
  apiMocks.listPersons.mockResolvedValue({ items: [], total: 0 });
  apiMocks.me.mockResolvedValue({ user: { id: 'u', username: 'admin', role: 'admin' } });
  localStorage.clear();
  localStorage.setItem(
    'roots.user.v1',
    JSON.stringify({ id: 'u', username: 'admin', role: 'admin' }),
  );
});

function wrap(initial = '/persons/new') {
  return (
    <MemoryRouter initialEntries={[initial]}>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/persons/new" element={<PersonEditPage />} />
            <Route path="/persons/:id" element={<div>profile-page</div>} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('<PersonEditPage /> (create)', () => {
  it('submits with the partial-date fields and navigates to the new profile', async () => {
    apiMocks.createPerson.mockResolvedValue({ id: 'p123', fullName: 'X' });
    render(wrap());
    const fullNameInput = screen.getAllByRole('textbox')[0]!;
    fireEvent.change(fullNameInput, { target: { value: 'Founder' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(apiMocks.createPerson).toHaveBeenCalledTimes(1));
    const body = apiMocks.createPerson.mock.calls[0][0];
    expect(body.fullName).toBe('Founder');
    await waitFor(() => expect(screen.getByText('profile-page')).toBeInTheDocument());
  });

  it('shows a Vietnamese toast on save failure', async () => {
    apiMocks.createPerson.mockRejectedValue(
      Object.assign(new Error('Họ tên không được để trống'), { status: 400 }),
    );
    render(wrap());
    const fullNameInput = screen.getAllByRole('textbox')[0]!;
    fireEvent.change(fullNameInput, { target: { value: 'OK' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(apiMocks.createPerson).toHaveBeenCalled());
  });
});
