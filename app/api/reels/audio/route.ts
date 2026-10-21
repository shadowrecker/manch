import { NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import { getTrendingAudio } from '@/lib/modules/reels/queries';
import { isLanguageCode } from '@/lib/modules/reels/languages';
import type { ApiError } from '@/lib/types';

// GET /api/reels/audio?language=hi&region=  -> curated trending audio.
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json<ApiError>({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const language = searchParams.get('language') ?? '';
  if (!isLanguageCode(language)) {
    return NextResponse.json<ApiError>({ error: 'invalid_language' }, { status: 400 });
  }
  const region = searchParams.get('region') || undefined;
  const audio = await getTrendingAudio(language, region);
  return NextResponse.json({ language, region: region ?? null, audio });
}
