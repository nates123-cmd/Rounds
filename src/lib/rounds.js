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
import { placeDetails, isStale } from './google'

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
  const refreshing = useRef(new Set())

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
            google: d.google, business_status: d.business_status, lat: d.lat, lng: d.lng,
            hood: p.hood || d.hood, kind: p.kind || d.kind,
          }).eq('id', p.id)
        } catch (e) { console.warn('details', p.name, e.message) }
        await new Promise((r) => setTimeout(r, 250))
      }
    })()
    return () => { cancelled = true }
  }, [places])

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

  return { who, places, loading, add, update, remove, went, reload: () => who && load(who) }
}
