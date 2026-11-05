-- The AI spending insight for each period, so opening Insights doesn't wait on the model.
-- fingerprint changes when confirmed expenses, the statement day or the date change,
-- and spending-insights regenerates only then (or when you tap Refresh).
create table public.insight_cache (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  period_key   text not null,               -- "YYYY-MM", same as the web app's PeriodKey
  fingerprint  text not null,
  result       jsonb not null,
  created_at   timestamptz not null default now(),
  primary key (user_id, period_key)
);

alter table public.insight_cache enable row level security;

create policy "own insights: all" on public.insight_cache
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
