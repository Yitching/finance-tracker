-- Home screen layout from Settings → Home layout: the order of Home's sections and which
-- ones are hidden, e.g. {"order": ["safe", "chips", ...], "hidden": ["pots"]}.
alter table public.user_settings
  add column home_layout jsonb not null default '{}'::jsonb;
