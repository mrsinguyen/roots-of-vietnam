import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TreePage from '../../frontend/src/pages/TreePage';
import { AuthProvider } from '../../frontend/src/context/AuthContext';
import { ToastProvider } from '../../frontend/src/context/ToastContext';

const apiMocks = vi.hoisted(() => ({
  getTree: vi.fn(),
  getPerson: vi.fn(),
  me: vi.fn(),
}));

vi.mock('../../frontend/src/lib/api', async () => {
  const real = await vi.importActual<typeof import('../../frontend/src/lib/api')>(
    '../../frontend/src/lib/api',
  );
  return { ApiError: real.ApiError, api: apiMocks };
});

const offlineMocks = vi.hoisted(() => ({
  cacheTree: vi.fn(),
  readTree: vi.fn(),
}));
vi.mock('../../frontend/src/lib/offlineCache', () => offlineMocks);

// react-d3-tree is aliased to tests/helpers/reactD3TreeStub.tsx via vitest
// config so we never load the real d3-zoom SVG internals.
import { captured as treeProps } from '../helpers/reactD3TreeStub';

function makePerson(id: string, fullName: string, generation: number, fatherId: string | null = null) {
  return {
    id,
    fullName,
    nameNormalized: fullName.toLowerCase(),
    honorific: null,
    gender: 'Nam' as const,
    birthYear: null,
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
    generation,
    branchId: null,
    fatherId,
    motherId: null,
    createdAt: '',
    updatedAt: '',
    marriagesAsHusband: [],
    marriagesAsWife: [],
  };
}

beforeEach(() => {
  Object.values(apiMocks).forEach((m) => 'mockReset' in m && (m as ReturnType<typeof vi.fn>).mockReset());
  offlineMocks.cacheTree.mockResolvedValue(undefined);
  offlineMocks.readTree.mockResolvedValue(null);
  apiMocks.me.mockResolvedValue({ user: { id: 'u', username: 'admin', role: 'admin' } });
  localStorage.clear();
  localStorage.setItem(
    'roots.user.v1',
    JSON.stringify({ id: 'u', username: 'admin', role: 'admin' }),
  );
});

function wrap(initial = '/tree') {
  return (
    <MemoryRouter initialEntries={[initial]}>
      <ToastProvider>
        <AuthProvider>
          <TreePage />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('<TreePage />', () => {
  it('renders the title, orientation toggle, and root selector', () => {
    apiMocks.getTree.mockResolvedValue({ items: [] });
    render(wrap());
    expect(screen.getByText('Cây gia phả')).toBeInTheDocument();
    expect(screen.getByText('Dọc')).toBeInTheDocument();
    expect(screen.getByText('Ngang')).toBeInTheDocument();
    expect(screen.getByText(/Chọn gốc/)).toBeInTheDocument();
  });

  it('shows the empty hint when no persons are loaded', async () => {
    apiMocks.getTree.mockResolvedValue({ items: [] });
    render(wrap());
    await waitFor(() =>
      expect(screen.getByText(/Chọn một nhân vật làm gốc/)).toBeInTheDocument(),
    );
  });

  it('passes built tree data and a node renderer to react-d3-tree', async () => {
    apiMocks.getTree.mockResolvedValue({
      items: [
        makePerson('r', 'Thủy tổ', 1),
        makePerson('c1', 'Con cả', 2, 'r'),
        makePerson('c2', 'Con thứ', 2, 'r'),
      ],
    });
    render(wrap());
    await waitFor(() => expect(screen.getByTestId('tree-stub')).toBeInTheDocument());
    expect(treeProps.current?.data).toMatchObject({ name: 'Thủy tổ' });
    expect(typeof treeProps.current?.renderCustomNodeElement).toBe('function');
  });

  it('toggles orientation between vertical and horizontal', async () => {
    apiMocks.getTree.mockResolvedValue({ items: [makePerson('r', 'R', 1)] });
    render(wrap());
    await waitFor(() => expect(screen.getByTestId('tree-stub')).toBeInTheDocument());
    expect(treeProps.current?.orientation).toBe('vertical');
    fireEvent.click(screen.getByText('Ngang'));
    await waitFor(() => expect(treeProps.current?.orientation).toBe('horizontal'));
    fireEvent.click(screen.getByText('Dọc'));
    await waitFor(() => expect(treeProps.current?.orientation).toBe('vertical'));
  });

  it('switches root via the dropdown', async () => {
    apiMocks.getTree.mockResolvedValue({
      items: [makePerson('a', 'A', 1), makePerson('b', 'B', 1)],
    });
    render(wrap());
    await waitFor(() => expect(screen.getByTestId('tree-stub')).toBeInTheDocument());
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'b' } });
    await waitFor(() => expect(treeProps.current?.data).toMatchObject({ name: 'B' }));
  });

  it('falls back to the cached tree when the API request fails', async () => {
    apiMocks.getTree.mockRejectedValue(
      Object.assign(new Error('Không kết nối được máy chủ'), { status: 0 }),
    );
    offlineMocks.readTree.mockResolvedValue([makePerson('r', 'Tổ', 1)]);
    render(wrap());
    await waitFor(() => expect(treeProps.current?.data).toMatchObject({ name: 'Tổ' }));
  });

  it('honors the ?root URL param', async () => {
    apiMocks.getTree.mockResolvedValue({
      items: [makePerson('a', 'A', 1), makePerson('b', 'B', 1)],
    });
    render(wrap('/tree?root=b'));
    await waitFor(() => expect(treeProps.current?.data).toMatchObject({ name: 'B' }));
  });
});
