import { redirect } from 'next/navigation';
import { getUser } from '@/lib/supabase/server';
import { getProfile } from '@/lib/db/queries';
import { getActiveVoiceProfile } from '@/lib/modules/post/queries';
import { OnboardingWizard } from '@/components/post/OnboardingWizard';
import { WhatsappLinkForm } from '@/components/post/WhatsappLinkForm';
import type { VoiceProfileInput } from '@/lib/modules/post/types';

// Voice Profile Setup (PRD F-06). Server component: loads the user and any
// existing active voice profile, then hands a client wizard the initial values
// so returning users can edit instead of starting over. Also where users link
// their WhatsApp number (Home links here) so voice notes reach Post.
export default async function OnboardingPage() {
  const user = await getUser();
  if (!user) redirect('/login');

  const [existing, profile] = await Promise.all([getActiveVoiceProfile(user.id), getProfile(user.id)]);

  const initial: VoiceProfileInput | null = existing
    ? {
        industry: existing.industry,
        seniority: existing.seniority,
        topics: existing.topics ?? [],
        tone: existing.tone,
        writingSample: existing.writing_sample ?? '',
      }
    : null;

  return (
    <>
      <div className="card">
        <h1>Turn your work week into your LinkedIn brand</h1>
        <p className="sub">
          In 10 minutes, in your voice. Set up your voice profile once — every draft sounds like you.
        </p>
      </div>
      <OnboardingWizard initial={initial} />
      <WhatsappLinkForm initial={profile?.whatsapp_e164 ?? null} />
    </>
  );
}
