-- Personal recommendations vs. list membership.
--
-- rec_by names the person who recommended a place. Non-empty means "someone
-- we know vouched for it"; empty means it arrived from a curated list or was
-- typed in with no provenance. Everything Nate seeded on 2026-09-16 came from
-- his own saved list, so it is his rec.
alter table public.rounds_places add column if not exists rec_by text not null default '';
update public.rounds_places set rec_by = 'Nate' where rec_by = '' and lists = '{}' and created_at < '2026-09-17';
update public.rounds_places set rec_by = 'Nate' where rec_by = '' and source in ('nyt', 'new') and created_at < '2026-09-17';
-- Cozy Corner is a sports bar (Nate, 2026-09-16).
update public.rounds_places set tags = (select array_agg(distinct t) from unnest(tags || array['sports bar', 'beer']) t), kind = case when kind = '' then 'Sports bar' else kind end where name = 'Cozy Corner';
