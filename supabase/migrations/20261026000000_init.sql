-- Lazy Ledger — Phase 1 schema
-- Every table is locked to its owner with row-level security.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- Expenses
-- ─────────────────────────────────────────────────────────────
create table public.expenses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item        text not null,
  amount      numeric(10, 2) not null check (amount >= 0),
  category    text not null default 'Others',
  spent_at    timestamptz not null default now(),
  -- where it came from: manual | chip | ai | email | notification (later phases)
  source      text not null default 'manual',
  -- 'confirmed' now; 'pending' is used by the Phase 2 inbox
  status      text not null default 'confirmed' check (status in ('confirmed', 'pending')),
  raw_input   text,
  created_at  timestamptz not null default now()
);

create index expenses_user_spent_idx on public.expenses (user_id, spent_at desc);

alter table public.expenses enable row level security;

create policy "own expenses: select" on public.expenses
  for select using (auth.uid() = user_id);
create policy "own expenses: insert" on public.expenses
  for insert with check (auth.uid() = user_id);
create policy "own expenses: update" on public.expenses
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own expenses: delete" on public.expenses
  for delete using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- Price memory: "kopi" -> $1.80, plus which hours you usually buy it
-- ─────────────────────────────────────────────────────────────
create table public.price_memory (
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_key      text not null,              -- normalised: lower-case, trimmed
  display_name  text not null,
  last_amount   numeric(10, 2) not null,
  category      text not null default 'Others',
  use_count     integer not null default 1,
  -- 24 buckets, one per hour of the day (Singapore time), for time-aware quick chips
  hour_counts   integer[] not null default array_fill(0, array[24]),
  last_used_at  timestamptz not null default now(),
  primary key (user_id, item_key)
);

alter table public.price_memory enable row level security;

create policy "own memory: all" on public.price_memory
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Upsert helper. Runs as the caller, so RLS still applies.
create or replace function public.remember_item(
  p_name     text,
  p_amount   numeric,
  p_category text,
  p_hour     integer default extract(hour from (now() at time zone 'Asia/Singapore'))::int
) returns void
language plpgsql
security invoker
as $$
declare
  v_key  text := lower(trim(p_name));
  v_hour int  := greatest(0, least(23, p_hour));
  v_hours integer[] := array_fill(0, array[24]);
begin
  v_hours[v_hour + 1] := 1;

  insert into public.price_memory as pm
    (user_id, item_key, display_name, last_amount, category, use_count, hour_counts, last_used_at)
  values
    (auth.uid(), v_key, trim(p_name), p_amount, coalesce(p_category, 'Others'), 1, v_hours, now())
  on conflict (user_id, item_key) do update set
    display_name = excluded.display_name,
    last_amount  = excluded.last_amount,
    category     = excluded.category,
    use_count    = pm.use_count + 1,
    hour_counts  = (
      select array_agg(coalesce(pm.hour_counts[i], 0) + coalesce(v_hours[i], 0) order by i)
      from generate_series(1, 24) as i
    ),
    last_used_at = now();
end;
$$;

grant execute on function public.remember_item(text, numeric, text, integer) to authenticated;
