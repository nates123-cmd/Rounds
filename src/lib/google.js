/**
 * Google Places API (New) from the browser. The key is referrer-restricted to
 * the Pages origin and localhost. Field masks decide the SKU, and the SKU
 * decides the free tier, so every call names exactly the fields it needs.
 *
 *   Text Search, Pro fields         5,000 free / month   used by Add
 *   Place Details, Enterprise       1,000 free / month   hours + price, cached 7 days per place
 *   Place Details, Ent.+Atmosphere  1,000 free / month   placeAtmosphere, once per place, tags + vibe line
 *   Place Details, IDs only         unlimited free        placePhotos, the photo list, on each sheet open
 *   Place Photos                    1,000 free / month   one image per sheet open, never stored
 *
 * Terms: place IDs may be stored forever, coordinates 30 days, everything else
 * is meant to be fetched live. We cache hours and price briefly in the row so
 * the list does not fire 80 Enterprise calls per open.
 */
const KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY
const BASE = 'https://places.googleapis.com/v1'

async function call(path, { method = 'GET', body, mask }) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': KEY,
      'X-Goog-FieldMask': mask,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Google ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

/* NYC bias, so "King" finds the SoHo one and not a King in Ohio. */
const NYC = { circle: { center: { latitude: 40.72, longitude: -73.95 }, radius: 25000 } }

export async function searchPlaces(text) {
  const data = await call('/places:searchText', {
    method: 'POST',
    body: { textQuery: text, locationBias: NYC, pageSize: 6, languageCode: 'en' },
    mask: 'places.id,places.displayName,places.formattedAddress,places.shortFormattedAddress,places.location,places.primaryTypeDisplayName,places.types,places.addressComponents',
  })
  return (data.places || []).map(normalize)
}

/** Enterprise SKU. Only called when the row's cache is missing or stale. */
export async function placeDetails(id) {
  const p = await call(`/places/${id}`, {
    mask: 'id,displayName,businessStatus,googleMapsUri,priceLevel,regularOpeningHours,location,addressComponents,primaryTypeDisplayName,websiteUri',
  })
  return normalize(p)
}

/**
 * Enterprise + Atmosphere SKU, its own 1,000 free a month. Fetched ONCE per
 * place (never on the weekly refresh) and kept under google.atmo. These are
 * the raw signals src/lib/enrich.js turns into suggested tags: Google's types,
 * the serves* / outdoorSeating / liveMusic booleans, the editorial line, and
 * the secondary hours of type HAPPY_HOUR, which Google does carry for some bars.
 */
export async function placeAtmosphere(id) {
  const p = await call(`/places/${id}`, {
    mask: 'id,types,primaryTypeDisplayName,editorialSummary,generativeSummary,reviewSummary,regularSecondaryOpeningHours,outdoorSeating,liveMusic,servesCocktails,servesWine,servesBeer,servesBrunch,servesLunch,servesDinner,servesDessert,servesCoffee,goodForGroups,goodForWatchingSports,reservable',
  })
  const hh = (p.regularSecondaryOpeningHours || []).find((h) => h.secondaryHoursType === 'HAPPY_HOUR')
  const rs = p.reviewSummary
  const atmo = {
    v: ATMO_V,
    at: new Date().toISOString(),
    types: p.types || [],
    primary: p.primaryTypeDisplayName?.text || null,
    summary: p.editorialSummary?.text || p.generativeSummary?.overview?.text || null,
    summary_by: p.editorialSummary?.text ? 'google' : p.generativeSummary?.overview?.text ? 'gemini' : null,
    hh_week: hh?.weekdayDescriptions || null,
    /* Gemini's summary of the reviews. Google requires its disclosure text
     * shown with it, and the report link offered, wherever it is displayed. */
    review: rs?.text?.text ? {
      text: rs.text.text,
      disclosure: rs.disclosureText?.text || 'Summarized with Gemini',
      flag: rs.flagContentUri || null,
      reviews: rs.reviewsUri || null,
    } : null,
    /* Same rule for the generative overview, when that is what the vibe line falls back to. */
    gen_disclosure: p.generativeSummary?.disclosureText?.text || null,
    gen_flag: p.generativeSummary?.overviewFlagContentUri || null,
  }
  for (const k of ['outdoorSeating', 'liveMusic', 'servesCocktails', 'servesWine', 'servesBeer', 'servesBrunch', 'servesLunch', 'servesDinner', 'servesDessert', 'servesCoffee', 'goodForGroups', 'goodForWatchingSports', 'reservable']) {
    if (typeof p[k] === 'boolean') atmo[k] = p[k]
  }
  return atmo
}

/* Bump when placeAtmosphere asks for new fields; rows below it are re-fetched once. 2 = reviewSummary. */
export const ATMO_V = 2

/**
 * IDs-only Place Details (free) for the photo list. Photo names expire, so
 * they are fetched on each sheet open and never written to the row. Picks the
 * first big landscape shot: the first photo is often the owner's logo.
 */
export async function placePhotos(id) {
  const p = await call(`/places/${id}`, { mask: 'photos' })
  const all = p.photos || []
  const best = all.find((f) => f.widthPx >= 800 && f.widthPx > f.heightPx) || all[0]
  if (!best) return null
  return {
    url: `${BASE}/${best.name}/media?maxWidthPx=1000&key=${KEY}`,
    w: best.widthPx, h: best.heightPx,
    by: (best.authorAttributions || []).map((a) => ({ name: a.displayName, uri: a.uri })),
    maps: best.googleMapsUri || null,
  }
}

export function hoodFrom(components = []) {
  const pick = (type) => components.find((c) => c.types?.includes(type))?.longText
  return pick('neighborhood') || pick('sublocality_level_1') || pick('sublocality') || pick('locality') || ''
}

function normalize(p) {
  return {
    google_place_id: p.id,
    name: p.displayName?.text || '',
    hood: hoodFrom(p.addressComponents),
    kind: p.primaryTypeDisplayName?.text || '',
    address: p.shortFormattedAddress || p.formattedAddress || '',
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    business_status: p.businessStatus || null,
    google: {
      fetched_at: new Date().toISOString(),
      periods: p.regularOpeningHours?.periods || null,
      weekday: p.regularOpeningHours?.weekdayDescriptions || null,
      price: p.priceLevel || null,
      maps_uri: p.googleMapsUri || null,
      website: p.websiteUri || null,
    },
  }
}

export const STALE_MS = 7 * 24 * 3600 * 1000
export function isStale(google) {
  if (!google?.fetched_at) return true
  return Date.now() - new Date(google.fetched_at).getTime() > STALE_MS
}
