-- Rounds: a shared catalogue of places. One household, one list.
--
-- Applied by hand with `supabase db query --linked -f` from a linked checkout.
-- Reuses public.household_ids() (built for Sip on 2026-09-02 on top of Stock's
-- household_members), so no new sharing machinery.

create table if not exists public.rounds_places (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid(),   -- household owner, Nate
  added_by         uuid not null default auth.uid(),   -- who put it on the list
  google_place_id  text,
  name             text not null,
  hood             text default '',
  kind             text default '',
  note             text default '',                    -- the why, or for a favorite, what to go back for
  source           text default '',                    -- 'nyt' | 'new' | a friend | 'ig' | ''
  tags             text[] not null default '{}',
  status           text not null default 'want' check (status in ('want', 'fav', 'tried', 'pass')),
  lat              double precision,
  lng              double precision,
  l_stop           text,
  moped_min        integer,                            -- Valhalla motor_scooter from home, filled by the Beelink poller
  bike_min         integer,
  drive_min        integer,
  routed_at        timestamptz,
  happy_hour       text,
  happy_hour_source text,
  happy_hour_checked_at timestamptz,
  business_status  text,
  google           jsonb not null default '{}',        -- short-lived cache: fetched_at, periods, weekday, price, maps_uri, website
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists rounds_places_owner_gpid on public.rounds_places (owner_id, google_place_id) where google_place_id is not null;
create index if not exists rounds_places_owner on public.rounds_places (owner_id, status);

-- Realtime DELETE events carry only the replica identity; without FULL a
-- filtered subscription never sees deletes (bit Stock in 2026-09).
alter table public.rounds_places replica identity full;

create or replace function public.rounds_touch()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists rounds_places_touch on public.rounds_places;
create trigger rounds_places_touch before update on public.rounds_places
  for each row execute function public.rounds_touch();

alter table public.rounds_places enable row level security;

drop policy if exists rounds_places_sel on public.rounds_places;
drop policy if exists rounds_places_ins on public.rounds_places;
drop policy if exists rounds_places_upd on public.rounds_places;
drop policy if exists rounds_places_del on public.rounds_places;

create policy rounds_places_sel on public.rounds_places for select
  using (owner_id in (select public.household_ids()));
create policy rounds_places_ins on public.rounds_places for insert
  with check (owner_id in (select public.household_ids()) and added_by = auth.uid());
create policy rounds_places_upd on public.rounds_places for update
  using (owner_id in (select public.household_ids()))
  with check (owner_id in (select public.household_ids()));
create policy rounds_places_del on public.rounds_places for delete
  using (owner_id in (select public.household_ids()));

grant select, insert, update, delete on public.rounds_places to authenticated;
revoke all on public.rounds_places from anon;

-- The client reads household_members to find its effective owner. Members may
-- already select their own row (Stock's policy); make sure that holds.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'household_members' and policyname = 'household_members_member_sel') then
    create policy household_members_member_sel on public.household_members for select
      using (owner_id = auth.uid() or lower(member_email) = lower(auth.jwt() ->> 'email'));
  end if;
end $$;

-- Realtime publication for the client subscription.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'rounds_places') then
    alter publication supabase_realtime add table public.rounds_places;
  end if;
end $$;
