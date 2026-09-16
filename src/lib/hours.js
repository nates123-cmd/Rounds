/**
 * Open-now from Google's regularOpeningHours.periods, evaluated in New York
 * time on the device so the cached hours can be a week old and still answer
 * "open now" correctly. periods: [{ open: {day,hour,minute}, close: {day,hour,minute} }]
 * day: 0 = Sunday. A missing close on a single period means open 24h.
 */
const TZ = 'America/New_York'

function nowNY() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(new Date())
  const get = (t) => parts.find((p) => p.type === t)?.value
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'))
  const hour = Number(get('hour')) % 24
  return { day, minutes: day * 1440 + hour * 60 + Number(get('minute')) }
}

const WEEK = 7 * 1440
const stamp = (t) => t.day * 1440 + t.hour * 60 + (t.minute || 0)

function fmt(t) {
  const h = t.hour % 12 || 12
  const m = t.minute ? ':' + String(t.minute).padStart(2, '0') : ''
  return `${h}${m}${t.hour < 12 ? 'a' : 'p'}`
}

/** @returns {{open:boolean, until?:string, opens?:string}|null} null when hours unknown */
export function openNow(periods) {
  if (!Array.isArray(periods) || !periods.length) return null
  if (periods.length === 1 && !periods[0].close) return { open: true, until: 'always' }
  const { minutes } = nowNY()
  let nextOpen = null
  for (const p of periods) {
    if (!p.open || !p.close) continue
    let o = stamp(p.open), c = stamp(p.close)
    if (c <= o) c += WEEK
    for (const shift of [-WEEK, 0, WEEK]) {
      const oo = o + shift, cc = c + shift
      if (minutes >= oo && minutes < cc) return { open: true, until: fmt(p.close) }
      if (oo > minutes && (nextOpen === null || oo < nextOpen.at)) nextOpen = { at: oo, t: p.open }
    }
  }
  return { open: false, opens: nextOpen ? fmt(nextOpen.t) : undefined }
}

export const PRICE = { PRICE_LEVEL_INEXPENSIVE: '$', PRICE_LEVEL_MODERATE: '$$', PRICE_LEVEL_EXPENSIVE: '$$$', PRICE_LEVEL_VERY_EXPENSIVE: '$$$$' }
