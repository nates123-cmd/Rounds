-- Auto-enrichment review marker.
--
-- google.atmo (jsonb, inside the existing `google` cache) holds Google's
-- Atmosphere signals fetched once per place by the browser. src/lib/enrich.js
-- turns them into SUGGESTED tags, an L stop, list matches and Google's own
-- happy hour. Nothing is applied by itself: the sheet shows the suggestions,
-- and saving the sheet stamps reviewed_at so the entry stops showing
-- "N suggested tags". happy_hour_source = 'google' marks a happy hour lifted
-- from Google's HAPPY_HOUR secondary hours; the Beelink scraper may replace it
-- with a verified aggregator entry but never with an 'estimated' guess.

alter table public.rounds_places add column if not exists reviewed_at timestamptz;
