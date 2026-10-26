-- PayNow alerts often don't say how much you sent. Those wait in the Inbox
-- with no amount until you fill it in; a confirmed expense always has one.
alter table public.expenses alter column amount drop not null;

alter table public.expenses add constraint expenses_amount_when_confirmed
  check (status = 'pending' or amount is not null);
