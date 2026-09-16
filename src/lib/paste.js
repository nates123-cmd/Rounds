/**
 * Paste anything: a friend's text, a Google Maps share link, a Resy page, a
 * menu PDF, an article. This pulls the links out, names each by what it is,
 * turns a Maps link into a place, and leaves the rest as the note.
 */
import { supabase } from './supabase'

const RESERVE = /resy\.com|opentable\.com|exploretock\.com|sevenrooms\.com|tock\.|yelp\.com\/reservations/i
const ARTICLE = /nytimes\.com|theinfatuation\.com|eater\.com|newyorker\.com|grubstreet|timeout\.com|thrillist|bonappetit|newyork\.eater/i
const MAPS = /maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]+\/maps|maps\.google/i
const SHORT = /maps\.app\.goo\.gl|goo\.gl|t\.co|bit\.ly|tinyurl|resy\.com\/[a-z0-9]{6,}$|share\./i

export function kindOf(url) {
  if (MAPS.test(url)) return 'maps'
  if (RESERVE.test(url)) return 'reserve'
  if (/menu|\.pdf(\?|$)|toasttab|squareup|clover|singleplatform/i.test(url)) return 'menu'
  if (ARTICLE.test(url)) return 'article'
  return 'website'
}

export function extractUrls(text) {
  const found = text.match(/https?:\/\/[^\s<>"')\]]+/g) || []
  return [...new Set(found.map((u) => u.replace(/[.,;:!?]+$/, '')))]
}

/** "from Jon", "Jon rec", "Jon said", "per Amanda" -> Jon / Amanda. Nothing fancy. */
export function guessRecBy(text) {
  const m = text.match(/\b(?:from|per|via|rec(?:ommended|'d)? by)\s+([A-Z][a-z]+)\b/) || text.match(/\b([A-Z][a-z]+)\s+(?:rec|recs|said|says|swears by|loves)\b/)
  return m ? m[1] : ''
}

/** Full Google Maps URL -> { name, lat, lng } when present in the path. */
export function parseMapsUrl(url) {
  try {
    const u = new URL(url)
    const q = u.searchParams.get('q') || u.searchParams.get('query')
    const place = u.pathname.match(/\/place\/([^/]+)/)
    const name = place ? decodeURIComponent(place[1]).replace(/\+/g, ' ') : (q && !/^-?\d/.test(q) ? q : '')
    const precise = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
    const at = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
    const ll = precise || at
    return { name, lat: ll ? +ll[1] : null, lng: ll ? +ll[2] : null }
  } catch { return { name: '', lat: null, lng: null } }
}

export async function unshorten(url) {
  const { data, error } = await supabase.functions.invoke('rounds-unshorten', { body: { url } })
  if (error) throw new Error(`could not follow ${url}`)
  return data
}

/**
 * Parse a pasted blob. Returns { links, mapsPlace, note, recBy, query }.
 *   links: { maps, menu, reserve, article, website } (first of each kind)
 *   mapsPlace: { name, lat, lng } when a Maps link resolved
 *   query: a Google Text Search string to run (name, or address, or the text)
 */
export async function parsePaste(text, onStatus = () => {}) {
  const urls = extractUrls(text)
  const links = {}
  let mapsPlace = null
  const titles = []
  for (const raw of urls) {
    let url = raw, title = ''
    if (SHORT.test(raw) || kindOf(raw) === 'maps') {
      onStatus(`Following ${new URL(raw).hostname}`)
      try { const r = await unshorten(raw); url = r.url || raw; title = r.title || '' } catch { /* keep the short link */ }
    }
    const kind = kindOf(url)
    if (kind === 'maps' && !mapsPlace) {
      const p = parseMapsUrl(url)
      if (p.name || p.lat) mapsPlace = p
    }
    if (!links[kind]) links[kind] = url
    if (title && kind !== 'maps') titles.push(title)
  }
  let note = text
  for (const u of urls) note = note.replace(u, ' ')
  note = note.replace(/\s+/g, ' ').trim()
  const recBy = guessRecBy(note)
  if (recBy) note = note.replace(new RegExp(`\\b(?:from|per|via|rec(?:ommended|'d)? by)\\s+${recBy}\\b`, 'g'), '').replace(/\s+/g, ' ').trim()
  const address = note.match(/\b\d{1,5}(?:-\d{1,4})?\s+[A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*){0,3}\s+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Pl|Place|Dr|Drive|Broadway|Bowery|Ln|Lane)\b\.?/)
  const query = mapsPlace?.name || (titles[0] ? titles[0].split(/[|\-–]/)[0].trim() : '') || address?.[0] || ''
  return { links, mapsPlace, note, recBy, query, urls }
}
