-- =========================================================================
-- Manch Check (fact-checking) — module schema. Requires 0001_core (pgvector).
-- =========================================================================

-- ───────────────────────── Bot users (WhatsApp-first) ─────────────────────────
-- Keyed by WhatsApp id — most users have NO web account.
create table if not exists public.bot_users (
  id            uuid primary key default gen_random_uuid(),
  wa_id         text unique not null,
  user_id       uuid references public.profiles(id) on delete set null,
  language_pref text not null default 'hi',
  plan          text not null default 'free',
  state         jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz
);

-- ───────────────────────── Checks + claims ─────────────────────────
create table if not exists public.api_keys (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid references public.profiles(id) on delete cascade,  -- the account that issued it
  org_name      text not null,
  key_hash      text unique not null,
  plan          text not null default 'newsroom',
  monthly_quota int not null default 10000,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists public.checks (
  id            uuid primary key default gen_random_uuid(),
  bot_user_id   uuid references public.bot_users(id) on delete set null,
  api_key_id    uuid references public.api_keys(id) on delete set null,
  input_type    text not null check (input_type in ('text','image','video','url')),
  content_hash  text not null,
  language      text not null,
  trust_score   int,
  verdict_label text,
  verdict_text  text,
  sources       jsonb,
  status        text not null default 'pending' check (status in ('pending','done','failed')),
  from_cache    boolean not null default false,
  latency_ms    int,
  created_at    timestamptz not null default now()
);
create index if not exists checks_hash_idx on public.checks(content_hash);
create index if not exists checks_botuser_idx on public.checks(bot_user_id, created_at desc);

create table if not exists public.claims (
  id          uuid primary key default gen_random_uuid(),
  check_id    uuid not null references public.checks(id) on delete cascade,
  claim_text  text not null,
  verdict     text not null check (verdict in ('supported','refuted','unverified')),
  confidence  numeric,
  sources     jsonb
);

create table if not exists public.media_analyses (
  id              uuid primary key default gen_random_uuid(),
  check_id        uuid not null references public.checks(id) on delete cascade,
  media_type      text not null check (media_type in ('image','video')),
  signals         jsonb,
  verdict         text,
  confidence      numeric,
  earliest_source text
);

-- ───────────────────────── Fact-check corpus (pgvector) ─────────────────────────
create table if not exists public.corpus_docs (
  id           uuid primary key default gen_random_uuid(),
  source       text not null,                 -- pib|boom|altnews|wikipedia|thehindu|indianexpress
  title        text,
  url          text,
  published_at timestamptz,
  lang         text,
  chunk        text not null,
  embedding    vector(1536),
  fetched_at   timestamptz not null default now()
);
create index if not exists corpus_embed_idx on public.corpus_docs using ivfflat (embedding vector_cosine_ops) with (lists = 200);
create index if not exists corpus_source_idx on public.corpus_docs(source, published_at desc);

-- Content-hash verdict cache (viral forwards checked once, served many times).
create table if not exists public.verdict_cache (
  content_hash   text primary key,
  language       text not null,
  payload        jsonb not null,
  corpus_version int not null default 0,
  hits           int not null default 0,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz
);

-- Source credibility registry (v1.1).
create table if not exists public.source_registry (
  domain     text primary key,
  rating     text not null check (rating in ('highly_reliable','mixed','unreliable','unknown')),
  updated_at timestamptz not null default now()
);

-- Verdict-accuracy human-eval harness (accuracy is a tracked metric, §13/§16).
create table if not exists public.verdict_reviews (
  id          uuid primary key default gen_random_uuid(),
  check_id    uuid not null references public.checks(id) on delete cascade,
  human_label text not null,
  agrees      boolean not null,
  reviewer    text,
  note        text,
  created_at  timestamptz not null default now()
);


-- Check quotas are per WhatsApp bot user (most users have no web account), so
-- they meter separately from the account-level usage_counters.
create table if not exists public.check_usage (
  bot_user_id uuid not null references public.bot_users(id) on delete cascade,
  period      date not null,
  checks      int not null default 0,
  primary key (bot_user_id, period)
);


-- pgvector cosine-kNN over the corpus (optionally language-filtered).
create or replace function public.search_corpus(p_embedding vector, p_limit int, p_lang text)
returns table(id uuid, source text, title text, url text, chunk text, distance float)
language sql stable security definer set search_path = public as $$
  select d.id, d.source, d.title, d.url, d.chunk, (d.embedding <=> p_embedding) as distance
  from public.corpus_docs d
  where d.embedding is not null
    and (p_lang is null or d.lang is null or d.lang = p_lang)
  order by d.embedding <=> p_embedding
  limit p_limit;
$$;
grant execute on function public.search_corpus(vector, int, text) to service_role;


-- Atomic monthly check metering for a bot user.
create or replace function public.increment_check_usage(p_bot_user_id uuid, p_period date, p_by int)
returns int language plpgsql security definer set search_path = public as $$
declare new_total int;
begin
  insert into public.check_usage (bot_user_id, period, checks)
  values (p_bot_user_id, p_period, p_by)
  on conflict (bot_user_id, period)
  do update set checks = public.check_usage.checks + p_by
  returning checks into new_total;
  return new_total;
end; $$;
grant execute on function public.increment_check_usage(uuid, date, int) to service_role;

-- Row-Level Security
alter table public.bot_users       enable row level security;
alter table public.api_keys        enable row level security;
alter table public.checks          enable row level security;
alter table public.claims          enable row level security;
alter table public.media_analyses  enable row level security;
alter table public.corpus_docs     enable row level security;
alter table public.verdict_cache   enable row level security;
alter table public.source_registry enable row level security;
alter table public.verdict_reviews enable row level security;
alter table public.check_usage     enable row level security;

-- A subscriber reads their own checks (via the linked bot_user); the worker (service role) writes.
create policy "own checks read" on public.checks for select using (
  exists (select 1 from public.bot_users b where b.id = checks.bot_user_id and b.user_id = auth.uid())
);
create policy "own claims read" on public.claims for select using (
  exists (
    select 1 from public.checks c join public.bot_users b on b.id = c.bot_user_id
    where c.id = claims.check_id and b.user_id = auth.uid()
  )
);

create policy "source registry read" on public.source_registry for select using (auth.role() = 'authenticated');

-- bot_users, api_keys, corpus_docs, verdict_cache, verdict_reviews, media_analyses,
-- check_usage: NO policies → service-role only (privileged worker + cron).
