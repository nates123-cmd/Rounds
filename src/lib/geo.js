/** Straight-line miles. Good enough for sorting and the walk filter; Valhalla owns real minutes. */
export function miles(aLat, aLng, bLat, bLng) {
  if ([aLat, aLng, bLat, bLng].some((v) => v == null)) return null
  const dLat = (bLat - aLat) * 69
  const dLng = (bLng - aLng) * 52.5
  return Math.sqrt(dLat * dLat + dLng * dLng)
}

/* Home is Greenpoint. Exact address is a setting for later; Valhalla minutes
 * are computed on the Beelink from the same point. */
export const HOME = { lat: 40.729, lng: -73.954, label: 'Home, Greenpoint' }

export const ORIGINS = [
  { id: 'home', label: 'Home, Greenpoint', lat: HOME.lat, lng: HOME.lng },
  { id: 'here', label: 'Where I am now', lat: null, lng: null },
  { id: 'union', label: 'Union Sq', lat: 40.735, lng: -73.99 },
  { id: 'ridgewood', label: 'Ridgewood', lat: 40.703, lng: -73.905 },
  { id: 'fortgreene', label: 'Fort Greene', lat: 40.689, lng: -73.974 },
]

export function fmtMiles(d) {
  if (d == null) return null
  if (d < 0.2) return 'a few blocks'
  return (d < 10 ? d.toFixed(1) : Math.round(d)) + ' mi'
}
