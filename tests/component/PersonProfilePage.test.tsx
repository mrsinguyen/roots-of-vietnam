import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PersonProfilePage from '../../frontend/src/pages/PersonProfilePage';
import { AuthProvider } from '../../frontend/src/context/AuthContext';
import { ToastProvider } from '../../frontend/src/context/ToastContext';

const apiMocks = vi.hoisted(() => ({
  getPerson: vi.fn(),
  uploadMedia: vi.fn(),
  deleteMedia: vi.fn(),
  deletePerson: vi.fn(),
  me: vi.fn(),
}));

vi.mock('../../frontend/src/lib/api', async () => {
  const real = await vi.importActual<typeof import('../../frontend/src/lib/api')>(
    '../../frontend/src/lib/api',
  );
  return { ApiError: real.ApiError, api: apiMocks };
});

vi.mock('../../frontend/src/lib/offlineCache', () => ({
  cachePerson: vi.fn(async () => undefined),
  readPerson: vi.fn(async () => null),
}));

function personFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    fullName: 'Nguyễn Văn A',
    nameNormalized: 'nguyen van a',
    honorific: 'Cụ',
    gender: 'Nam',
    birthYear: 1900,
    birthMonth: 3,
    birthDay: 12,
    deathYear: 1972,
    deathMonth: 8,
    deathDay: 4,
    birthDateLunar: 'Canh Tý',
    deathDateLunar: null,
    biography: 'Tiểu sử mẫu',
    occupation: 'Nông gia',
    burialPlace: 'Quê nhà',
    notes: 'Một vài ghi chú',
    generation: 4,
    branchId: null,
    fatherId: null,
    motherId: null,
    createdAt: '',
    updatedAt: '',
    father: null,
    mother: null,
    branch: null,
    media: [],
    childrenAsFather: [],
    childrenAsMother: [],
    marriagesAsHusband: [],
    marriagesAsWife: [],
    ...overrides,
  };
}

beforeEach(() => {
  Object.values(apiMocks).forEach((m) => 'mockReset' in m && (m as ReturnType<typeof vi.fn>).mockReset());
  apiMocks.me.mockResolvedValue({ user: { id: 'u', username: 'admin', role: 'admin' } });
  localStorage.clear();
  localStorage.setItem(
    'roots.user.v1',
    JSON.stringify({ id: 'u', username: 'admin', role: 'admin' }),
  );
});

function wrap(id = 'p1') {
  return (
    <MemoryRouter initialEntries={[`/persons/${id}`]}>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/persons/:id" element={<PersonProfilePage />} />
            <Route path="/persons" element={<div>list-page</div>} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('<PersonProfilePage />', () => {
  it('renders the header with honorific + Vietnamese ordinal', async () => {
    apiMocks.getPerson.mockResolvedValue(personFixture());
    render(wrap());
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Cụ Nguyễn Văn A'),
    );
    expect(screen.getByText(/Đời thứ 4/)).toBeInTheDocument();
  });

  it('wraps the generation ordinal in a heritage seal element', async () => {
    apiMocks.getPerson.mockResolvedValue(personFixture());
    render(wrap());
    const ordinal = await screen.findByText(/Đời thứ 4/);
    // The stylized "dấu triện" frame is signalled by the `.seal` class on the
    // ordinal element — guards the editorial design from regressing back to a
    // plain chip.
    expect(ordinal.classList.contains('seal')).toBe(true);
  });

  it('renders biography, burial place, and notes when present', async () => {
    apiMocks.getPerson.mockResolvedValue(personFixture());
    render(wrap());
    await waitFor(() => expect(screen.getByText('Tiểu sử mẫu')).toBeInTheDocument());
    expect(screen.getByText('Quê nhà')).toBeInTheDocument();
    expect(screen.getByText('Một vài ghi chú')).toBeInTheDocument();
  });

  it('renders the lunar birth date when set', async () => {
    apiMocks.getPerson.mockResolvedValue(personFixture());
    render(wrap());
    await waitFor(() => expect(screen.getByText('Canh Tý')).toBeInTheDocument());
  });

  it('renders 404 message when the API says not found', async () => {
    apiMocks.getPerson.mockRejectedValue(
      Object.assign(new Error('Không tìm thấy nhân vật'), { status: 404 }),
    );
    render(wrap('missing'));
    await waitFor(() => expect(screen.getByText('Không tìm thấy')).toBeInTheDocument());
  });

  it('renders the lineage breadcrumb with the parent name', async () => {
    apiMocks.getPerson
      .mockResolvedValueOnce(
        personFixture({
          father: { id: 'p0', fullName: 'Thủy tổ' },
          fatherId: 'p0',
          generation: 2,
        }),
      )
      .mockResolvedValueOnce(personFixture({ id: 'p0', fullName: 'Thủy tổ', generation: 1 }));
    render(wrap());
    await waitFor(() => {
      const links = screen.getAllByRole('link', { name: 'Thủy tổ' });
      expect(links.length).toBeGreaterThan(0);
    });
  });

  it('renders a photo gallery and the upload button when admin', async () => {
    apiMocks.getPerson.mockResolvedValue(
      personFixture({
        media: [
          {
            id: 'm1',
            personId: 'p1',
            filePath: '/uploads/x.png',
            type: 'image',
            caption: 'Ảnh',
            createdAt: '',
          },
        ],
      }),
    );
    render(wrap());
    await waitFor(() => expect(screen.getByAltText('Ảnh')).toBeInTheDocument());
    expect(screen.getByText('Tải lên hình/tài liệu')).toBeInTheDocument();
  });

  it('renders a PDF media tile (non-image branch)', async () => {
    apiMocks.getPerson.mockResolvedValue(
      personFixture({
        media: [
          {
            id: 'pdf1',
            personId: 'p1',
            filePath: '/uploads/a.pdf',
            type: 'pdf',
            caption: null,
            createdAt: '',
          },
        ],
      }),
    );
    render(wrap());
    await waitFor(() => expect(screen.getByText('PDF')).toBeInTheDocument());
  });
});
