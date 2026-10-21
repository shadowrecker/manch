import crypto from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { randomId } from '@/lib/utils';
import type { ApiKeyRow } from '@/lib/db/types';

// Newsroom API-lite key auth (PRD §7.5). Keys are stored HASHED — the raw key is
// shown once at issuance and never persisted.

export function generateApiKey(): string {
  return `tck_${randomId(24)}`;
}

export function hashApiKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/** Resolve a raw API key to its active record, or null. */
export async function verifyApiKey(raw: string): Promise<ApiKeyRow | null> {
  if (!raw) return null;
  const sb = createAdminClient();
  const { data } = await sb.from('api_keys').select('*').eq('key_hash', hashApiKey(raw)).eq('active', true).maybeSingle();
  return data;
}

/** Pull the key from `Authorization: Bearer …` or `x-api-key`. */
export function extractApiKey(req: Request): string | null {
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
  return req.headers.get('x-api-key');
}
