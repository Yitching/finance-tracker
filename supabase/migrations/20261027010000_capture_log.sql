-- Every notification the phone sends, and what capture did with it, so you
-- can see why something didn't reach the Inbox. Kept for 14 days.
create table public.capture_log (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  raw_input   text not null,
  outcome     text not null check (outcome in ('pending', 'ignored', 'error')),
  detail      text,  -- why it was ignored (otp, promo, ...) or the error
  expense_id  uuid references public.expenses (id) on delete set null
);

create index capture_log_user_idx on public.capture_log (user_id, created_at desc);

alter table public.capture_log enable row level security;

-- Written only by the capture function (service role); you can read and clear yours.
create policy "own capture log: select" on public.capture_log
  for select using (auth.uid() = user_id);
create policy "own capture log: delete" on public.capture_log
  for delete using (auth.uid() = user_id);
