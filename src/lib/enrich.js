/**
 * Auto-enrichment. Pure: (place, listEntries) -> suggestions. Nothing here
 * writes. The sheet shows the result as SUGGESTED, Nate accepts or ignores,
 * and saving stamps reviewed_at so the entry stops nagging.
 *
 * Signals, in order of trust:
 *   Google types (sandwich_shop, wine_bar, ...)          -> a tag each
 *   Google Atmosphere booleans (outdoorSeating, liveMusic,
 *     servesCocktails, goodForWatchingSports, reservable) -> a tag each, bar-ish gated
 *   Words in the name + Google's editorial line          -> jazz, tiki, dive, oysters...
 *   Regular hours                                        -> late (closes 1am or after)
 *   Google secondary hours of type HAPPY_HOUR            -> happy_hour text
 *   Coordinates                                          -> nearest L stop, curated lists within 130 m
 *   Curated list names                                   -> lists
 */
import { miles, nearestL } from './geo'
import { OCCASIONS } from './tags'

const TYPE_TAGS = {
  sandwich_shop: ['sandwich', 'lunch'], deli: ['sandwich', 'lunch'], pizza_restaurant: ['pizza'],
  wine_bar: ['wine'], coffee_shop: ['coffee'], cafe: ['coffee'],
  dessert_shop: ['dessert'], dessert_restaurant: ['dessert'], ice_cream_shop: ['dessert'],
  vegan_restaurant: ['vegan'], brunch_restaurant: ['brunch'], breakfast_restaurant: ['brunch'],
  night_club: ['late'], pub: ['beer'], beer_garden: ['beer'], beer_hall: ['beer'], brewery: ['beer'],
  sports_bar: ['sports bar'], jazz_club: ['jazz'], cocktail_bar: ['cocktails'],
  fine_dining_restaurant: ['date', 'reservation'],
}
const BARISH = new Set(['bar', 'pub', 'wine_bar', 'night_club', 'bar_and_grill', 'beer_garden', 'beer_hall', 'brewery', 'cocktail_bar', 'sports_bar', 'lounge', 'karaoke'])

/* Words that carry a tag on their own. Tested against name + kind + Google's line. */
const WORD_TAGS = [
  [/\bjazz\b/, 'jazz'], [/\btiki\b/, 'tiki'], [/listening (bar|room)|hi-?fi bar|audiophile/, 'listening bar'],
  [/\brooftop\b/, 'rooftop'], [/\bdive\b/, 'dive'], [/omakase|tasting menu|prix fixe|tasting-menu/, 'tasting'],
  [/\boyster/, 'oysters'], [/\bsports bar\b/, 'sports bar'], [/natural wine|wine bar/, 'wine'],
  [/cocktail/, 'cocktails'], [/\bsandwich/, 'sandwich'], [/\bpizza\b|pizzeria|\bslice/, 'pizza'],
  [/\bvegan\b/, 'vegan'], [/\bdessert|pastr(y|ies)|ice cream|gelato/, 'dessert'], [/live music|live band|live jazz/, 'live music'],
  [/chef'?s counter|counter seat|at the counter|sushi counter|ramen counter/, 'counter'],
  [/\bpatio|backyard|back garden|garden seating|outdoor seating|sidewalk seating/, 'patio'],
  [/late-night|late night|open late|until 4 ?am/, 'late'], [/\bbrunch\b/, 'brunch'], [/\bcoffee\b|espresso/, 'coffee'],
  [/\bbeer\b|brewery|taproom|tap room/, 'beer'], [/\bcafe\b/, 'coffee'],
]

/* Same rule as rounds_norm() in SQL: lower, accents folded, leading "the" gone, letters and digits only. */
export function norm(t) {
  return (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '')
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const dayIdx = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6 }

function shortTime(s) {
  // "4:00 PM" -> "4p", "11:30 AM" -> "11:30a", "12:00 AM" -> "12a"
  const m = s.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([AP])M?$/i)
  if (!m) return s.trim().toLowerCase()
  return m[1] + (m[2] && m[2] !== '00' ? ':' + m[2] : '') + m[3].toLowerCase()
}

