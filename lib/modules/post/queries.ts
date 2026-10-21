import { createAdminClient } from '@/lib/supabase/admin';
import type { VoiceProfileRow } from '@/lib/db/types';

// Post-specific, server-only queries. Account + metering helpers (getProfile,
// getPlan, getProfileByWhatsapp, getUsage(userId,'posts'), incrementUsage)
// live in the shared core @/lib/db/queries.

export async function getActiveVoiceProfile(userId: string): Promise<VoiceProfileRow | null> {
  const sb = createAdminClient();
  const { data } = await sb
    .from('voice_profiles')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  return data;
}
