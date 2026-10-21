import { test, expect } from '@playwright/test';

// Manch Post (formerly Folio AI) — public-surface E2E. Ported from Folio's
// tests/e2e/public.spec.ts + smoke.spec.ts. Landing + login are now the shared
// Manch shells (covered in core.spec.ts), so these assert the Post-specific
// parts of them plus the Post routes. Everything here renders WITHOUT backend
// env: authed pages redirect to /login, APIs answer 401, and the public score
// page short-circuits on a malformed share id before touching Supabase.
// Authed flows (onboarding → generate → drafts) need Supabase/Anthropic keys
// and a signed-in session; add those once env is wired.

test.describe('Post on the public landing page', () => {
  test('presents Manch Post with its voice-note → LinkedIn pitch', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Manch Post' })).toBeVisible();
    await expect(page.getByText(/LinkedIn posts in your voice/i).first()).toBeVisible();
    await expect(page.getByText('LinkedIn · X')).toBeVisible();
  });

  test('advertises the Post limits on the plan ladder (Free 4 posts, Plus 20 posts)', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/4 LinkedIn posts/i).first()).toBeVisible();
    await expect(page.getByText(/20 LinkedIn posts/i).first()).toBeVisible();
    // Plus — the old Folio "Solo" tier — is the featured consumer plan.
    await expect(page.getByText('₹149').first()).toBeVisible();
  });

  test('the primary CTA routes to /login', async ({ page }) => {
    await page.goto('/');
    const cta = page.getByRole('link', { name: /Start free/i }).first();
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', /\/login$/);
    await cta.click();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('public login page', () => {
  test('shows the Manch brand and a sign-in affordance', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('Manch').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible();
  });
});

test.describe('Post routes (signed out)', () => {
  test('every Post page and Team settings redirect to /login', async ({ page }) => {
    for (const path of [
      '/post',
      '/post/generate',
      '/post/audit',
      '/post/drafts',
      '/post/onboarding',
      '/settings/team',
      '/settings/team/accept?token=abc',
    ]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test('Post APIs reject unauthenticated calls with 401', async ({ request }) => {
    const post = (path: string, data: unknown) => request.post(path, { data });
    expect((await post('/api/post/generate', { inputText: 'hi' })).status()).toBe(401);
    expect((await post('/api/post/audit', { profileText: 'hi' })).status()).toBe(401);
    expect((await post('/api/post/schedule', { draftId: 'd1' })).status()).toBe(401);
    expect((await post('/api/post/voice-profile', {})).status()).toBe(401);
    expect((await post('/api/post/whatsapp-number', { whatsapp: '' })).status()).toBe(401);
    expect((await post('/api/team/invite', { email: 'a@b.co' })).status()).toBe(401);
    expect((await request.get('/api/post/drafts')).status()).toBe(401);
    expect((await request.get('/api/team')).status()).toBe(401);
  });

  test('the QStash workers reject unsigned jobs with 401', async ({ request }) => {
    for (const path of ['/api/post/jobs/generate', '/api/post/jobs/publish']) {
      const res = await request.post(path, { data: { waMessageId: 'x' } });
      expect(res.status()).toBe(401);
    }
  });
});

test.describe('public Manch Score share page', () => {
  test('an invalid share link shows "Score not found" with a CTA, in the Post palette', async ({ page }) => {
    await page.goto('/score/not-a-real-id');
    await expect(page.getByRole('heading', { name: /Score not found/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Get my Manch Score/i })).toHaveAttribute('href', '/login');
    await expect(page.locator('[data-module="post"]').first()).toBeVisible();
  });
});
