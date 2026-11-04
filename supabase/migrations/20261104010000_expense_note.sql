-- A short free-text note on an expense, e.g. "paid for Mei and hubby too".
alter table public.expenses add column note text
  check (note is null or char_length(note) <= 280);
