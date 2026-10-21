import { test, expect } from '@playwright/test';

// Manch Deals (formerly CreatorStack AI) — public surface. Renders without
// backend env: the landing and login pages are static, and the authed (app)
// layout redirects to /login when no Supabase session can exist.
// Ported from creatorstack-ai/tests/e2e/public.spec.ts.

test('landing presents Manch Deals and its pricing tiers', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Manch Deals/i })).toBeVisible();
  await expect(page.getByText(/Media kit, brand matches, fair rates and paid deals/i)).toBeVisible();
  // Deals' creator tier is sold as the Manch Plus plan (₹149).
  await expect(page.getByText('Plus').first()).toBeVisible();
  await expect(page.getByText(/₹149/).first()).toBeVisible();
});

test('the 5% commission promise is on the landing page', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/5%/).first()).toBeVisible();
});

test('login page renders the Manch brand and sign-in', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByText('Manch').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /Welcome to Manch/i })).toBeVisible();
});

for (const path of ['/deals', '/deals/media-kit', '/deals/matches', '/deals/rates', '/deals/pipeline']) {
  test(`${path} requires sign-in`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  });
}
