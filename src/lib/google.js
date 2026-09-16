/**
 * Google Places API (New) from the browser. The key is referrer-restricted to
 * the Pages origin and localhost. Field masks decide the SKU, and the SKU
 * decides the free tier, so every call names exactly the fields it needs.
 *
 *   Text Search, Pro fields    5,000 free / month   used by Add
 *   Place Details, Enterprise  1,000 free / month   hours + price, cached 7 days per place
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
    mask: 'places.id,places.displayName,places.formattedAddress,places.shortFormattedAddress,places.location,places.primaryTypeDisplayName,places.addressComponents',
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
