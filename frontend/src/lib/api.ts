// API client. All requests include credentials so the auth cookie is sent.

import type {
  AuthMeResponse,
  Branch,
  LoginRequest,
  Marriage,
  Media,
  Person,
  PersonListResponse,
  PersonWithRelations,
  Role,
} from '@roots/shared';

const BASE = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers, credentials: 'include' });
  } catch {
    throw new ApiError('Không kết nối được máy chủ', 0);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : `HTTP ${res.status}`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export const api = {
  login: (body: LoginRequest) =>
    request<{ user: { id: string; username: string; role: Role } }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  me: () => request<AuthMeResponse>('/api/auth/me'),

  listPersons: (params: Record<string, string | number | undefined> = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') qs.set(k, String(v));
    }
    const suffix = qs.toString();
    return request<PersonListResponse>(`/api/persons${suffix ? `?${suffix}` : ''}`);
  },
  getPerson: (id: string) => request<PersonWithRelations>(`/api/persons/${id}`),
  getTree: () =>
    request<{
      items: Array<
        Person & {
          marriagesAsHusband: Array<{ id: string; wifeId: string; marriageDate: string | null }>;
          marriagesAsWife: Array<{ id: string; husbandId: string; marriageDate: string | null }>;
        }
      >;
    }>('/api/persons/tree'),
  createPerson: (body: Partial<Person>) =>
    request<Person>('/api/persons', { method: 'POST', body: JSON.stringify(body) }),
  updatePerson: (id: string, body: Partial<Person>) =>
    request<Person>(`/api/persons/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deletePerson: (id: string) =>
    request<{ ok: true }>(`/api/persons/${id}`, { method: 'DELETE' }),

  listBranches: () => request<{ items: Branch[] }>('/api/branches'),
  createBranch: (body: { name: string; description?: string }) =>
    request<Branch>('/api/branches', { method: 'POST', body: JSON.stringify(body) }),

  createMarriage: (body: { husbandId: string; wifeId: string; marriageDate?: string }) =>
    request<Marriage>('/api/marriages', { method: 'POST', body: JSON.stringify(body) }),
  deleteMarriage: (id: string) =>
    request<{ ok: true }>(`/api/marriages/${id}`, { method: 'DELETE' }),

  uploadMedia: (personId: string, file: File, caption?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (caption) form.append('caption', caption);
    return request<Media>(`/api/media/${personId}`, { method: 'POST', body: form });
  },
  deleteMedia: (id: string) => request<{ ok: true }>(`/api/media/${id}`, { method: 'DELETE' }),

  createBackup: () =>
    request<{ filename: string; counts: Record<string, number> }>('/api/backup', { method: 'POST' }),
  createMediaZip: () =>
    request<{ filename: string; sizeBytes: number | null }>('/api/backup/media-zip', {
      method: 'POST',
    }),
  listBackups: () =>
    request<{ items: Array<{ filename: string; sizeBytes: number; createdAt: string }> }>(
      '/api/backup',
    ),

  listUsers: () =>
    request<{
      items: Array<{ id: string; username: string; role: Role; createdAt: string }>;
    }>('/api/users'),
  createUser: (body: { username: string; password: string; role: Role }) =>
    request<{ id: string; username: string; role: Role }>('/api/users', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateUser: (id: string, body: { password?: string; role?: Role }) =>
    request<{ id: string; username: string; role: Role }>(`/api/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  listAudit: (params: { limit?: number; offset?: number; action?: string } = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
    return request<{
      items: Array<{
        id: string;
        action: string;
        targetType: string | null;
        targetId: string | null;
        diff: unknown;
        createdAt: string;
        userId: string | null;
        username: string | null;
      }>;
      total: number;
    }>(`/api/audit${qs.toString() ? `?${qs}` : ''}`);
  },
};
