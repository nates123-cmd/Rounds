/**
 * Candidates: everything on a curated list that is not on your list yet.
 * One tap resolves it through Google and adds it as "to try" carrying the
 * list badge. Entries already matched to a place are hidden here; they show
 * as badges on the place instead.
 */
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { searchPlaces } from '../lib/google'
import { LIST_SOURCES, listsOf } from '../lib/tags'

const norm = (t) => (t || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

export function ListsView({ places, q, onAdd }) {
  const [entries, setEntries] = useState([])
  const [list, setList] = useState('nyt')
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase.from('rounds_list_entries').select('*').eq('active', true).order('rank')
      .then(({ data }) => setEntries(data || []))
  }, [])

  const have = useMemo(() => {
    const s = new Set(places.map((p) => norm(p.name)))
    return s
  }, [places])

  const onList = useMemo(() => places.filter((p) => listsOf(p).includes(list)).length, [places, list])
  const keys = useMemo(() => [...new Set(entries.map((e) => e.list_key))], [entries])
  const rows = entries.filter((e) => e.list_key === list && !have.has(e.name_norm))
    .filter((e) => !q || [e.name, e.hood, e.cuisine, e.address, e.blurb].join(' ').toLowerCase().includes(q.toLowerCase()))

  const add = async (e) => {
    setBusy(e.id); setError(null)
    try {
      const hits = await searchPlaces([e.name, e.hood || e.address, 'New York'].filter(Boolean).join(' '))
      const h = hits[0]
      await onAdd({
        name: e.name, hood: e.hood || h?.hood || '', kind: e.cuisine || h?.kind || '', note: '', source: '',
        tags: [], status: 'want', lists: [e.list_key],
        ...(h ? { google_place_id: h.google_place_id, lat: h.lat, lng: h.lng, business_status: h.business_status, google: h.google } : {}),
      })
    } catch (err) { setError(err.message) }
    setBusy(null)
  }

  return (
    <div className="lists">
      <div className="chips" role="group" aria-label="List">
        {keys.map((k) => (
          <button key={k} className="chip" aria-pressed={list === k} onClick={() => setList(k)}>{LIST_SOURCES[k] || k}</button>
        ))}
      </div>
      <div className="count"><div><b>{rows.length}</b> not on your list yet, <b>{onList}</b> already are</div>
        {entries.find((e) => e.list_key === list)?.edition && <span>{entries.find((e) => e.list_key === list).list_name}, {entries.find((e) => e.list_key === list).edition}</span>}
      </div>
      {error && <div className="err">{error}</div>}
      <ul className="list">
        {rows.map((e) => (
          <li key={e.id} className="entry cand">
            <h2 className="name">{e.rank ? <span className="rank">{e.rank}</span> : null}{e.name}</h2>
            <div className="src-col"><span className="src">{LIST_SOURCES[e.list_key] || e.list_key}</span></div>
            <div className="hood">{[e.hood, e.cuisine, e.price].filter(Boolean).map((s, i) => <span key={i}>{i ? <span className="sep">&middot;</span> : null}{s}</span>)}</div>
            {e.blurb && <p className="why verdict">{e.blurb}</p>}
            <div className="meta">{e.address}</div>
            <div className="acts">
              {e.url && <a className="went" href={e.url} target="_blank" rel="noreferrer">Read</a>}
              <button className="went" disabled={busy === e.id} onClick={() => add(e)}>{busy === e.id ? 'Adding' : 'Add to try'}</button>
            </div>
          </li>
        ))}
        {!rows.length && <li className="empty">Everything on this list is already on yours.</li>}
      </ul>
    </div>
  )
}
