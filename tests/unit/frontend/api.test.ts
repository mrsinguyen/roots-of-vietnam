import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../../../frontend/src/lib/api';

function mockFetch(impl: typeof fetch): void {
  vi.stubGlobal('fetch', impl);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('api client', () => {
  it('login posts JSON and returns the user', async () => {
    let captured: { method?: string; body?: string } = {};
    mockFetch(async (_input, init) => {
      captured = {
        method: init?.method,
        body: typeof init?.body === 'string' ? init.body : undefined,
      };
      return jsonResponse(200, { user: { id: 'u1', username: 'a', role: 'admin' } });
    });
    const res = await api.login({ username: 'a', password: 'p' });
    expect(captured.method).toBe('POST');
    expect(captured.body).toBe(JSON.stringify({ username: 'a', password: 'p' }));
    expect(res.user.username).toBe('a');
  });

  it('throws ApiError with the server-provided Vietnamese message', async () => {
    mockFetch(async () => jsonResponse(401, { error: 'Tên đăng nhập hoặc mật khẩu không đúng' }));
    await expect(api.login({ username: 'x', password: 'y' })).rejects.toMatchObject({
      message: 'Tên đăng nhập hoặc mật khẩu không đúng',
      status: 401,
    });
  });

  it('reports status 0 on a network failure', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(api.me()).rejects.toMatchObject({ status: 0 });
  });

  it('serializes query params for listPersons', async () => {
    let url = '';
    mockFetch(async (input) => {
      url = String(input);
      return jsonResponse(200, { items: [], total: 0 });
    });
    await api.listPersons({ q: 'lan', generation: 3 });
    expect(url).toContain('q=lan');
    expect(url).toContain('generation=3');
  });

  it('drops undefined / empty params from the query string', async () => {
    let url = '';
    mockFetch(async (input) => {
      url = String(input);
      return jsonResponse(200, { items: [], total: 0 });
    });
    await api.listPersons({ q: '', generation: undefined });
    expect(url).not.toContain('q=');
    expect(url).not.toContain('generation=');
  });

  it('uploadMedia sends multipart form data', async () => {
    let body: FormData | null = null;
    mockFetch(async (_input, init) => {
      body = init?.body as FormData;
      return jsonResponse(201, { id: 'm1' });
    });
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    await api.uploadMedia('p1', file, 'caption');
    expect(body?.get('caption')).toBe('caption');
    expect(body?.get('file')).toBeInstanceOf(File);
  });

  it('uploadMedia omits caption when undefined', async () => {
    let body: FormData | null = null;
    mockFetch(async (_input, init) => {
      body = init?.body as FormData;
      return jsonResponse(201, { id: 'm1' });
    });
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    await api.uploadMedia('p1', file);
    expect(body?.has('caption')).toBe(false);
  });

  it('parses null when response is HTTP 204', async () => {
    mockFetch(async () => new Response(null, { status: 204 }));
    await expect(api.deleteMedia('m1')).resolves.toBeUndefined();
  });

  it('wraps non-JSON error bodies with the HTTP code', async () => {
    mockFetch(async () =>
      new Response('Internal Server Error', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      }),
    );
    await expect(api.me()).rejects.toThrow();
  });

  it('ApiError carries the status code', () => {
    const e = new ApiError('boom', 418);
    expect(e.status).toBe(418);
    expect(e.message).toBe('boom');
  });

  it('logout POSTs and resolves to the OK shape', async () => {
    mockFetch(async () => jsonResponse(200, { ok: true }));
    await expect(api.logout()).resolves.toEqual({ ok: true });
  });

  it('me returns the user payload', async () => {
    mockFetch(async () => jsonResponse(200, { user: { id: 'u', username: 'a', role: 'admin' } }));
    const r = await api.me();
    expect(r.user.id).toBe('u');
  });

  it('getPerson fetches by id', async () => {
    let url = '';
    mockFetch(async (input) => {
      url = String(input);
      return jsonResponse(200, { id: 'p1', fullName: 'X' });
    });
    await api.getPerson('p1');
    expect(url).toContain('/api/persons/p1');
  });

  it('getTree returns items', async () => {
    mockFetch(async () => jsonResponse(200, { items: [] }));
    const r = await api.getTree();
    expect(r.items).toEqual([]);
  });

  it('createPerson POSTs the body', async () => {
    let captured: { method?: string; body?: string } = {};
    mockFetch(async (_input, init) => {
      captured = {
        method: init?.method,
        body: typeof init?.body === 'string' ? init.body : undefined,
      };
      return jsonResponse(201, { id: 'p1' });
    });
    await api.createPerson({ fullName: 'X', gender: 'Nam' });
    expect(captured.method).toBe('POST');
    expect(captured.body).toContain('X');
  });

  it('updatePerson PATCHes the body', async () => {
    let method = '';
    mockFetch(async (_input, init) => {
      method = init?.method ?? '';
      return jsonResponse(200, { id: 'p1' });
    });
    await api.updatePerson('p1', { occupation: 'Y' });
    expect(method).toBe('PATCH');
  });

  it('deletePerson DELETEs', async () => {
    let method = '';
    mockFetch(async (_input, init) => {
      method = init?.method ?? '';
      return jsonResponse(200, { ok: true });
    });
    await api.deletePerson('p1');
    expect(method).toBe('DELETE');
  });

  it('listBranches / createBranch round-trips', async () => {
    mockFetch(async () => jsonResponse(200, { items: [] }));
    expect((await api.listBranches()).items).toEqual([]);
    mockFetch(async () => jsonResponse(201, { id: 'b1', name: 'B', description: null }));
    const b = await api.createBranch({ name: 'B' });
    expect(b.name).toBe('B');
  });

  it('createMarriage / deleteMarriage round-trip', async () => {
    mockFetch(async () =>
      jsonResponse(201, { id: 'mar1', husbandId: 'h', wifeId: 'w', marriageDate: null }),
    );
    await api.createMarriage({ husbandId: 'h', wifeId: 'w' });
    mockFetch(async () => jsonResponse(200, { ok: true }));
    await api.deleteMarriage('mar1');
  });

  it('createBackup / listBackups / createMediaZip', async () => {
    mockFetch(async () => jsonResponse(200, { filename: 'b.json', counts: {} }));
    await api.createBackup();
    mockFetch(async () => jsonResponse(200, { items: [] }));
    await api.listBackups();
    mockFetch(async () => jsonResponse(200, { filename: 'm.zip', sizeBytes: 100 }));
    await api.createMediaZip();
  });

  it('listUsers / createUser / updateUser', async () => {
    mockFetch(async () => jsonResponse(200, { items: [] }));
    await api.listUsers();
    mockFetch(async () => jsonResponse(201, { id: 'u1', username: 'a', role: 'viewer' }));
    await api.createUser({ username: 'a', password: 'longenoughpw1', role: 'viewer' });
    mockFetch(async () => jsonResponse(200, { id: 'u1', username: 'a', role: 'editor' }));
    await api.updateUser('u1', { role: 'editor' });
  });

  it('listAudit serializes params', async () => {
    let url = '';
    mockFetch(async (input) => {
      url = String(input);
      return jsonResponse(200, { items: [], total: 0 });
    });
    await api.listAudit({ limit: 50, action: 'person.create' });
    expect(url).toContain('limit=50');
    expect(url).toContain('action=person.create');
  });
});
