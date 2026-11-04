-- Email capture (Gmail forwarder): each email is sent with its Gmail message id,
-- so re-sending the same email can never create a second expense.
alter table public.expenses add column external_id text;

create unique index expenses_external_id_idx
  on public.expenses (user_id, external_id);
