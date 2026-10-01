/**
 * The vibe line: what the room is like, in Google's words, under Nate's own note.
 *
 * Gemini's review summary usually spends one sentence on the room ("Guests
 * mention the cozy, low-lit ambiance and the fun, buzzy vibe"). That sentence
 * is the vibe; the food and service sentences are not. When there is no such
 * sentence, Google's editorial line, then the generative overview.
 *
 * Returns { text, by, flag } or null. `by` is the disclosure Google requires
 * shown beside it: 'Google' for the editorial line, the Gemini disclosure for
 * the two generated ones.
 */
const ROOM = /\b(ambiance|ambience|atmosphere|vibe|vibes|decor|setting|space|room|music|jazz|dj|lighting|low-lit|dim|cozy|cosy|intimate|lively|buzzy|loud|noisy|quiet|chill|relaxed|romantic|crowd|crowded|patio|backyard|garden|rooftop|views?)\b/i

/* "Guests mention the cozy, low-lit ambiance..." -> "Cozy, low-lit ambiance..." */
const LEAD = /^(?:they also|many also|people also|guests also|diners also|reviewers also|they|many|people|guests|diners|reviewers|customers|visitors|patrons)\s+(?:\w+ly\s+)?(?:say|mention|note|describe|praise|highlight|appreciate|enjoy|like|love|find|call)(?:\s+(?:the|its|it as|this spot as|it))?\s+/i

function sentences(text) {
  return text.split(/\n+/).flatMap((para) => para.match(/[^.!?]+[.!?]+/g) || [para]).map((t) => t.trim()).filter(Boolean)
}

/* Keep only the clause about the room: "Friendly staff, and the lively atmosphere" -> "lively atmosphere". */
const JOIN = /,\s*(?:as well as|along with|and also|and|plus)\s+(?:the\s+)?|\s+(?:as well as|along with|and the)\s+(?:the\s+)?/i

function tidy(s) {
  let t = s.replace(LEAD, '').replace(/[.!?]+$/, '').replace(/,\s*describing it as\s+/i, ': ')
  if (!t.includes(': ')) {
    const keep = t.split(JOIN).filter((c) => ROOM.test(c))
    if (keep.length) t = keep.join(' and ')
  }
  t = t.replace(/,?\s*making it (?:a )?(?:great|perfect|ideal|good) (?:spot|place|choice) for .*$/i, '')
  t = t.replace(/^the\s+/i, '').trim()
  return t.charAt(0).toUpperCase() + t.slice(1) + '.'
}

export function vibeOf(atmo) {
  if (!atmo) return null
  const rv = atmo.review
  if (rv?.text) {
    const hit = sentences(rv.text).find((s) => ROOM.test(s) && !/^some (?:reviews|people|guests|diners)/i.test(s))
    if (hit) return { text: tidy(hit), by: rv.disclosure || 'Summarized with Gemini', flag: rv.flag }
  }
  if (atmo.summary) {
    return atmo.summary_by === 'gemini'
      ? { text: atmo.summary, by: atmo.gen_disclosure || 'Summarized with Gemini', flag: atmo.gen_flag }
      : { text: atmo.summary, by: 'Google', flag: null }
  }
  return null
}
