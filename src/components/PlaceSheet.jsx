import { useEffect, useState } from 'react'
import { searchPlaces } from '../lib/google'
import { OCCASIONS } from '../lib/tags'

/* Free text in, a known list key out, so the badge and chip fire. */
function normalizeSource(v) {
  const t = v.trim().toLowerCase()
  if (/^(nyt|nyt best|new york times|times)/.test(t)) return 'nyt'
  if (/infatuation/.test(t)) return 'infatuation'
  return v.trim()
}

const blank = { name: '', hood: '', kind: '', note: '', source: '', tags: [], status: 'want', l_stop: '', happy_hour: '' }

export function PlaceSheet({ mode, place, existing, onClose, onSave, onDelete }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState([])
  const [searching, setSearching] = useState(false)
  const [picked, setPicked] = useState(mode === 'edit' ? place : null)
  const [form, setForm] = useState(mode === 'edit' ? { ...blank, ...place } : blank)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (mode !== 'add' || picked || q.trim().length < 2) { setHits([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try { setHits(await searchPlaces(q)) } catch (e) { setError(e.message) }
      setSearching(false)
    }, 450)
    return () => clearTimeout(t)
  }, [q, mode, picked])

  const pick = (h) => {
    const dupe = existing.find((p) => p.google_place_id === h.google_place_id)
    if (dupe) { setError(`Already on the list as ${dupe.name} (${dupe.status}).`); return }
    setPicked(h)
    setForm((f) => ({ ...f, name: h.name, hood: h.hood, kind: h.kind }))
  }

  const toggleTag = (t) => setForm((f) => ({ ...f, tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t] }))
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const save = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true); setError(null)
    const row = {
      name: form.name.trim(), hood: form.hood.trim(), kind: form.kind.trim(), note: form.note.trim(),
      source: normalizeSource(form.source),
      tags: form.tags, status: form.status, l_stop: form.l_stop.trim() || null, happy_hour: form.happy_hour.trim() || null,
    }
    if (mode === 'add' && picked) Object.assign(row, {
      google_place_id: picked.google_place_id, lat: picked.lat, lng: picked.lng, business_status: picked.business_status, google: picked.google,
    })
    try { await onSave(row) } catch (err) { setError(err.message); setSaving(false) }
  }

  return (
    <div className="sheet-back" onClick={onClose}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="sheet-head">
          <span className="auth-label">{mode === 'add' ? 'Add a place' : 'Edit'}</span>
          <button type="button" className="link" onClick={onClose}>Close</button>
        </div>

        {mode === 'add' && !picked && (
          <>
            <input id="place-q" type="search" autoFocus autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Name, then a neighborhood if it helps" />
            <ul className="hits">
              {searching && <li className="hit muted">Searching</li>}
              {hits.map((h) => (
                <li key={h.google_place_id}><button type="button" className="hit" onClick={() => pick(h)}>
                  <b>{h.name}</b><span>{[h.hood, h.kind].filter(Boolean).join(' · ')}</span><span className="muted">{h.address}</span>
                </button></li>
              ))}
              {!searching && q.trim().length >= 2 && !hits.length && (
                <li className="hit muted">Nothing from Google. <button type="button" className="link" onClick={() => { setPicked({}); setForm((f) => ({ ...f, name: q })) }}>Add "{q}" by hand</button></li>
              )}
            </ul>
          </>
        )}

        {(picked || mode === 'edit') && (
          <>
            <label className="auth-label" htmlFor="f-name">Name</label>
            <input id="f-name" value={form.name} onChange={set('name')} required />
            <div className="two">
              <div><label className="auth-label" htmlFor="f-hood">Neighborhood</label><input id="f-hood" value={form.hood} onChange={set('hood')} /></div>
              <div><label className="auth-label" htmlFor="f-kind">Kind</label><input id="f-kind" value={form.kind} onChange={set('kind')} placeholder="Wine bar, Sichuan" /></div>
            </div>
            <label className="auth-label" htmlFor="f-note">{form.status === 'fav' ? 'Go back for' : 'Why it is on the list'}</label>
            <input id="f-note" value={form.note} onChange={set('note')} placeholder="one line, future you will thank you" />
            <label className="auth-label">Tags</label>
            <div className="tagpick">
              {OCCASIONS.map((t) => (
                <button key={t} type="button" className="chip" aria-pressed={form.tags.includes(t)} onClick={() => toggleTag(t)}>{t}</button>
              ))}
            </div>
            <div className="two">
              <div><label className="auth-label" htmlFor="f-source">Source</label><input id="f-source" value={form.source} onChange={set('source')} placeholder="NYT Best, Infatuation, a friend, IG" /></div>
              <div><label className="auth-label" htmlFor="f-status">Status</label>
                <select id="f-status" value={form.status} onChange={set('status')}>
                  <option value="want">To try</option><option value="fav">Favorite</option><option value="tried">Tried, fine</option><option value="pass">Pass</option>
                </select></div>
            </div>
            <div className="two">
              <div><label className="auth-label" htmlFor="f-l">L stop</label><input id="f-l" value={form.l_stop || ''} onChange={set('l_stop')} placeholder="Bedford" /></div>
              <div><label className="auth-label" htmlFor="f-hh">Happy hour</label><input id="f-hh" value={form.happy_hour || ''} onChange={set('happy_hour')} placeholder="M to F 4 to 7p" /></div>
            </div>
            <div className="sheet-acts">
              {onDelete && <button type="button" className="link danger" onClick={() => { if (confirm(`Remove ${form.name} from the list?`)) onDelete() }}>Remove</button>}
              <button type="submit" className="btn-solid" disabled={saving}>{saving ? 'Saving' : mode === 'add' ? 'Add to the list' : 'Save'}</button>
            </div>
          </>
        )}
        {error && <div className="err">{error}</div>}
      </form>
    </div>
  )
}
