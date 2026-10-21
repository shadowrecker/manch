import { test, expect } from '@playwright/test';

// Shared public surface — renders without backend env.

test('landing presents all four modules as one product', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Your stage/i })).toBeVisible();
  for (const m of ['Manch Post', 'Manch Reels', 'Manch Deals', 'Manch Check']) {
    await expect(page.getByRole('heading', { name: m })).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: /One plan unlocks all four/i })).toBeVisible();
  await expect(page.getByText('₹149').first()).toBeVisible();
});

test('login offers one sign-in for every module', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /Welcome to Manch/i })).toBeVisible();
  await expect(page.getByText(/Post, Reels, Deals and Check/)).toBeVisible();
});

test('authed areas redirect to login when signed out', async ({ page }) => {
  for (const path of ['/home', '/post/generate', '/reels/studio', '/deals', '/check', '/settings/billing']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
});

test('auth callback without a code returns to login (no open redirect)', async ({ page }) => {
  await page.goto('/auth/callback?next=//evil.com');
  await expect(page).toHaveURL(/\/login/);
});
