import { getUser } from '@/lib/supabase/server';
import { getPlan, getProfile } from '@/lib/db/queries';
import { getCreditBalance } from '@/lib/modules/reels/queries';
import { StudioClient } from '@/components/reels/StudioClient';
import { isLanguageCode } from '@/lib/modules/reels/languages';
import type { LanguageCode } from '@/lib/modules/reels/types';

export default async function StudioPage() {
  const user = await getUser();
  if (!user) {
    return <StudioClient plan="free" credits={0} defaultLanguage="hi" handle={null} />;
  }
  const [plan, credits, profile] = await Promise.all([
    getPlan(user.id),
    getCreditBalance(user.id),
    getProfile(user.id),
  ]);
  const def = profile?.default_language;
  const defaultLanguage: LanguageCode = def && isLanguageCode(def) ? def : 'hi';
  return (
    <StudioClient
      plan={plan}
      credits={credits}
      defaultLanguage={defaultLanguage}
      handle={profile?.handle ?? null}
    />
  );
}
