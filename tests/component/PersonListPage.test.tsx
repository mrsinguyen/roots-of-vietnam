import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PersonListPage from '../../frontend/src/pages/PersonListPage';
import { AuthProvider } from '../../frontend/src/context/AuthContext';
import { ToastProvider } from '../../frontend/src/context/ToastContext';

const listPersons = vi.fn();
const listBranches = vi.fn();

vi.mock('../../frontend/src/lib/api', async () => {
  const real = await vi.importActual<typeof import('../../frontend/src/lib/api')>(
    '../../frontend/src/lib/api',
  );
  return {
    ApiError: real.ApiError,
    api: {
      listPersons: (...args: unknown[]) => listPersons(...args),
      listBranches: () => listBranches(),
      me: vi.fn(async () => ({ user: { id: 'u', username: 'admin', role: 'admin' as const } })),
    },
  };
});

beforeEach(() => {
  listPersons.mockReset();
  listBranches.mockReset();
  listBranches.mockResolvedValue({ items: [{ id: 'b1', name: 'Trưởng tộc' }] });
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
          <PersonListPage />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('<PersonListPage />', () => {
  it('renders the list and total count', async () => {
    listPersons.mockResolvedValueOnce({
      items: [
        {
          id: 'p1',
          fullName: 'Nguyễn Văn A',
          nameNormalized: 'nguyen van a',
          honorific: null,
          gender: 'Nam',
          birthYear: 1900,
          birthMonth: null,
          birthDay: null,
          deathYear: null,
          deathMonth: null,
          deathDay: null,
          birthDateLunar: null,
          deathDateLunar: null,
          biography: null,
          occupation: null,
          burialPlace: null,
          notes: null,
          generation: 1,
          branchId: null,
          fatherId: null,
          motherId: null,
          createdAt: '',
          updatedAt: '',
        },
      ],
      total: 1,
    });
    render(wrap());
    await waitFor(() => expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument());
    expect(screen.getByText('1 nhân vật')).toBeInTheDocument();
  });

  it('shows the empty-state row when no persons match', async () => {
    listPersons.mockResolvedValueOnce({ items: [], total: 0 });
    render(wrap());
    await waitFor(() => expect(screen.getByText('Chưa có dữ liệu')).toBeInTheDocument());
  });

  it('debounces search input → only one trailing request per idle window', async () => {
    vi.useFakeTimers();
    listPersons.mockResolvedValue({ items: [], total: 0 });
    render(wrap());
    // Initial load fires once.
    await vi.runOnlyPendingTimersAsync();
    const initialCalls = listPersons.mock.calls.length;
    const input = screen.getByPlaceholderText(/Tìm theo họ tên/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'n' } });
    fireEvent.change(input, { target: { value: 'ng' } });
    fireEvent.change(input, { target: { value: 'nguyen' } });
    // Less than the 300ms window: no new request.
    await vi.advanceTimersByTimeAsync(299);
    expect(listPersons.mock.calls.length).toBe(initialCalls);
    // Past the debounce window: exactly one new request.
    await vi.advanceTimersByTimeAsync(2);
    expect(listPersons.mock.calls.length).toBe(initialCalls + 1);
    vi.useRealTimers();
  });
});
