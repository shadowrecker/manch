-- =========================================================================
-- Manch — core schema (Supabase / Postgres). Shared by every module:
-- accounts, teams, billing, metering, WhatsApp, languages, analytics outbox.
-- Module tables live in 0002_post … 0005_check. Run the files in order.
-- All timestamps UTC. Money in paise. RLS on every table.
-- =========================================================================

create extension if not exists pgcrypto;
create extension if not exists vector;   -- pgvector (Deals brand match, Check corpus)

-- ---------------------------------------------------------------------------
-- Accounts + teams
-- ---------------------------------------------------------------------------

-- profiles extends auth.users (1:1). team_id FK added after teams exists.
create table if not exists public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  full_name        text,
  headline         text,                 -- Post: LinkedIn headline
  handle           text,                 -- Reels: creator handle
  plan             text not null default 'free'
                    check (plan in ('free','plus','pro','team','brand','newsroom','telco','grant')),
  team_id          uuid,
  whatsapp_e164    text unique,
  hindi_output     boolean not null default false,
  default_language text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- One team model for Post "Team" seats and Reels "Agency" brand presets.
create table if not exists public.teams (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  owner_id      uuid not null references public.profiles(id) on delete restrict,
  brand_voice   text,
  seats         int not null default 10,
  created_at    timestamptz not null default now()
);

alter table public.profiles drop constraint if exists profiles_team_id_fkey;
alter table public.profiles
  add constraint profiles_team_id_fkey
  foreign key (team_id) references public.teams(id) on delete set null;

create table if not exists public.team_invites (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.teams(id) on delete cascade,
  email         text not null,
  token         text not null unique,
  status        text not null default 'pending'
                 check (status in ('pending','accepted','revoked')),
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Billing + metering
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid references public.profiles(id) on delete cascade,
  team_id              uuid references public.teams(id) on delete cascade,
  plan                 text not null
                        check (plan in ('plus','pro','team','brand','newsroom','telco','grant')),
  rzp_subscription_id  text unique,
  rzp_customer_id      text,
  status               text not null,
  current_period_end   timestamptz,
  cancel_at_period_end boolean default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (user_id is not null or team_id is not null)
);

-- One-time orders: Post "Profile Makeover" (₹199) and Reels "Content pack" (₹49 → credits).
create table if not exists public.one_time_purchases (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  kind           text not null check (kind in ('makeover','content_pack')),
  rzp_order_id   text unique,
  rzp_payment_id text,
  amount_paise   int not null,
  credits        int not null default 0,
  status         text not null,
  created_at     timestamptz not null default now()
);

-- Monthly metering for every signed-in, quota-limited action. One row per
-- (user, month, metric). Check quotas are per WhatsApp bot user — see check_usage.
create table if not exists public.usage_counters (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  period    date not null,
  metric    text not null check (metric in ('posts','pieces','media_kits','pitches')),
  used      int  not null default 0,
  primary key (user_id, period, metric)
);

-- ---------------------------------------------------------------------------
-- Voice notes + WhatsApp (one number, routed per message)
-- ---------------------------------------------------------------------------
create table if not exists public.transcriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  source        text not null,
  audio_path    text,
  provider      text not null default 'whisper',
  detected_lang text,
  text          text,
  duration_sec  numeric,
  created_at    timestamptz not null default now()
);

create table if not exists public.whatsapp_messages (
  wa_message_id text primary key,       -- dedupe key
  user_id       uuid references public.profiles(id) on delete set null,
  from_e164     text not null,
  type          text not null,
  module        text check (module in ('post','reels','check')),
  received_at   timestamptz not null default now(),
  processed     boolean not null default false
);

-- state.mode = 'post' | 'reels' | 'check' — the module the sender last chose.
create table if not exists public.whatsapp_sessions (
  from_e164     text primary key,
  user_id       uuid references public.profiles(id) on delete set null,
  state         jsonb not null default '{}',
  updated_at    timestamptz not null default now()
);

