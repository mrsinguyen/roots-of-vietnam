import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProfileDrawer from '../../frontend/src/components/ProfileDrawer';
import { ToastProvider } from '../../frontend/src/context/ToastContext';

const apiMocks = vi.hoisted(() => ({ getPerson: vi.fn() }));
vi.mock('../../frontend/src/lib/api', async () => {
  const real = await vi.importActual<typeof import('../../frontend/src/lib/api')>(
    '../../frontend/src/lib/api',
  );
  return { ApiError: real.ApiError, api: apiMocks };
});

beforeEach(() => {
  apiMocks.getPerson.mockReset();
});

function basePerson(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    fullName: 'Nguyễn Văn A',
    nameNormalized: 'nguyen van a',
    honorific: null,
    gender: 'Nam',
    birthYear: 1900,
    birthMonth: null,
    birthDay: null,
    deathYear: 1970,
    deathMonth: null,
    deathDay: null,
    birthDateLunar: null,
    deathDateLunar: null,
    biography: null,
    occupation: 'Nông gia',
    burialPlace: null,
    notes: null,
    generation: 1,
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

function wrap(personId: string | null = 'p1', onClose: () => void = () => undefined) {
  return (
    <MemoryRouter>
      <ToastProvider>
        <ProfileDrawer personId={personId} onClose={onClose} />
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('<ProfileDrawer />', () => {
  it('renders nothing drawer-related when personId is null', () => {
    render(wrap(null));
    expect(screen.queryByText('Đóng')).not.toBeInTheDocument();
  });

  it('renders the loaded person with Vietnamese ordinal', async () => {
    apiMocks.getPerson.mockResolvedValue(basePerson());
    render(wrap('p1'));
    await waitFor(() => expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument());
    expect(screen.getByText('Đời thứ 1')).toBeInTheDocument();
    expect(screen.getByText('Nông gia')).toBeInTheDocument();
  });

  it('shows "Chưa rõ" for both parents when neither is set', async () => {
    apiMocks.getPerson.mockResolvedValue(basePerson());
    render(wrap('p1'));
    await waitFor(() => expect(screen.getAllByText('Chưa rõ').length).toBeGreaterThanOrEqual(2));
  });

  it('renders father, mother, spouses, and children when present', async () => {
    apiMocks.getPerson.mockResolvedValue(
      basePerson({
        father: { id: 'f1', fullName: 'Cha A' },
        mother: { id: 'm1', fullName: 'Mẹ A' },
        marriagesAsHusband: [{ id: 'mar1', wife: { id: 'w1', fullName: 'Vợ A' } }],
        marriagesAsWife: [],
        childrenAsFather: [{ id: 'c1', fullName: 'Con A' }],
        childrenAsMother: [],
      }),
    );
    render(wrap('p1'));
    await waitFor(() => expect(screen.getByText('Cha A')).toBeInTheDocument());
    expect(screen.getByText('Mẹ A')).toBeInTheDocument();
    expect(screen.getByText('Vợ A')).toBeInTheDocument();
    expect(screen.getByText('Con A')).toBeInTheDocument();
  });

  it('renders branch name when person has one', async () => {
    apiMocks.getPerson.mockResolvedValue(basePerson({ branch: { id: 'b1', name: 'Trưởng tộc' } }));
    render(wrap('p1'));
    await waitFor(() => expect(screen.getByText('Trưởng tộc')).toBeInTheDocument());
  });

  it('shows a Vietnamese error when the API call fails', async () => {
    const { ApiError } = await import('../../frontend/src/lib/api');
    apiMocks.getPerson.mockRejectedValue(new ApiError('Không tìm thấy nhân vật', 404));
    render(wrap('p1'));
    await waitFor(() => expect(screen.getByText('Không tìm thấy nhân vật')).toBeInTheDocument());
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    apiMocks.getPerson.mockResolvedValue(basePerson());
    render(wrap('p1', onClose));
    await waitFor(() => screen.getByText('Đóng'));
    fireEvent.click(screen.getByText('Đóng'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('exposes the "Xem từ người này" re-root link', async () => {
    apiMocks.getPerson.mockResolvedValue(basePerson());
    render(wrap('p1'));
    await waitFor(() => screen.getByText('Xem từ người này'));
    expect(screen.getByText('Xem từ người này').getAttribute('href')).toBe('/tree?root=p1');
  });
});
