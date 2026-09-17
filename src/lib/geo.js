/** Straight-line miles. Good enough for sorting and the walk filter; Valhalla owns real minutes. */
export function miles(aLat, aLng, bLat, bLng) {
  if ([aLat, aLng, bLat, bLng].some((v) => v == null)) return null
  const dLat = (bLat - aLat) * 69
  const dLng = (bLng - aLng) * 52.5
  return Math.sqrt(dLat * dLat + dLng * dLng)
}

/* Home is 200 Moffat St, Bushwick (Nate, 2026-09-17). The Beelink poller
 * routes moped minutes from the same point (HOME_LAT/HOME_LNG in rounds.env);
 * change both together. */
export const HOME = { lat: 40.68805, lng: -73.90564, label: 'Home, Bushwick' }

export const ORIGINS = [
  { id: 'home', label: 'Home, Bushwick', lat: HOME.lat, lng: HOME.lng },
  { id: 'here', label: 'Where I am now', lat: null, lng: null },
  { id: 'greenpoint', label: 'Greenpoint', lat: 40.729, lng: -73.954 },
  { id: 'williamsburg', label: 'Williamsburg', lat: 40.714, lng: -73.958 },
  { id: 'union', label: 'Union Sq', lat: 40.735, lng: -73.99 },
  { id: 'fortgreene', label: 'Fort Greene', lat: 40.689, lng: -73.974 },
]

export function fmtMiles(d) {
  if (d == null) return null
  if (d < 0.2) return 'a few blocks'
  return (d < 10 ? d.toFixed(1) : Math.round(d)) + ' mi'
}
