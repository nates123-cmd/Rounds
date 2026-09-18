/**
 * Data layer. One household, one list.
 *
 * rounds_places.owner_id is the household owner (Nate). A member (Amanda) is
 * mapped by EMAIL in household_members, so she is in before her first sign in.
 * household_ids() on the DB side returns auth.uid() plus every owner she
 * belongs to; the client picks the effective owner the same way so her inserts
 * land in the shared list rather than a silo of her own.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { placeDetails, placeAtmosphere, isStale } from './google'

export async function effectiveOwner() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('household_members').select('owner_id').ilike('member_email', user.email).limit(1)
  return { userId: user.id, email: user.email, ownerId: data?.[0]?.owner_id || user.id }
}

export function usePlaces() {
  const [who, setWho] = useState(null)
  const [places, setPlaces] = useState([])
  const [loading, setLoading] = useState(true)
  const [listEntries, setListEntries] = useState([])
  const refreshing = useRef(new Set())
  const enriching = useRef(new Set())

  const load = useCallback(async (w) => {
    const { data, error } = await supabase
      .from('rounds_places').select('*').eq('owner_id', w.ownerId).order('created_at', { ascending: false })
    if (!error) setPlaces(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    let sub
    effectiveOwner().then((w) => {
      if (!w) return
      setWho(w)
      load(w)
      sub = supabase.channel('rounds')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds_places', filter: `owner_id=eq.${w.ownerId}` }, () => load(w))
        .subscribe()
    })
    return () => { if (sub) supabase.removeChannel(sub) }
  }, [load])

  /* Refresh the Google cache for stale rows, a few at a time, never in a burst.
   * Enterprise details are 1,000 free a month; 80 places at 7-day staleness is
   * roughly 350. */
  useEffect(() => {
    if (!places.length) return
    const stale = places.filter((p) => p.google_place_id && isStale(p.google) && !refreshing.current.has(p.id)).slice(0, 8)
    if (!stale.length) return
    let cancelled = false
    ;(async () => {
      for (const p of stale) {
        if (cancelled) return
        refreshing.current.add(p.id)
        try {
          const d = await placeDetails(p.google_place_id)
          await supabase.from('rounds_places').update({
            google: { ...d.google, atmo: p.google?.atmo }, business_status: d.business_status, lat: d.lat, lng: d.lng,
            hood: p.hood || d.hood, kind: p.kind || d.kind,
          }).eq('id', p.id)
        } catch (e) { console.warn('details', p.name, e.message) }
        await new Promise((r) => setTimeout(r, 250))
      }
    })()
    return () => { cancelled = true }
  }, [places])

  /* Backfill google.atmo (types, serves*, editorial line, Google happy hour)
   * for rows that never had it: the seed and anything added before the
   * suggestions shipped. One Enterprise+Atmosphere call per place, ever. */
  useEffect(() => {
    if (!places.length) return
    const todo = places.filter((p) => p.google_place_id && !p.google?.atmo && !isStale(p.google) && !enriching.current.has(p.id)).slice(0, 12)
    if (!todo.length) return
    let cancelled = false
    ;(async () => {
      for (const p of todo) {
        if (cancelled) return
        enriching.current.add(p.id)
        try {
          const atmo = await placeAtmosphere(p.google_place_id)
          await supabase.from('rounds_places').update({ google: { ...p.google, atmo } }).eq('id', p.id)
        } catch (e) { console.warn('atmo', p.name, e.message) }
        await new Promise((r) => setTimeout(r, 250))
      }
    })()
    return () => { cancelled = true }
  }, [places])

  /* Curated lists are global and small (a few hundred rows). Loaded once so
   * the sheet can say "this is on NYT Best" the moment a place resolves. */
  useEffect(() => {
    if (!who) return
    supabase.from('rounds_list_entries').select('list_key,name_norm,lat,lng,active').eq('active', true)
      .then(({ data }) => setListEntries(data || []))
  }, [who])

  const add = async (row) => {
    const { error } = await supabase.from('rounds_places').insert({ ...row, owner_id: who.ownerId, added_by: who.userId })
    if (error) throw error
  }
  const update = async (id, patch) => {
    const { error } = await supabase.from('rounds_places').update(patch).eq('id', id)
    if (error) throw error
  }
  const remove = async (id) => {
    const { error } = await supabase.from('rounds_places').delete().eq('id', id)
    if (error) throw error
  }

  /** Went: set status and the line, and write the visit to Ink as the signed-in person. */
  const went = async (place, verdict, line) => {
    const patch = { status: verdict }
    if (line) patch.note = line
    await update(place.id, patch)
    const { error } = await supabase.from('restaurant_visits').insert({
      user_id: who.userId,
      place_name: place.name,
      visit_date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
      note: line || null,
      would_return: verdict !== 'pass',
      with_people: [], dishes: [],
    })
    if (error) console.warn('ink visit', error.message)
  }

  return { who, places, listEntries, loading, add, update, remove, went, reload: () => who && load(who) }
}
