import { useEffect, useMemo, useState } from 'react'
import { usePlaces } from './lib/rounds'
import { ORIGINS, miles } from './lib/geo'
import { OCCASIONS, STATUSES, LIST_SOURCES, listsOf } from './lib/tags'
import { ListsView } from './components/ListsView'
import { Entry } from './components/Entry'
import { PlaceSheet } from './components/PlaceSheet'
import { signOut } from './auth/AuthGate'

const hasWhy = (p) => (p.note && p.note.trim()) || (p.tags && p.tags.length) || p.source === 'nyt'

export default function App() {
  const { who, places, listEntries, loading, add, update, remove, went } = usePlaces()
  const [view, setView] = useState('want')
  const [occ, setOcc] = useState('all')
  const [src, setSrc] = useState('all') // 'all' | 'rec' | a list key
  const [how, setHow] = useState(() => new Set())
  const [hood, setHood] = useState('all')
  const [openOnly, setOpenOnly] = useState(false)
  const [q, setQ] = useState('')
  const [originId, setOriginId] = useState('home')
  const [here, setHere] = useState(null)
  const [sheet, setSheet] = useState(null) // { mode: 'add' | 'edit', place }
  const [openState, setOpenState] = useState({}) // id -> openNow() result, computed in Entry

  useEffect(() => {
    if (originId !== 'here' || here) return
    navigator.geolocation?.getCurrentPosition(
      (pos) => setHere({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setOriginId('home'),
      { maximumAge: 60000, timeout: 8000 },
    )
  }, [originId, here])

  const origin = useMemo(() => {
    const o = ORIGINS.find((x) => x.id === originId) || ORIGINS[0]
    return o.id === 'here' && here ? { ...o, ...here } : o
  }, [originId, here])

  const dist = (p) => miles(origin.lat, origin.lng, p.lat, p.lng)

  /* Hood chips come from the data: the eight most common, plus whichever is selected. */
  const hoods = useMemo(() => {
    const n = {}
    places.forEach((p) => { if (p.hood) n[p.hood] = (n[p.hood] || 0) + 1 })
    const top = Object.keys(n).sort((a, b) => n[b] - n[a]).slice(0, 8)
    if (hood !== 'all' && !top.includes(hood)) top.push(hood)
    return top
  }, [places, hood])

  const srcs = useMemo(() => {
    const present = new Set(places.flatMap((p) => listsOf(p)))
    return Object.keys(LIST_SOURCES).filter((k) => present.has(k))
  }, [places])

  const occs = useMemo(() => {
    const present = new Set(places.flatMap((p) => p.tags || []))
    return OCCASIONS.filter((t) => present.has(t))
  }, [places])

  const toggleHow = (k) => setHow((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })

  const inView = (p) => view === 'tried' ? (p.status === 'tried' || p.status === 'pass') : p.status === view

  const matches = (p) => {
    if (!inView(p)) return false
    if (q) {
      const hay = [p.name, p.hood, p.kind, p.note, p.source, p.l_stop, p.happy_hour, (p.tags || []).join(' ')].join(' ').toLowerCase()
      if (!q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return false
    }
    if (occ !== 'all' && !(p.tags || []).includes(occ)) return false
    if (src === 'rec' ? !p.rec_by : src !== 'all' && !listsOf(p).includes(src)) return false
    if (hood !== 'all' && p.hood !== hood) return false
    if (how.has('l') && !p.l_stop) return false
    if (how.has('moped') && !(p.moped_min != null && p.moped_min <= 20)) return false
    if (how.has('walk') && !(dist(p) != null && dist(p) <= 1)) return false
    if (how.has('hh') && !p.happy_hour) return false
    if (openOnly && !openState[p.id]?.open) return false
    return true
  }

  const { main, tail, counts } = useMemo(() => {
    const main = [], tail = []
    const counts = { want: 0, fav: 0, tried: 0 }
    places.forEach((p) => {
      counts[p.status === 'pass' ? 'tried' : p.status] += 1
      if (!matches(p)) return
      ;(view !== 'want' || hasWhy(p) ? main : tail).push(p)
    })
    const byDist = (a, b) => (dist(a) ?? 99) - (dist(b) ?? 99)
    if (how.size || originId !== 'home') { main.sort(byDist); tail.sort(byDist) }
    return { main, tail, counts }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, view, occ, src, hood, how, openOnly, q, origin, openState])

  const total = main.length + tail.length
  const label = { want: 'to try', fav: 'favorites', tried: 'tried' }[view]
  const filtered = occ !== 'all' || src !== 'all' || how.size > 0 || hood !== 'all' || openOnly || q.trim() !== '' || originId !== 'home'
  const resetFilters = () => { setOcc('all'); setSrc('all'); setHow(new Set()); setHood('all'); setOpenOnly(false); setQ(''); setOriginId('home') }

  return (
    <div className="app">
      <header className="mast">
        <div className="mast-row">
          <h1 className="title">Ro<em>unds</em></h1>
          <label className="origin">
            <span className="origin-lbl">From</span>
            <select id="origin" value={originId} onChange={(e) => setOriginId(e.target.value)}>
              {ORIGINS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
        </div>
        <div className="views" role="tablist">
          {Object.entries(STATUSES).map(([k, v]) => (
            <button key={k} className="view" role="tab" aria-selected={view === k} onClick={() => setView(k)}>
              {v} <b>{counts[k]}</b>
            </button>
          ))}
          <button className="view" role="tab" aria-selected={view === 'lists'} onClick={() => setView('lists')}>Lists</button>
        </div>
        <div className="search">
          <input id="q" type="search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search names, notes, hoods, L stops" autoComplete="off" />
        </div>
        <div className="chips" role="group" aria-label="Occasion">
          <button className="chip" aria-pressed={occ === 'all'} onClick={() => setOcc('all')}>All</button>
          {occs.map((t) => (
            <button key={t} className="chip" aria-pressed={occ === t} onClick={() => setOcc(t)}>{t}</button>
          ))}
        </div>
        <div className="chips" role="group" aria-label="Source">
          <button className="chip src-chip" aria-pressed={src === 'all'} onClick={() => setSrc('all')}>Any source</button>
          <button className="chip src-chip rec" aria-pressed={src === 'rec'} onClick={() => setSrc('rec')}>Personal recs</button>
          {srcs.map((k) => (
            <button key={k} className="chip src-chip list" aria-pressed={src === k} onClick={() => setSrc(k)}>{LIST_SOURCES[k]}</button>
          ))}
        </div>
        <div className="chips" role="group" aria-label="Getting there">
          <button className="chip how" aria-pressed={how.has('l')} onClick={() => toggleHow('l')}>Off the L</button>
          <button className="chip how" aria-pressed={how.has('moped')} onClick={() => toggleHow('moped')}>Moped</button>
          <button className="chip how" aria-pressed={how.has('walk')} onClick={() => toggleHow('walk')}>Walk</button>
          <button className="chip how" aria-pressed={how.has('hh')} onClick={() => toggleHow('hh')}>Happy hour</button>
        </div>
        <div className="chips hoods" role="group" aria-label="Neighborhood">
          <button className="chip hood" aria-pressed={hood === 'all'} onClick={() => setHood('all')}>Anywhere</button>
          {hoods.map((h) => (
            <button key={h} className="chip hood" aria-pressed={hood === h} onClick={() => setHood(h)}>{h}</button>
          ))}
        </div>
      </header>

      {view === 'lists' ? (
        <ListsView places={places} q={q} onAdd={add} />
      ) : (<>
      <div className="count">
        <div>
          {loading ? 'Loading' : <><b>{total}</b> {label}{tail.length ? <>, <b>{tail.length}</b> with no why</> : null}</>}
        </div>
        <div className="count-acts">
          {filtered && <button className="toggle reset" onClick={resetFilters}>Reset</button>}
          <button className="toggle" aria-pressed={openOnly} onClick={() => setOpenOnly((v) => !v)}>
            {openOnly ? 'Showing open now' : 'Open now only'}
          </button>
        </div>
      </div>

      <ul className="list">
        {!loading && !main.length && (
          <li className="empty">
            {view === 'fav' ? 'No favorites yet. Log a visit and pick Favorite.' : places.length ? 'Nothing on the list for that. Loosen a filter.' : 'Nothing here yet. Add the first place below.'}
          </li>
        )}
        {main.map((p) => (
          <Entry key={p.id} p={p} dist={dist(p)} who={who}
            onOpen={(id, st) => setOpenState((s) => (s[id]?.open === st?.open && s[id]?.until === st?.until ? s : { ...s, [id]: st }))}
            onWent={went} onEdit={() => setSheet({ mode: 'edit', place: p })} />
        ))}
      </ul>

      {tail.length > 0 && (
        <>
          <div className="tail-head">No why yet <span>{tail.length} places</span></div>
          <ul className="list">
            {tail.map((p) => (
              <Entry key={p.id} p={p} dist={dist(p)} who={who}
                onOpen={(id, st) => setOpenState((s) => (s[id]?.open === st?.open && s[id]?.until === st?.until ? s : { ...s, [id]: st }))}
                onWent={went} onEdit={() => setSheet({ mode: 'edit', place: p })} />
            ))}
          </ul>
        </>
      )}

      </>)}

      <p className="foot">
        Hours and price come from Google and refresh weekly. Distance is straight-line from the chosen origin; moped minutes are real routes from home.
        {' '}<button className="link" onClick={signOut}>Sign out{who ? ` ${who.email}` : ''}</button>
      </p>

      <div className="capture">
        <button className="btn-solid wide" onClick={() => setSheet({ mode: 'add' })}>Add a place</button>
      </div>

      {sheet && (
        <PlaceSheet mode={sheet.mode} place={sheet.place} existing={places} listEntries={listEntries}
          onClose={() => setSheet(null)}
          who={who}
          onSave={async (row) => { sheet.mode === 'add' ? await add(row) : await update(sheet.place.id, row); setSheet(null) }}
          onDelete={sheet.mode === 'edit' ? async () => { await remove(sheet.place.id); setSheet(null) } : null} />
      )}
    </div>
  )
}
