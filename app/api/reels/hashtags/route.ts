import { NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import { getHashtagSet } from '@/lib/modules/reels/queries';
import { isLanguageCode } from '@/lib/modules/reels/languages';
import { PLATFORMS } from '@/lib/modules/reels/types';
import type { ApiError } from '@/lib/types';
import type { Platform } from '@/lib/modules/reels/types';

// GET /api/reels/hashtags?language=hi&platform=instagram
// Returns the latest CURATED 30-hashtag set (high/mid/niche) or { tags: null }.
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json<ApiError>({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const language = searchParams.get('language') ?? '';
  if (!isLanguageCode(language)) {
    return NextResponse.json<ApiError>({ error: 'invalid_language' }, { status: 400 });
  }
  const platformParam = (searchParams.get('platform') ?? 'instagram') as Platform;
  const platform: Platform = PLATFORMS.includes(platformParam) ? platformParam : 'instagram';

  const tags = await getHashtagSet(language, platform);
  return NextResponse.json({ language, platform, tags });
}
