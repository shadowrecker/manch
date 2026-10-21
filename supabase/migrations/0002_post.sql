-- =========================================================================
-- Manch Post (LinkedIn personal brand) — module schema. Requires 0001_core.
-- =========================================================================

create table if not exists public.voice_profiles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  industry      text not null,
  seniority     text not null,
  topics        text[] not null default '{}',
  tone          text not null,
  writing_sample text,
  style_guide   text,
  style_guide_model text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- one active profile per user
create unique index if not exists voice_profiles_one_active
  on public.voice_profiles(user_id) where is_active;

create table if not exists public.drafts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  source           text not null,
  input_text       text,
  transcription_id uuid references public.transcriptions(id) on delete set null,
  angle            text not null check (angle in ('story','insight','opinion')),
  body             text not null,
  watermarked      boolean not null default true,
  ai_labelled      boolean not null default true,
  gen_request_id   uuid not null,
  model            text not null,
  status           text not null default 'draft'
                    check (status in ('draft','scheduled','published','discarded')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists drafts_user_created on public.drafts(user_id, created_at desc);
create index if not exists drafts_gen_request on public.drafts(gen_request_id);

create table if not exists public.published_posts (
  id            uuid primary key default gen_random_uuid(),
  draft_id      uuid not null references public.drafts(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  platform      text not null default 'linkedin',
  external_id   text,
  scheduled_for timestamptz,
  published_at  timestamptz,
  status        text not null default 'scheduled'
                 check (status in ('scheduled','published','failed')),
  error         text,
  created_at    timestamptz not null default now()
);

create table if not exists public.audits (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  linkedin_url  text not null,
  data_source   text not null,
  scores        jsonb not null,
  overall       int not null,
  fixes         jsonb not null,
  share_id      text unique,
  is_makeover   boolean not null default false,
  created_at    timestamptz not null default now()
);

create table if not exists public.linkedin_tokens (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  access_token  text not null,
  refresh_token text,
  member_urn    text,
  expires_at    timestamptz,
  scopes        text[],
  created_at    timestamptz not null default now()
);

drop trigger if exists touch_voice_profiles on public.voice_profiles;
create trigger touch_voice_profiles before update on public.voice_profiles
  for each row execute function public.touch_updated_at();
drop trigger if exists touch_drafts on public.drafts;
create trigger touch_drafts before update on public.drafts
  for each row execute function public.touch_updated_at();

-- Row-Level Security
alter table public.voice_profiles   enable row level security;
alter table public.drafts           enable row level security;
alter table public.published_posts  enable row level security;
alter table public.audits           enable row level security;
alter table public.linkedin_tokens  enable row level security;

create policy "own voice_profiles" on public.voice_profiles
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own drafts" on public.drafts
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own published_posts" on public.published_posts
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own audits" on public.audits
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Public audit share cards are readable by anyone (only when share_id set).
create policy "public audit share" on public.audits
  for select to anon using (share_id is not null);

-- linkedin_tokens has NO policies → service-role only (OAuth tokens).