-- One-time codes proving a user owns a WhatsApp number: the app issues a code,
-- the user sends "LINK <code>" FROM that number, and only then is it linked.
create table if not exists public.whatsapp_link_codes (
  code          text primary key,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Languages (Reels generation + Check verdicts share one catalogue)
-- ---------------------------------------------------------------------------
create table if not exists public.languages (
  code             text primary key,
  name             text not null,
  native_name      text not null,
  script           text not null,
  noto_font        text,
  sarvam_supported boolean not null default true,
  reels_enabled    boolean not null default false,
  check_enabled    boolean not null default false,
  sort             int not null default 0
);

insert into public.languages (code, name, native_name, script, noto_font, sarvam_supported, reels_enabled, check_enabled, sort) values
  ('hi','Hindi','हिन्दी','Devanagari','Noto Sans Devanagari', true, true,  true,  1),
  ('ta','Tamil','தமிழ்','Tamil','Noto Sans Tamil',              true, true,  true,  2),
  ('te','Telugu','తెలుగు','Telugu','Noto Sans Telugu',          true, true,  true,  3),
  ('mr','Marathi','मराठी','Devanagari','Noto Sans Devanagari',  true, true,  true,  4),
  ('bn','Bengali','বাংলা','Bengali','Noto Sans Bengali',        true, true,  true,  5),
  ('kn','Kannada','ಕನ್ನಡ','Kannada','Noto Sans Kannada',        true, true,  true,  6),
  ('gu','Gujarati','ગુજરાતી','Gujarati','Noto Sans Gujarati',    true, true,  false, 7),
  ('pa','Punjabi','ਪੰਜਾਬੀ','Gurmukhi','Noto Sans Gurmukhi',      true, true,  false, 8),
  ('ml','Malayalam','മലയാളം','Malayalam','Noto Sans Malayalam', true, false, true,  9),
  ('en','English','English','Latin', null,                      true, false, true, 10)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Analytics outbox
-- ---------------------------------------------------------------------------
create table if not exists public.events_outbox (
  id            bigserial primary key,
  user_id       uuid,
  event         text not null,
  props         jsonb not null default '{}',
  sent          boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Functions & triggers
-- ---------------------------------------------------------------------------

-- Atomic monthly usage increment for one metric (avoids read-modify-write races).
create or replace function public.increment_usage(p_user_id uuid, p_period date, p_metric text, p_by int)
returns int language plpgsql security definer set search_path = public as $$
declare new_total int;
begin
  insert into public.usage_counters(user_id, period, metric, used)
  values (p_user_id, p_period, p_metric, p_by)
  on conflict (user_id, period, metric)
  do update set used = public.usage_counters.used + p_by
  returning used into new_total;
  return new_total;
end; $$;
grant execute on function public.increment_usage(uuid, date, text, int) to authenticated, service_role;

-- Auto-create a profile row when an auth user is created.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'))
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- profiles.plan is billing-owned and profiles.whatsapp_e164 is ownership-
-- verified: only the service role (verified webhooks, admin tooling) or a
-- direct DB session may change them. Without this a signed-in user could PATCH
-- their own row to plan='pro', or claim someone else's number, via the anon key.
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
  end if;
  return new;
end; $$;
drop trigger if exists guard_profile_plan on public.profiles;
create trigger guard_profile_plan before update on public.profiles
  for each row execute function public.guard_profile_plan();

drop trigger if exists touch_profiles on public.profiles;
create trigger touch_profiles before update on public.profiles
  for each row execute function public.touch_updated_at();
drop trigger if exists touch_subscriptions on public.subscriptions;
create trigger touch_subscriptions before update on public.subscriptions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.teams              enable row level security;
alter table public.team_invites       enable row level security;
alter table public.subscriptions      enable row level security;
alter table public.one_time_purchases enable row level security;
alter table public.usage_counters     enable row level security;
alter table public.transcriptions     enable row level security;
alter table public.whatsapp_messages  enable row level security;
alter table public.whatsapp_sessions  enable row level security;
alter table public.whatsapp_link_codes enable row level security;
alter table public.languages          enable row level security;
alter table public.events_outbox      enable row level security;

-- Owner policies: a user may read/write only their own rows.
-- profiles: owners may read/edit their own row; plan changes are blocked by
-- the guard_profile_plan trigger above (only billing webhooks may change plan).
create policy "own profile read" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "own profile update" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "own transcriptions" on public.transcriptions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own purchases" on public.one_time_purchases
  for select to authenticated using (user_id = auth.uid());
create policy "own usage" on public.usage_counters
  for select to authenticated using (user_id = auth.uid());
create policy "own subscriptions" on public.subscriptions
  for select to authenticated using (user_id = auth.uid());

-- Team visibility: members can read their team; only the owner can mutate.
create policy "team read" on public.teams
  for select to authenticated using (
    id in (select team_id from public.profiles where id = auth.uid())
    or owner_id = auth.uid()
  );
create policy "team owner write" on public.teams
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "team invites by owner" on public.team_invites
  for all to authenticated using (
    team_id in (select id from public.teams where owner_id = auth.uid())
  ) with check (
    team_id in (select id from public.teams where owner_id = auth.uid())
  );

-- Catalogue: public read.
create policy "read languages" on public.languages for select to anon, authenticated using (true);

-- NOTE: whatsapp_*, events_outbox and all billing WRITES are reached only via
-- the service-role key in server code (webhooks, workers), which bypasses RLS.

-- ---------------------------------------------------------------------------
-- Storage buckets (private)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('audio', 'audio', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('media-kits', 'media-kits', false)
  on conflict (id) do nothing;
