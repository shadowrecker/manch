'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { PROFILE_LANGUAGES } from '@/lib/profile';
import type { ApiError } from '@/lib/types';

export interface ProfileFields {
  full_name: string;
  headline: string;
  handle: string;
  default_language: string;
  hindi_output: boolean;
}

// Edit the shared account profile (used by every module: your name on posts
// and media kits, your handle on Reels, your default language for Reels and
// fact-check replies). Saves via PATCH /api/profile.
export function ProfileForm({ initial, email }: { initial: ProfileFields; email: string | null }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof ProfileFields>(key: K, value: ProfileFields[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = (await res.json().catch(() => ({}))) as ApiError;
      if (!res.ok) {
        toast(data.error ?? 'Could not save your profile');
        return;
      }
      toast('Profile saved ✓');
      router.refresh(); // the account menu shows the new name
    } catch {
      toast('Network error — please try again');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={save}>
      <h1>Your profile</h1>
      <p className="sub">Shared across Post, Reels, Deals and Check.</p>

      <label htmlFor="pf-email">Signed in as</label>
      <input id="pf-email" value={email ?? ''} disabled />

      <div className="grid2">
        <div>
          <label htmlFor="pf-name">Full name</label>
          <input id="pf-name" value={form.full_name} maxLength={80} onChange={(e) => set('full_name', e.target.value)} placeholder="Asha Kumar" />
        </div>
        <div>
          <label htmlFor="pf-handle">Creator handle</label>
          <input id="pf-handle" value={form.handle} maxLength={40} onChange={(e) => set('handle', e.target.value)} placeholder="@asha.cooks" />
        </div>
      </div>

      <label htmlFor="pf-headline">Professional headline</label>
      <input
        id="pf-headline"
        value={form.headline}
        maxLength={160}
        onChange={(e) => set('headline', e.target.value)}
        placeholder="Product manager · fintech · building for Bharat"
      />

      <div className="grid2">
        <div>
          <label htmlFor="pf-lang">Default language</label>
          <select id="pf-lang" value={form.default_language} onChange={(e) => set('default_language', e.target.value)}>
            <option value="">Not set</option>
            {PROFILE_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          <p className="hint">Used for Reels scripts and fact-check replies.</p>
        </div>
        <div>
          <label htmlFor="pf-hindi">LinkedIn posts in Hindi</label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 500, color: 'var(--ink)' }}>
            <input
              id="pf-hindi"
              type="checkbox"
              style={{ width: 'auto' }}
              checked={form.hindi_output}
              onChange={(e) => set('hindi_output', e.target.checked)}
            />
            Also draft my Post content in Hindi
          </label>
        </div>
      </div>

      <div className="row" style={{ marginTop: 18 }}>
        <button type="submit" className="btn" disabled={busy}>
          {busy ? (
            <>
              <Spinner /> Saving…
            </>
          ) : (
            'Save profile'
          )}
        </button>
      </div>
    </form>
  );
}
