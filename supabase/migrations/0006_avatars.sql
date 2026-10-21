-- =========================================================================
-- Manch — profile pictures. Requires 0001_core.
-- Images live in the public `avatars` Storage bucket at <user_id>/<random>.webp
-- and are written ONLY by the server (app/api/profile/avatar, service role),
-- which validates the file first — so no storage write policies are needed.
-- =========================================================================

alter table public.profiles add column if not exists avatar_url text;

-- Public read (avatars appear in the UI), 2 MB cap, images only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- avatar_url is server-managed too (set only by the upload API after it has
-- validated the image): extend the profile guard so a user can't point it at
-- an arbitrary external URL through the anon key.
create or replace function public.guard_profile_plan()
returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), 'service_role') <> 'service_role' then
    if new.plan is distinct from old.plan then
      raise exception 'plan is managed by billing' using errcode = '42501';
    end if;
    -- A number may only be linked by proving ownership over WhatsApp (LINK code).
    if new.whatsapp_e164 is distinct from old.whatsapp_e164 then
      raise exception 'whatsapp number must be verified over WhatsApp' using errcode = '42501';
    end if;
    if new.avatar_url is distinct from old.avatar_url then
      raise exception 'profile picture is set via the upload API' using errcode = '42501';
    end if;
  end if;
  return new;
end; $$;
