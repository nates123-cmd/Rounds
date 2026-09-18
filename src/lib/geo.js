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

/* The L, Canarsie line, west to east. Coordinates are the station entrances,
 * good to about 50 m. "Off the L" means a stop within a short walk. */
export const L_STOPS = [
  ['8 Av', 40.7394, -74.0026], ['6 Av', 40.7374, -73.9967], ['Union Sq', 40.7347, -73.9908],
  ['3 Av', 40.7326, -73.9860], ['1 Av', 40.7309, -73.9816], ['Bedford', 40.7172, -73.9565],
  ['Lorimer', 40.7141, -73.9502], ['Graham', 40.7146, -73.9440], ['Grand', 40.7118, -73.9404],
  ['Montrose', 40.7076, -73.9397], ['Morgan', 40.7062, -73.9332], ['Jefferson', 40.7066, -73.9229],
  ['DeKalb', 40.7037, -73.9183], ['Myrtle-Wyckoff', 40.6995, -73.9113], ['Halsey', 40.6955, -73.9040],
  ['Wilson', 40.6889, -73.9040], ['Bushwick-Aberdeen', 40.6828, -73.9052], ['Broadway Jct', 40.6784, -73.9052],
  ['Atlantic', 40.6753, -73.9032], ['Sutter', 40.6692, -73.9018], ['Livonia', 40.6641, -73.9006],
  ['New Lots', 40.6588, -73.8993], ['E 105 St', 40.6505, -73.8994], ['Canarsie', 40.6467, -73.9019],
].map(([name, lat, lng]) => ({ name, lat, lng }))

export const L_WALK_MI = 0.6

/** Nearest L stop within a walk, or null. */
export function nearestL(lat, lng) {
  let best = null
  for (const s of L_STOPS) {
    const d = miles(lat, lng, s.lat, s.lng)
    if (d != null && d <= L_WALK_MI && (!best || d < best.mi)) best = { name: s.name, mi: d }
  }
  return best
}

export function fmtMiles(d) {
  if (d == null) return null
  if (d < 0.2) return 'a few blocks'
  return (d < 10 ? d.toFixed(1) : Math.round(d)) + ' mi'
}
