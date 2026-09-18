# Rounds

A shared catalogue of places for Nate and Amanda: to try, favorites, tried.
Zagat look, one list, filters for the way you actually decide on a Friday
(date, jazz, cocktails, off the L, moped from home, happy hour, open now).

Live: https://nates123-cmd.github.io/Rounds/

## Stack

- Vite + React PWA, GitHub Pages deploy on push to `main`.
- Suite Supabase (`xsmnfcmtbpeaccnyinkr`), email one-time-code login, RLS through
  the existing `household_ids()` so both logins see one list.
- Google Places API (New) from the browser with a referrer-restricted key. The
  DB stores only `google_place_id`, coordinates, and a short-lived cache of
  hours and price that the Beelink poller refreshes weekly.
- Valhalla on the Beelink (`~/apps/valhalla`) computes moped, bike and drive
  minutes from home with the `motor_scooter` costing. Google has no two-wheeler
  routing in the US.
- "Went" writes a row to Ink's `restaurant_visits` and sets the place status.

## Auto-enrichment (suggested, never applied by itself)

When a place resolves through Google, the browser makes one more call
(`placeAtmosphere`, Enterprise + Atmosphere SKU, its own 1,000 free a month)
and keeps the result under `google.atmo`: Google's types, the serves* /
outdoorSeating / liveMusic / reservable booleans, the editorial line, and the
secondary hours of type `HAPPY_HOUR`. `src/lib/enrich.js` turns that plus the
coordinates into a delta: tags the place does not have, the nearest L stop
within 0.6 mi, curated lists it matches (name or 130 m), a happy hour if it has
none. The sheet shows these as a SUGGESTED block: tags are dashed chips you tap
to accept, facts have a `use` link. In Add mode the facts are prefilled into
the form (still visible before saving); tags are never pre-selected. Saving
stamps `reviewed_at`; until then the entry shows "N suggested tags" in its
meta line. Existing rows get `atmo` backfilled a dozen per open.

## Run

```
cp .env.example .env   # fill from ~/.config/rounds/.env and the suite env
npm i
npm run dev
```

## Import the seed list

```
node tools/import.mjs            # resolves data/seed.json through Google, writes tools/seed.sql
cd ../today-app && supabase db query --linked -f ../rounds-app/tools/seed.sql
```

## Schema

`supabase/migrations/20260916_rounds.sql`. Applied by hand with
`supabase db query --linked -f` from a linked checkout (Today's). Never `db push`.

## Beelink poller

`beelink/rounds_poller.py`, runs under `~/apps/rounds-poller`. Fills
`moped_min`, `bike_min`, `drive_min` from Valhalla for new rows, refreshes the
Google hours cache weekly (keeping `google.atmo`), and flags
`CLOSED_PERMANENTLY`. Every cycle it also runs the happy-hour scraper for rows
never checked and re-stamps list badges, so a new place is reconciled within
ten minutes rather than at the weekly pass. A happy hour lifted from Google
(`happy_hour_source = 'google'`) is replaced by a verified aggregator entry
but never by an `estimated` guess.
