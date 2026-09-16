-- Links pasted in with a place: {maps, menu, reserve, article, website}, each a URL string.
alter table public.rounds_places add column if not exists links jsonb not null default '{}';
