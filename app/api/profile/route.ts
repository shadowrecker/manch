import { NextResponse } from 'next/server';
import { createClient, getUser } from '@/lib/supabase/server';
import { profileUpdateSchema } from '@/lib/profile';
import { captureException } from '@/lib/observability';
import type { ApiError } from '@/lib/types';

// PATCH /api/profile — update the signed-in user's own profile fields.
//   Body: any of { full_name, headline, handle, default_language, hindi_output }
//   -> 200 { profile } | 400 invalid | 401 signed out | 500
// Uses the RLS-scoped server client, so a user can only ever touch their own
// row; unknown keys (plan, whatsapp_e164, id…) are rejected by the strict schema
// and also blocked by the guard_profile_plan trigger.
export async function PATCH(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json<ApiError>({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    const msg = parsed.success ? 'Nothing to update' : parsed.error.issues[0]?.message ?? 'Invalid profile';
    return NextResponse.json<ApiError>({ error: msg, code: 'invalid_profile' }, { status: 400 });
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('profiles')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', user.id)
    .select('full_name, headline, handle, default_language, hindi_output')
    .single();
  if (error) {
    captureException(error, { route: 'PATCH /api/profile', userId: user.id });
    return NextResponse.json<ApiError>({ error: 'Could not save your profile.' }, { status: 500 });
  }
  return NextResponse.json({ profile: data });
}
