import { test, expect } from '@playwright/test';

// Manch Reels (formerly Bhasha Studio) — public surface. Runs without backend
// env: the landing, login and the public languages API render statically, and
// the authed /reels/* pages redirect to /login.

test('landing presents Manch Reels, its 8 languages, and Reels in the pricing', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Manch Reels' })).toBeVisible();
  await expect(page.getByText(/Reel scripts, captions, hashtags and trending audio in 8 Indian languages/)).toBeVisible();
  await expect(page.getByText(/Hindi, Tamil, Telugu, Marathi, Bengali, Kannada, Gujarati or Punjabi/)).toBeVisible();
  // Pricing: Reels quotas are part of the one Manch plan.
  await expect(page.getByText(/Reel scripts in 8 Indian languages/)).toBeVisible();
  await expect(page.getByText('MOST POPULAR')).toBeVisible();
});

test('public languages API lists the 8 native-script Reels languages', async ({ request }) => {
  const res = await request.get('/api/reels/languages');
  expect(res.ok()).toBeTruthy();
  const { languages } = (await res.json()) as { languages: { code: string; nativeName: string }[] };
  expect(languages.map((l) => l.code)).toEqual(['hi', 'ta', 'te', 'mr', 'bn', 'kn', 'gu', 'pa']);
  expect(languages.map((l) => l.nativeName)).toEqual(expect.arrayContaining(['हिन्दी', 'தமிழ்', 'ગુજરાતી']));
});

test('login page renders the Manch brand and sign-in', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByText('Manch').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /Welcome to Manch/i })).toBeVisible();
});

test('Reels studio is behind sign-in', async ({ page }) => {
  await page.goto('/reels/studio');
  await expect(page).toHaveURL(/\/login/);
});
