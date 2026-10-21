import { NextResponse } from 'next/server';
import { LANGUAGES } from '@/lib/modules/reels/languages';

// GET /api/reels/languages — the Reels launch languages (public). Static: mirrors
// the `languages` rows with reels_enabled = true (supabase/migrations/0001_core.sql).
export async function GET() {
  return NextResponse.json({
    languages: LANGUAGES.map((l) => ({
      code: l.code,
      name: l.name,
      nativeName: l.nativeName,
      script: l.script,
    })),
  });
}
