import { getUser } from '@/lib/supabase/server';
import { getProfile } from '@/lib/db/queries';
import { AudioClient } from '@/components/reels/AudioClient';
import { isLanguageCode } from '@/lib/modules/reels/languages';
import type { LanguageCode } from '@/lib/modules/reels/types';

export default async function AudioPage() {
  const user = await getUser();
  const profile = user ? await getProfile(user.id) : null;
  const def = profile?.default_language;
  const lang: LanguageCode = def && isLanguageCode(def) ? def : 'hi';
  return <AudioClient defaultLanguage={lang} />;
}
