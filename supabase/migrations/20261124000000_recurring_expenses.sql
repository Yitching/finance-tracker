-- Recurring expenses you set up yourself (rent, insurance, subscriptions…).
-- The app adds each one when it falls due, catching up on missed dates when it opens.
create table public.recurring_expenses (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item            text not null check (char_length(item) between 1 and 120),
  amount          numeric(10, 2) not null check (amount > 0),
  category        text not null default 'Others',
  -- weekly: every 7 days from start_date; monthly: on start_date's day (short months use
  -- their last day); yearly: on start_date's day and month.
  cadence         text not null check (cadence in ('weekly', 'monthly', 'yearly')),
  start_date      date not null,
  end_date        date check (end_date is null or end_date >= start_date),
  -- true: each one lands in the Inbox to confirm (handy when the amount varies).
  to_inbox        boolean not null default false,
  paused          boolean not null default false,
  -- Every occurrence up to and including this date has been added (or skipped on purpose).
  -- Deleting an added expense doesn't bring it back, because this has moved past it.
  logged_through  date,
  created_at      timestamptz not null default now()
);

create index recurring_expenses_user_idx on public.recurring_expenses (user_id);

alter table public.recurring_expenses enable row level security;

create policy "own recurring: all" on public.recurring_expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Which recurring expense (and which due date) an expense came from.
-- The unique pair means two phones catching up at once can't add the same date twice
-- (normal expenses have nulls here, and nulls never clash).
alter table public.expenses
  add column recurring_id uuid references public.recurring_expenses (id) on delete set null,
  add column recurring_on date,
  add constraint expenses_recurring_once unique (recurring_id, recurring_on);
