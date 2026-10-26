-- Lazy Ledger — Phase 2: capture endpoint, Inbox, merchant memory

-- ─────────────────────────────────────────────────────────────
-- Expenses: remember the raw merchant text from bank alerts ("GRAB*A-6XYZ")
-- ─────────────────────────────────────────────────────────────
alter table public.expenses add column merchant text;

create index expenses_user_pending_idx on public.expenses (user_id, spent_at desc)
  where status = 'pending';

-- ─────────────────────────────────────────────────────────────
-- Phone tokens: one per user. Only a SHA-256 hash is stored; the app
-- shows the plain token once, when it's created.
-- ─────────────────────────────────────────────────────────────
create table public.capture_tokens (
  user_id       uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  token_hash    text not null unique,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

alter table public.capture_tokens enable row level security;

create policy "own token: all" on public.capture_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Makes (or replaces) your token and returns it. The old one stops working.
create or replace function public.create_capture_token() returns text
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_token text := 'll_' || encode(gen_random_bytes(24), 'hex');
begin
  insert into public.capture_tokens (user_id, token_hash)
  values (auth.uid(), encode(digest(v_token, 'sha256'), 'hex'))
  on conflict (user_id) do update set
    token_hash   = excluded.token_hash,
    created_at   = now(),
    last_used_at = null;
  return v_token;
end;
$$;

grant execute on function public.create_capture_token() to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Merchant memory: "GRAB*A-6XYZ" renamed to Grab / Transport once,
-- every later Grab charge arrives already sorted.
-- ─────────────────────────────────────────────────────────────

-- "GRAB*A-6XYZ" -> "grab", "NTUC FP-BEDOK MALL" -> "ntuc fp", "BUS/MRT 1234" -> "bus mrt".
-- Drops the reference after "*", digits and punctuation, keeps the first two words.
create or replace function public.merchant_key(p_merchant text) returns text
language sql
immutable
as $$
  select coalesce(
    nullif((
      select string_agg(w, ' ' order by n)
      from (
        select w, n
        from regexp_split_to_table(
          regexp_replace(lower(split_part(coalesce(p_merchant, ''), '*', 1)), '[^a-z]+', ' ', 'g'),
          ' '
        ) with ordinality as t (w, n)
        where length(w) >= 2
        order by n
        limit 2
      ) words
    ), ''),
    lower(trim(coalesce(p_merchant, '')))
  );
$$;

create table public.merchant_rules (
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  merchant_key  text not null,              -- from merchant_key()
  example       text,                       -- the raw text it was learned from, for Settings
  display_name  text not null,
  category      text not null default 'Others',
  updated_at    timestamptz not null default now(),
  primary key (user_id, merchant_key)
);

alter table public.merchant_rules enable row level security;

create policy "own merchants: all" on public.merchant_rules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Called by the app when you rename or recategorise a captured charge.
-- Also renames anything from the same merchant still waiting in your Inbox.
create or replace function public.remember_merchant(
  p_merchant text,
  p_name     text,
  p_category text
) returns void
language plpgsql
security invoker
as $$
declare
  v_key text := public.merchant_key(p_merchant);
begin
  if v_key = '' or coalesce(trim(p_name), '') = '' then
    return;
  end if;

  insert into public.merchant_rules as r (user_id, merchant_key, example, display_name, category)
  values (auth.uid(), v_key, trim(p_merchant), trim(p_name), coalesce(p_category, 'Others'))
  on conflict (user_id, merchant_key) do update set
    example      = excluded.example,
    display_name = excluded.display_name,
    category     = excluded.category,
    updated_at   = now();

  update public.expenses e set
    item     = trim(p_name),
    category = coalesce(p_category, 'Others')
  where e.user_id = auth.uid()
    and e.status = 'pending'
    and e.merchant is not null
    and (public.merchant_key(e.merchant) = v_key or public.merchant_key(e.merchant) like v_key || ' %');
end;
$$;

grant execute on function public.remember_merchant(text, text, text) to authenticated;

-- Used by the capture function (service role). A rule for "grab" also
-- covers "grab rides"; the longest matching rule wins.
create or replace function public.lookup_merchant(p_user_id uuid, p_merchant text)
returns table (display_name text, category text)
language sql
stable
as $$
  select r.display_name, r.category
  from public.merchant_rules r, (select public.merchant_key(p_merchant) as k) m
  where r.user_id = p_user_id
    and (m.k = r.merchant_key or m.k like r.merchant_key || ' %')
  order by length(r.merchant_key) desc
  limit 1;
$$;

revoke execute on function public.lookup_merchant(uuid, text) from public, anon, authenticated;
grant execute on function public.lookup_merchant(uuid, text) to service_role;
