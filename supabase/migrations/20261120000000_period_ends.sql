-- "Statement's out": periods you ended early because the statement arrived before
-- your usual statement day. Maps a period key ("YYYY-MM") to the day the next period
-- starts ("YYYY-MM-DD"). The next period keeps its name and its normal end date.
alter table public.user_settings
  add column period_ends jsonb not null default '{}'::jsonb;
