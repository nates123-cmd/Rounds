-- Curated lists (NYT 100 Best, Infatuation guides) and auto-badging.
--
-- rounds_list_entries is global, not per household: a list is a fact about the
-- city. Any signed-in user can read it; only the service role (the Beelink
-- poller, or a hand-run SQL) writes it.
--
-- rounds_places.lists carries every list key a place is on. The badge and the
-- chip read `lists` first and fall back to `source` so hand-entered provenance
-- still shows.

create table if not exists public.rounds_list_entries (
  id          uuid primary key default gen_random_uuid(),
  list_key    text not null,                 -- 'nyt' | 'infatuation' | 'infatuation_hit'
  list_name   text not null,
  list_url    text,
  edition     text,                          -- '2026' for NYT, fetched date for a rolling guide
  rank        integer,
  name        text not null,
  name_norm   text not null,                 -- lower, letters and digits only
  hood        text default '',
  address     text default '',
  cuisine     text default '',
  price       text default '',
  url         text,
  lat         double precision,
  lng         double precision,
  blurb       text default '',
  active      boolean not null default true, -- false once it drops off a rolling list
  fetched_at  timestamptz not null default now(),
  unique (list_key, name_norm)
);
create index if not exists rounds_list_entries_norm on public.rounds_list_entries (name_norm);

alter table public.rounds_list_entries enable row level security;
drop policy if exists rounds_list_entries_sel on public.rounds_list_entries;
create policy rounds_list_entries_sel on public.rounds_list_entries for select to authenticated using (true);
grant select on public.rounds_list_entries to authenticated;
revoke all on public.rounds_list_entries from anon;

alter table public.rounds_places add column if not exists lists text[] not null default '{}';

create or replace function public.rounds_norm(t text) returns text
language sql immutable as $$
  select regexp_replace(lower(unaccent(coalesce(t, ''))), '[^a-z0-9]', '', 'g')
$$;

-- Match active list entries to places by normalized name and stamp the list
-- key. Called by the poller after every fetch; safe to re-run.
create or replace function public.rounds_match_lists() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  with m as (
    select p.id as place_id, array_agg(distinct e.list_key) as keys
      from public.rounds_places p
      join public.rounds_list_entries e
        on e.active
       and (public.rounds_norm(p.name) = e.name_norm
            or (e.lat is not null and p.lat is not null
                and abs(e.lat - p.lat) < 0.0012 and abs(e.lng - p.lng) < 0.0015
                and left(public.rounds_norm(p.name), 5) = left(e.name_norm, 5)))
     group by p.id
  )
  update public.rounds_places p
     set lists = (select array_agg(distinct k) from unnest(p.lists || m.keys) k)
    from m
   where p.id = m.place_id
     and not (p.lists @> m.keys);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.rounds_match_lists() from public, anon;
grant execute on function public.rounds_match_lists() to service_role;

-- Seed: everything Nate tagged 'nyt' by hand keeps its badge through `lists`.
update public.rounds_places set lists = array['nyt'] where source = 'nyt' and not (lists @> array['nyt']);
