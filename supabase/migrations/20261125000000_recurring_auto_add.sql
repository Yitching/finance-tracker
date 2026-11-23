-- Recurring expenses that your bank alerts already bring in: track them (label matching
-- charges, show them on the Bills radar) without adding copies. true = add each one as before.
alter table public.recurring_expenses
  add column auto_add boolean not null default true;
