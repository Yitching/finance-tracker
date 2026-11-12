-- Pots: mini-budgets inside the monthly cap, stored as a JSON list.
-- Each pot: { id, name, emoji, kind ("spend" | "save"), category, amount, saved }.
-- Empty list means "never set"; the app shows its defaults until you save pots.
alter table public.user_settings
  add column pots jsonb not null default '[]'::jsonb;
