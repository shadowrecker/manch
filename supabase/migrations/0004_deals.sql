-- =========================================================================
-- Manch Deals (creator monetisation) — module schema. Requires 0001_core (pgvector).
-- =========================================================================

create table if not exists public.creator_profiles (
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  niche          text[] not null default '{}',
  primary_language text,
  content_style  text,
  city           text,
  follower_band  text,
  embedding      vector(1536),
  updated_at     timestamptz not null default now()
);

create table if not exists public.instagram_connections (
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  ig_user_id     text unique,
  ig_username    text,
  account_type   text,
  access_token   text not null,            -- store encrypted (pgsodium/Vault) in prod
  token_expires  timestamptz,
  connected_at   timestamptz not null default now()
);

create table if not exists public.ig_metrics (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  followers      int,
  engagement_rate numeric,
  avg_likes      int,
  avg_comments   int,
  top_categories jsonb not null default '[]',
  audience       jsonb,
  source         text not null default 'instagram',  -- instagram | manual
  fetched_at     timestamptz not null default now()
);
create index if not exists ig_metrics_user on public.ig_metrics(user_id, fetched_at desc);

create table if not exists public.media_kits (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  data           jsonb not null,
  pdf_path       text,
  share_id       text unique,
  ai_labelled    boolean not null default true,
  created_at     timestamptz not null default now()
);

create table if not exists public.brands (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  website        text,
  logo_url       text,
  niche          text[] not null default '{}',
  target_audience text,
  tier_focus     text,
  typical_creator_size text,
  signals        jsonb,
  embedding      vector(1536),
  source         text not null default 'curated',
  curated        boolean not null default false,
  created_at     timestamptz not null default now()
);
create index if not exists brands_embedding on public.brands using ivfflat (embedding vector_cosine_ops) with (lists = 100);
-- scripts/seed-brands.ts upserts on name.
create unique index if not exists brands_name_key on public.brands(name);

create table if not exists public.brand_matches (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  brand_id       uuid not null references public.brands(id) on delete cascade,
  fit_score      int not null,
  reasons        jsonb not null default '[]',
  created_at     timestamptz not null default now(),
  unique (user_id, brand_id)
);

create table if not exists public.pitches (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  brand_id       uuid references public.brands(id) on delete set null,
  subject        text,
  body           text not null,
  proposed_rate_paise int,
  deliverables   jsonb not null default '[]',
  status         text not null default 'draft',
  ai_labelled    boolean not null default true,
  created_at     timestamptz not null default now()
);

create table if not exists public.rate_benchmarks (
  id             uuid primary key default gen_random_uuid(),
  niche          text not null,
  follower_band  text not null,
  deliverable    text not null,
  region         text,
  p25_paise      int, p50_paise int, p75_paise int,
  sample_size    int,
  source         text not null,
  updated_at     timestamptz not null default now(),
  unique (niche, follower_band, deliverable, region)
);

create table if not exists public.deals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  brand_id       uuid references public.brands(id) on delete set null,
  brand_name     text,
  title          text,
  value_paise    int,
  status         text not null default 'pitched'
                  check (status in ('pitched','in_conversation','contract_review','live','delivered','paid')),
  deliverables   jsonb not null default '[]',
  rzp_order_id   text,
  rzp_transfer_id text,
  commission_paise int,
  commission_status text not null default 'none'
                  check (commission_status in ('none','pending','collected','waived')),
  created_at     timestamptz not null default now(),
  closed_at      timestamptz
);
create index if not exists deals_user on public.deals(user_id, status);

create table if not exists public.creator_payout_accounts (
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  rzp_account_id text,
  kyc_status     text not null default 'none',
  created_at     timestamptz not null default now()
);

create table if not exists public.contracts (
  id             uuid primary key default gen_random_uuid(),
  deal_id        uuid references public.deals(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  file_path      text,
  review         jsonb,
  created_at     timestamptz not null default now()
);


-- pgvector kNN: curated brands nearest to the creator's profile embedding.
create or replace function public.match_brands(p_user_id uuid, p_limit int)
returns table(brand_id uuid, distance float)
language sql stable security definer set search_path = public as $$
  select b.id, (b.embedding <=> cp.embedding) as distance
  from public.brands b, public.creator_profiles cp
  where cp.user_id = p_user_id
    and cp.embedding is not null and b.embedding is not null and b.curated
  order by b.embedding <=> cp.embedding
  limit p_limit;
$$;
grant execute on function public.match_brands(uuid, int) to service_role;

-- Row-Level Security
alter table public.creator_profiles  enable row level security;
alter table public.instagram_connections enable row level security;
alter table public.ig_metrics        enable row level security;
alter table public.media_kits        enable row level security;
alter table public.brands            enable row level security;
alter table public.brand_matches     enable row level security;
alter table public.pitches           enable row level security;
alter table public.rate_benchmarks   enable row level security;
alter table public.deals             enable row level security;
alter table public.creator_payout_accounts enable row level security;
alter table public.contracts         enable row level security;

create policy "own creator_profile" on public.creator_profiles
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own media_kits" on public.media_kits
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own pitches" on public.pitches
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own deals" on public.deals
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own contracts" on public.contracts
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Computed/sensitive: owner READ only (writes are service-role, so stats can't be faked).
create policy "read own metrics" on public.ig_metrics
  for select to authenticated using (user_id = auth.uid());
create policy "read own matches" on public.brand_matches
  for select to authenticated using (user_id = auth.uid());
create policy "read own payout" on public.creator_payout_accounts
  for select to authenticated using (user_id = auth.uid());

-- Catalog tables: authenticated read (served rows filtered to curated), service-role write.
create policy "read brands" on public.brands for select to authenticated using (true);
create policy "read rates" on public.rate_benchmarks for select to authenticated using (true);

-- NOTE: instagram_connections (tokens), events_outbox, and catalog WRITES are
-- reached only via the service-role key in server code; RLS denies all else.
