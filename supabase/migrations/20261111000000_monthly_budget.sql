-- Monthly budget cap (SGD) for the current spending period, all categories.
-- Null means no cap set yet; the app defaults to 1200 until you save one.
alter table public.user_settings
  add column monthly_budget numeric check (monthly_budget > 0);
