-- Category colours you picked in Settings: category name → palette colour name,
-- e.g. {"Food": "rose"}. Only the ones you changed; the rest use the defaults.
alter table public.user_settings
  add column category_colors jsonb not null default '{}'::jsonb;
