-- Bank statement rows need an idempotency key so re-uploading the same statement
-- cannot create another copy of an expense. The key is deliberately user-scoped.
alter table public.expenses add column statement_fingerprint text;

create unique index expenses_statement_fingerprint_idx
  on public.expenses (user_id, statement_fingerprint);

create index expenses_user_spent_at_idx on public.expenses (user_id, spent_at desc)
  where status = 'confirmed';