/** "Monday: 4:00 – 7:00 PM" x7 -> "Mon to Fri 4 to 7p, Sat 2 to 5p". Null when nothing usable. */
export function compactWeek(descs) {
  if (!Array.isArray(descs) || !descs.length) return null
  const per = []
  for (const d of descs) {
    const m = d.match(/^(\w+):\s*(.+)$/)
    if (!m || !(m[1].toLowerCase() in dayIdx)) continue
    const txt = m[2].trim()
    if (/closed|not available/i.test(txt)) continue
    // "4:00 – 7:00 PM" or "4:00 PM – 7:00 PM" or "4:00 PM – 12:00 AM"
    const r = txt.split(/\s*[–—-]\s*/)
    if (r.length !== 2) continue
    let [a, b] = r
    if (!/[ap]m?$/i.test(a)) a += b.match(/[AP]M?$/i)?.[0] || ''
    per.push({ day: dayIdx[m[1].toLowerCase()], when: `${shortTime(a)} to ${shortTime(b)}` })
  }
  if (!per.length) return null
  per.sort((x, y) => x.day - y.day)
  const runs = []
  for (const p of per) {
    const last = runs[runs.length - 1]
    if (last && last.when === p.when && last.end === p.day - 1) last.end = p.day
    else runs.push({ start: p.day, end: p.day, when: p.when })
  }
  return runs.map((r) => (r.start === 0 && r.end === 6 ? 'Daily' : r.start === r.end ? DAYS[r.start] : `${DAYS[r.start]} to ${DAYS[r.end]}`) + ' ' + r.when).join(', ')
}

function closesLate(periods) {
  if (!Array.isArray(periods)) return false
  return periods.some((p) => p.close && p.open && p.close.day !== p.open.day && p.close.hour >= 1 && p.close.hour < 6)
}

/** Curated list keys this place matches: by normalized name or within ~130 m. */
export function matchLists(p, entries) {
  if (!entries?.length) return []
  const n = norm(p.name)
  const keys = new Set()
  for (const e of entries) {
    if (e.active === false) continue
    if (n && e.name_norm === n) keys.add(e.list_key)
    else if (p.lat != null && e.lat != null) {
      const d = miles(p.lat, p.lng, e.lat, e.lng)
      if (d != null && d < 0.08) keys.add(e.list_key)
    }
  }
  return [...keys]
}

/**
 * Every field is a DELTA against the place: tags it does not have, an L stop
 * that differs, lists it is not on, a happy hour only when it has none.
 * @returns {{ tags: string[], kind: string|null, l_stop: {name, mi}|null, lists: string[], happy_hour: string|null, summary: string|null, has: boolean }}
 */
export function suggest(p, entries = []) {
  const atmo = p.google?.atmo || {}
  const types = new Set(atmo.types || [])
  const barish = [...types].some((t) => BARISH.has(t))
  const text = [p.name, p.kind, atmo.summary, atmo.primary].filter(Boolean).join(' . ').toLowerCase()
  const tags = new Set()

  for (const t of types) for (const tag of TYPE_TAGS[t] || []) tags.add(tag)
  for (const [re, tag] of WORD_TAGS) if (re.test(text)) tags.add(tag)
  if (atmo.outdoorSeating) tags.add('patio')
  if (atmo.liveMusic) tags.add('live music')
  if (atmo.goodForGroups) tags.add('group')
  if (atmo.goodForWatchingSports) tags.add('sports bar')
  if (atmo.reservable === true) tags.add('reservation')
  if (atmo.reservable === false) tags.add('walk-in')
  if (atmo.servesCocktails && barish) tags.add('cocktails')
  if (atmo.servesBeer && barish && !types.has('wine_bar') && !types.has('cocktail_bar')) tags.add('beer')
  if (atmo.servesBrunch) tags.add('brunch')
  if (atmo.servesLunch && atmo.servesDinner === false) tags.add('lunch')
  if (closesLate(p.google?.periods)) tags.add('late')
  if (tags.has('reservation')) tags.delete('walk-in')

  const have = new Set(p.tags || [])
  const out = [...tags].filter((t) => OCCASIONS.includes(t) && !have.has(t))

  const near = p.lat != null ? nearestL(p.lat, p.lng) : null
  const l_stop = near && norm(near.name) !== norm(p.l_stop) ? near : null
  const lists = matchLists(p, entries).filter((k) => !(p.lists || []).includes(k))
  const hhText = atmo.hh_week ? compactWeek(atmo.hh_week) : null
  const happy_hour = !p.happy_hour && hhText ? hhText : null
  const kind = !p.kind && atmo.primary ? atmo.primary : null

  return { tags: out, kind, l_stop, lists, happy_hour, summary: atmo.summary || null, has: !!(out.length || l_stop || lists.length || happy_hour || kind) }
}
