/** The tag vocabulary. Add here, never as a one-off in a component. Order = chip order. */
export const OCCASIONS = [
  'date', 'group', 'solo', 'late', 'brunch', 'lunch', 'patio', 'jazz', 'live music',
  'cocktails', 'wine', 'beer', 'sports bar', 'dive', 'tiki', 'listening bar', 'rooftop',
  'walk-in', 'reservation', 'counter', 'tasting', 'oysters', 'sandwich', 'pizza',
  'vegan', 'dessert', 'coffee',
]

export const STATUSES = { want: 'To try', fav: 'Favorites', tried: 'Tried' }

/** Source tags that earn the red badge. Anything else is shown as plain text. */
export const LIST_SOURCES = { nyt: 'NYT Best', infatuation: 'Infatuation', infatuation_hit: 'Hit List' }

/** Every list key a place is on: the scraped `lists` plus a hand-typed source that names a list. */
export function listsOf(p) {
  const keys = new Set(p.lists || [])
  if (LIST_SOURCES[p.source]) keys.add(p.source)
  return [...keys]
}
