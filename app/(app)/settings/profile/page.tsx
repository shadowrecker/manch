import { redirect } from 'next/navigation';
import { getUser } from '@/lib/supabase/server';
import { getProfile } from '@/lib/db/queries';
import { ProfileForm } from '@/components/ProfileForm';
import { AvatarUpload } from '@/components/AvatarUpload';
import { WhatsappLinkForm } from '@/components/post/WhatsappLinkForm';
import { ChangePassword } from '@/components/auth/ChangePassword';

// Account profile: editable details shared by every module, plus linking the
// WhatsApp number the one Manch bot recognises. Sign out lives in the account
// menu (top-right avatar).
export default async function ProfilePage() {
  const user = await getUser();
  if (!user) redirect('/login');
  const profile = await getProfile(user.id);

  return (
    <>
      <AvatarUpload initialUrl={profile?.avatar_url ?? null} name={profile?.full_name ?? user.email ?? null} />
      <ProfileForm
        email={user.email ?? user.phone ?? null}
        initial={{
          full_name: profile?.full_name ?? '',
          headline: profile?.headline ?? '',
          handle: profile?.handle ?? '',
          default_language: profile?.default_language ?? '',
          hindi_output: profile?.hindi_output ?? false,
        }}
      />
      <WhatsappLinkForm initial={profile?.whatsapp_e164 ?? null} />
      <ChangePassword />
      <div className="card">
        <h2>Sign out</h2>
        <p className="muted">Signs you out on this browser.</p>
        <form action="/auth/signout" method="post">
          <button type="submit" className="btn ghost sm">
            Sign out
          </button>
        </form>
      </div>
    </>
  );
}
