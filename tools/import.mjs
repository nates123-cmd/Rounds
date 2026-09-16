/**
 * Resolve data/seed.json through Google Places (New) and write tools/seed.sql.
 *
 *   node tools/import.mjs
 *   cd ../today-app && supabase db query --linked -f ../rounds-app/tools/seed.sql
 *
 * Text Search Pro (5,000 free / month) to find each place, then Place Details
 * Enterprise (1,000 free / month) to seed hours and price. 80 places is 160
 * calls, once. The key is referrer-restricted, so the Pages origin is sent as
 * the Referer; Google honours that from any client.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split('\n').filter((l) => l.includes('=')).map((l) => l.split('=').map((s) => s.trim())))
const KEY = env.VITE_GOOGLE_MAPS_KEY
if (!KEY) throw new Error('VITE_GOOGLE_MAPS_KEY missing from .env')
const OWNER = process.env.ROUNDS_OWNER || '24c79501-4011-46c9-a3d3-a716d732d69c' // Nate
const BASE = 'https://places.googleapis.com/v1'
const NYC = { circle: { center: { latitude: 40.72, longitude: -73.95 }, radius: 25000 } }

async function call(path, { method = 'GET', body, mask }) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': mask, Referer: 'https://nates123-cmd.github.io/' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`)
  return res.json()
}
const hoodFrom = (c = []) => {
  const pick = (t) => c.find((x) => x.types?.includes(t))?.longText
  return pick('neighborhood') || pick('sublocality_level_1') || pick('sublocality') || pick('locality') || ''
}
const sq = (s) => s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`
const arr = (a) => `array[${a.map(sq).join(',')}]::text[]`

const seed = JSON.parse(readFileSync(new URL('../data/seed.json', import.meta.url), 'utf8'))
const out = [], review = []
for (const s of seed) {
  const query = [s.name, s.hood, 'New York'].filter(Boolean).join(' ')
  let hit = null, details = null
  try {
    const r = await call('/places:searchText', { method: 'POST', body: { textQuery: query, locationBias: NYC, pageSize: 3 },
      mask: 'places.id,places.displayName,places.formattedAddress,places.location,places.addressComponents,places.primaryTypeDisplayName' })
    hit = r.places?.[0] || null
  } catch (e) { review.push(`${s.name}: search failed ${e.message}`) }
  if (hit) {
    try {
      details = await call(`/places/${hit.id}`, { mask: 'id,businessStatus,googleMapsUri,priceLevel,regularOpeningHours,websiteUri' })
    } catch (e) { review.push(`${s.name}: details failed ${e.message}`) }
    const gname = hit.displayName?.text || ''
    const a = s.name.toLowerCase().replace(/[^a-z]/g, ''), b = gname.toLowerCase().replace(/[^a-z]/g, '')
    if (!b.includes(a.slice(0, 5)) && !a.includes(b.slice(0, 5))) review.push(`${s.name} -> ${gname} (${hit.formattedAddress})`)
  } else review.push(`${s.name}: no hit`)
  const google = details ? {
    fetched_at: new Date().toISOString(), periods: details.regularOpeningHours?.periods || null,
    weekday: details.regularOpeningHours?.weekdayDescriptions || null, price: details.priceLevel || null,
    maps_uri: details.googleMapsUri || null, website: details.websiteUri || null,
  } : {}
  out.push(`insert into public.rounds_places (owner_id, added_by, google_place_id, name, hood, kind, note, source, tags, status, lat, lng, l_stop, happy_hour, happy_hour_source, business_status, google) values (` +
    [sq(OWNER), sq(OWNER), sq(hit?.id || null), sq(s.name), sq(s.hood || hoodFrom(hit?.addressComponents)),
      sq(s.kind || hit?.primaryTypeDisplayName?.text || ''), sq(s.note || ''), sq(s.source || ''), arr(s.tags || []), sq(s.status || 'want'),
      hit?.location?.latitude ?? 'null', hit?.location?.longitude ?? 'null', sq(s.l_stop || null), sq(s.happy_hour || null),
      sq(s.happy_hour ? 'seed' : null), sq(details?.businessStatus || null), sq(JSON.stringify(google)) + '::jsonb',
    ].join(', ') + `) on conflict do nothing;`)
  process.stdout.write(hit ? '.' : 'x')
  await new Promise((r) => setTimeout(r, 120))
}
writeFileSync(new URL('./seed.sql', import.meta.url), out.join('\n') + '\n')
console.log(`\n${out.length} rows -> tools/seed.sql`)
if (review.length) console.log('\nREVIEW (name did not obviously match, or failed):\n' + review.map((r) => '  ' + r).join('\n'))
