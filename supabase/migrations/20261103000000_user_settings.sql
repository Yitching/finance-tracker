-- Per-user preferences that should follow you across devices.
-- statement_day: the day of the month your card statement is issued (1–31).
-- null means plain calendar months. Short months clamp to their last day.
create table public.user_settings (
  user_id        uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  statement_day  smallint check (statement_day between 1 and 31),
  updated_at     timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "own settings: all" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
