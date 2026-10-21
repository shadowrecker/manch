import { test, expect } from '@playwright/test';

// Manch Check — e2e (ported from trustcheck-ai/tests/e2e/public.spec.ts).
// TrustCheck's own landing + login pages are owned by the Manch core now, so the
// public assertions target the Manch landing; module pages sit behind the
// (app) auth guard and must redirect to the shared /login.

test('landing carries the fact-check humility line (signals and sources, not a ruling)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/Fact-checks show signals and sources/i)).toBeVisible();
});

test('landing presents the Check module', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Manch Check/i })).toBeVisible();
});

test('login page renders the Manch brand and sign-in (one sign-in for Check too)', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByText('Manch').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /Welcome to Manch/i })).toBeVisible();
});

for (const path of ['/check', '/check/history', '/check/api-console']) {
  test(`${path} is behind the auth guard (redirects to /login)`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  });
}

test('newsroom API rejects a request without an API key (401)', async ({ request }) => {
  const res = await request.post('/api/check', { data: { type: 'text', content: 'is the upi tax real?' } });
  expect(res.status()).toBe(401);
});
