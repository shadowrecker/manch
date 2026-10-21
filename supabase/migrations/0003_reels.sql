-- =========================================================================
-- Manch Reels (regional-language short video) — module schema. Requires 0001_core.
-- =========================================================================

create table if not exists public.bhasha_pieces (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  team_id       uuid references public.teams(id) on delete set null,
  kind          text not null
                 check (kind in ('script','caption','hashtags','audio_match','thumbnail','repurpose','calendar')),
  language_code text not null references public.languages(code),
  platform      text,
  style         text check (style in ('educational','entertainment','emotional')),
  input_text    text,
  output        jsonb not null,
  watermarked   boolean not null default true,
  ai_labelled   boolean not null default true,
  source        text not null default 'web',
  model         text not null,
  created_at    timestamptz not null default now()
);
create index if not exists bhasha_pieces_user_created on public.bhasha_pieces(user_id, created_at desc);
create index if not exists bhasha_pieces_lang_kind on public.bhasha_pieces(language_code, kind);

create table if not exists public.hashtag_sets (
  id            uuid primary key default gen_random_uuid(),
  language_code text not null references public.languages(code),
  platform      text not null,
  week          date not null,
  tags          jsonb not null,
  source        text not null default 'curated',
  curated       boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (language_code, platform, week)
);
create index if not exists hashtag_sets_lookup on public.hashtag_sets(language_code, platform, week desc) where curated;

create table if not exists public.trending_audio (
  id            uuid primary key default gen_random_uuid(),
  language_code text not null references public.languages(code),
  region        text,
  platform      text not null,
  title         text not null,
  audio_url     text not null,
  mood          text,
  week          date not null,
  rank          int,
  curated       boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists trending_audio_lookup on public.trending_audio(language_code, week desc, rank) where curated;

create table if not exists public.credit_wallets (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  balance       int not null default 0,
  updated_at    timestamptz not null default now()
);
create table if not exists public.credit_ledger (
  id            bigserial primary key,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  delta         int not null,
  reason        text not null,
  ref           text,
  created_at    timestamptz not null default now()
);


create table if not exists public.brand_presets (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.teams(id) on delete cascade,
  name          text not null,
  brief         text,
  default_languages text[] not null default '{}',
  voice_notes   text,
  created_at    timestamptz not null default now()
);

-- Grant credits (content-pack purchase / refund). Returns new balance.
create or replace function public.grant_credits(p_user_id uuid, p_amount int, p_reason text, p_ref text)
returns int language plpgsql security definer set search_path = public as $$
declare new_bal int;
begin
  insert into public.credit_wallets(user_id, balance) values (p_user_id, p_amount)
  on conflict (user_id) do update set balance = public.credit_wallets.balance + p_amount, updated_at = now()
  returning balance into new_bal;
  insert into public.credit_ledger(user_id, delta, reason, ref) values (p_user_id, p_amount, p_reason, p_ref);
  return new_bal;
end; $$;
grant execute on function public.grant_credits(uuid, int, text, text) to service_role;

-- Atomically consume credits. Returns new balance, or -1 if insufficient.
create or replace function public.consume_credit(p_user_id uuid, p_amount int, p_ref text)
returns int language plpgsql security definer set search_path = public as $$
declare cur int; new_bal int;
begin
  insert into public.credit_wallets(user_id, balance) values (p_user_id, 0)
  on conflict (user_id) do nothing;
  select balance into cur from public.credit_wallets where user_id = p_user_id for update;
  if cur is null or cur < p_amount then return -1; end if;
  new_bal := cur - p_amount;
  update public.credit_wallets set balance = new_bal, updated_at = now() where user_id = p_user_id;
  insert into public.credit_ledger(user_id, delta, reason, ref) values (p_user_id, -p_amount, 'generation', p_ref);
  return new_bal;
end; $$;
grant execute on function public.consume_credit(uuid, int, text) to service_role;

-- Row-Level Security
alter table public.bhasha_pieces     enable row level security;
alter table public.hashtag_sets      enable row level security;
alter table public.trending_audio    enable row level security;
alter table public.credit_wallets    enable row level security;
alter table public.credit_ledger     enable row level security;
alter table public.brand_presets     enable row level security;

create policy "own pieces" on public.bhasha_pieces
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own wallet" on public.credit_wallets
  for select to authenticated using (user_id = auth.uid());
create policy "own ledger" on public.credit_ledger
  for select to authenticated using (user_id = auth.uid());
create policy "read hashtags" on public.hashtag_sets for select to anon, authenticated using (true);
create policy "read audio" on public.trending_audio for select to anon, authenticated using (true);
create policy "brand presets by team" on public.brand_presets
  for all to authenticated using (
    team_id in (select team_id from public.profiles where id = auth.uid())
  ) with check (team_id in (select team_id from public.profiles where id = auth.uid()));
