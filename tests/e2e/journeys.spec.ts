// E2E user journeys. Each `test.describe` is a separate journey from test.md.
// One DB + server pair is shared across the file for speed; specs that mutate
// observable state run sequentially.

import { test, expect } from '@playwright/test';
import { setupServers, teardownServers, type E2EHandles } from './_setup';

let handles: E2EHandles;

test.beforeAll(async () => {
  handles = await setupServers({ seed: true });
});

test.afterAll(async () => {
  if (handles) await teardownServers(handles);
});

test.describe.configure({ mode: 'serial' });

async function login(
  page: import('@playwright/test').Page,
  username = 'admin',
  password = 'changeme',
) {
  await page.goto(`http://localhost:${handles.frontendPort}/login`);
  await page.locator('input#username').fill(username);
  await page.locator('input#password').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL(/\/tree$/);
}

test.describe('admin onboarding journey', () => {
  test('logs in and lands on the tree page with rendered nodes', async ({ page }) => {
    await login(page);
    await expect(page.getByText('Cây gia phả').first()).toBeVisible();
    // 22 seeded persons, depth-3 collapse — expect a non-empty count.
    await page.waitForSelector('.rd3t-node', { timeout: 10_000 });
    const count = await page.locator('.rd3t-node').count();
    expect(count).toBeGreaterThan(0);
  });

  test('can navigate to the person list and see the seed family', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'Danh sách' }).click();
    await page.waitForURL(/\/persons/);
    await expect(page.getByText(/nhân vật/)).toBeVisible();
  });
});

test.describe('diacritic-insensitive search journey', () => {
  test('finds "Nguyễn Văn Thái" by typing without diacritics', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'Danh sách' }).click();
    await page.waitForURL(/\/persons/);
    await page.getByPlaceholder(/Tìm theo họ tên/).fill('nguyen van thai');
    await expect(page.getByText('Nguyễn Văn Thái').first()).toBeVisible();
  });
});

test.describe('role boundary journey', () => {
  test('viewer cannot see the admin tab', async ({ page, request }) => {
    // Create a viewer through the admin-authenticated API path so we don't
    // have to expose a registration UI just for tests.
    const adminLogin = await request.post(
      `http://localhost:${handles.backendPort}/api/auth/login`,
      { data: { username: 'admin', password: 'changeme' } },
    );
    const cookie = adminLogin.headers()['set-cookie']!;
    await request.post(`http://localhost:${handles.backendPort}/api/users`, {
      data: { username: 'viewer_e2e', password: 'longenoughpw1', role: 'viewer' },
      headers: { cookie },
    });
    await login(page, 'viewer_e2e', 'longenoughpw1');
    await expect(page.getByRole('link', { name: 'Quản trị' })).toHaveCount(0);
  });
});

test.describe('backup admin journey', () => {
  test('creates a backup file from the admin page', async ({ page }) => {
    await login(page);
    await page.goto(`http://localhost:${handles.frontendPort}/admin`);
    await page.getByRole('button', { name: 'Sao lưu ngay' }).click();
    await expect(page.getByText(/backup-/)).toBeVisible({ timeout: 10_000 });
  });
});
