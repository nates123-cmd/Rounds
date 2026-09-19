import { useEffect, useMemo, useState } from 'react'
import { searchPlaces, placeAtmosphere } from '../lib/google'
import { parsePaste, extractUrls, kindOf } from '../lib/paste'
import { OCCASIONS, LIST_SOURCES } from '../lib/tags'
import { suggest } from '../lib/enrich'
import { fmtMiles } from '../lib/geo'

/* Free text in, a known list key out, so the badge and chip fire. */
function normalizeSource(v) {
  const t = v.trim().toLowerCase()
  if (/^(nyt|nyt best|new york times|times)/.test(t)) return 'nyt'
  if (/infatuation/.test(t)) return 'infatuation'
  return v.trim()
}

const blank = { name: '', hood: '', kind: '', note: '', source: '', rec_by: '', tags: [], lists: [], status: 'want', l_stop: '', happy_hour: '', happy_hour_source: null, links: {} }

/* The suite login is an email; the person is the bit before the @, capitalised. Amanda is Amanda, Nate is Nate. */
const firstName = (who) => {
  const e = who?.email || ''
  const n = e.split('@')[0].split(/[._-]/)[0]
  if (/kalb|amanda/i.test(e)) return 'Amanda'
  if (/nates?123|nate/i.test(e)) return 'Nate'
  return n ? n[0].toUpperCase() + n.slice(1) : ''
}

export function PlaceSheet({ mode, place, existing, listEntries = [], who, onClose, onSave, onDelete }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState([])
  const [searching, setSearching] = useState(false)
  const [picked, setPicked] = useState(mode === 'edit' ? place : null)
  const [form, setForm] = useState(mode === 'edit' ? { ...blank, ...place } : { ...blank, rec_by: firstName(who) })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [pasted, setPasted] = useState(false)
  /* Google Atmosphere for the picked place: fetched once here when the row
   * has none yet, saved with the row so the list never asks again. */
  const [atmo, setAtmo] = useState(mode === 'edit' ? place?.google?.atmo || null : null)
  const [atmoState, setAtmoState] = useState('') // '' | 'loading' | 'done' | 'failed'

  useEffect(() => {
    if (mode !== 'add' || picked || q.trim().length < 2 || extractUrls(q).length) { setHits([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try { setHits(await searchPlaces(q)) } catch (e) { setError(e.message) }
      setSearching(false)
    }, 450)
    return () => clearTimeout(t)
  }, [q, mode, picked])

  /* Enrich as soon as there is a Google place and no atmosphere on record. */
  const gpid = picked?.google_place_id
  useEffect(() => {
    if (!gpid || atmo || atmoState) return
    let gone = false
    setAtmoState('loading')
    placeAtmosphere(gpid)
      .then((a) => { if (!gone) { setAtmo(a); setAtmoState('done') } })
      .catch((e) => { if (!gone) { console.warn('atmo', e.message); setAtmoState('failed') } })
    return () => { gone = true }
  }, [gpid, atmo, atmoState])

  /* What the enrichment says, as a delta against the form as it stands. */
  const sug = useMemo(() => {
    if (!picked) return null
    const base = mode === 'edit' ? place : picked
    return suggest({ ...form, lat: base?.lat, lng: base?.lng, google: { ...(base?.google || {}), atmo } }, listEntries)
  }, [picked, place, mode, form, atmo, listEntries])

  /* In Add mode the facts (L stop, lists, Google's happy hour) go straight
   * into the form, where they are visible and editable before the save. Tags
   * stay suggestions until tapped: that is the "see it before tagging" rule. */
  useEffect(() => {
    if (mode !== 'add' || !sug) return
    setForm((f) => {
      const n = { ...f }
      if (!f.l_stop && sug.l_stop) n.l_stop = sug.l_stop.name
      if (sug.lists.length) n.lists = [...new Set([...(f.lists || []), ...sug.lists])]
      if (!f.happy_hour && sug.happy_hour) { n.happy_hour = sug.happy_hour; n.happy_hour_source = 'google' }
      if (!f.kind && sug.kind) n.kind = sug.kind
      return n
    })
  }, [mode, sug?.l_stop?.name, sug?.lists.join(','), sug?.happy_hour, sug?.kind]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Paste mode: anything with a link in it. Resolve, prefill, then let the
   * normal Google search find the place if the Maps link did not. */
  const handlePaste = async (text) => {
    setPasted(true); setError(null)
    try {
      const r = await parsePaste(text, setStatus)
      setStatus('')
      const note = r.note.length > 200 ? r.note.slice(0, 200) : r.note
      setForm((f) => ({ ...f, links: { ...f.links, ...r.links }, note: f.note || note, rec_by: r.recBy || f.rec_by }))
      if (r.query) {
        setStatus('Looking up ' + r.query)
        const hits = await searchPlaces(r.query + (r.mapsPlace?.lat ? '' : ' New York'))
        setStatus('')
        let h = hits[0]
        if (r.mapsPlace?.lat && hits.length) {
          h = hits.reduce((a, b) => (Math.abs(b.lat - r.mapsPlace.lat) + Math.abs(b.lng - r.mapsPlace.lng) < Math.abs(a.lat - r.mapsPlace.lat) + Math.abs(a.lng - r.mapsPlace.lng) ? b : a))
        }
        if (h) { pick(h); return }
        setQ(r.query)
      } else if (!Object.keys(r.links).length) {
        setQ(text)
      } else {
        setQ('')
        setPicked({}); setForm((f) => ({ ...f, name: f.name || '' }))
      }
    } catch (e) { setStatus(''); setError(e.message) }
  }

  const pick = (h) => {
    const dupe = existing.find((p) => p.google_place_id === h.google_place_id)
    if (dupe) { setError(`Already on the list as ${dupe.name} (${dupe.status}).`); return }
    setPicked(h)
    setForm((f) => ({ ...f, name: h.name, hood: h.hood, kind: h.kind }))
  }

  const toggleTag = (t) => setForm((f) => ({ ...f, tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t] }))
  const takeAll = () => sug && setForm((f) => ({ ...f, tags: [...new Set([...f.tags, ...sug.tags])] }))
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setHH = (e) => setForm((f) => ({ ...f, happy_hour: e.target.value, happy_hour_source: e.target.value.trim() ? 'manual' : null }))

  const save = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true); setError(null)
    const row = {
      name: form.name.trim(), hood: form.hood.trim(), kind: form.kind.trim(), note: form.note.trim(),
      source: normalizeSource(form.source),
      rec_by: (form.rec_by || '').trim(), links: form.links || {},
      tags: form.tags, lists: form.lists || [], status: form.status, l_stop: form.l_stop.trim() || null, happy_hour: form.happy_hour.trim() || null,
    }
    const hhChanged = mode === 'add' ? !!row.happy_hour : (form.happy_hour || '').trim() !== (place.happy_hour || '')
    if (hhChanged) row.happy_hour_source = row.happy_hour ? (form.happy_hour_source === 'google' ? 'google' : 'manual') : null
    if (mode === 'add' && picked?.google_place_id) Object.assign(row, {
      google_place_id: picked.google_place_id, lat: picked.lat, lng: picked.lng, business_status: picked.business_status,
      google: { ...picked.google, atmo: atmo || undefined },
    })
    if (mode === 'edit' && atmo && !place.google?.atmo) row.google = { ...(place.google || {}), atmo }
    /* Suggestions were on screen: whatever was not taken is a decision, not a nag. */
    if (sug?.has || atmoState === 'done') row.reviewed_at = new Date().toISOString()
    try { await onSave(row) } catch (err) { setError(err.message); setSaving(false) }
  }

  const useL = () => sug?.l_stop && setForm((f) => ({ ...f, l_stop: sug.l_stop.name }))
  const useLists = () => sug?.lists.length && setForm((f) => ({ ...f, lists: [...new Set([...(f.lists || []), ...sug.lists])] }))
  const useHH = () => sug?.happy_hour && setForm((f) => ({ ...f, happy_hour: sug.happy_hour, happy_hour_source: 'google' }))
  const useKind = () => sug?.kind && setForm((f) => ({ ...f, kind: sug.kind }))

  const showSug = picked && (sug?.has || sug?.summary || atmoState === 'loading')

  return (
    <div className="sheet-back" onClick={onClose}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="sheet-head">
          <span className="auth-label">{mode === 'add' ? 'Add a place' : 'Edit'}</span>
          <button type="button" className="link" onClick={onClose}>Close</button>
        </div>

        {mode === 'add' && !picked && (
          <>
            <textarea id="place-q" rows={2} autoFocus autoComplete="off" value={q}
              onChange={(e) => { const v = e.target.value; setQ(v); if (!pasted && extractUrls(v).length) handlePaste(v) }}
              onPaste={(e) => { const v = e.clipboardData.getData('text'); if (extractUrls(v).length || v.length > 60) { e.preventDefault(); setQ(v); handlePaste(v) } }}
              placeholder="Type a name, or paste anything: a Maps link, a text from a friend, a menu, a Resy page" />
            {status && <div className="auth-note">{status}</div>}
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
            {Object.keys(form.links || {}).length > 0 && (
              <>
                <label className="auth-label">Links</label>
                <div className="linkrow">
                  {Object.entries(form.links).map(([k, u]) => (
                    <span key={k} className="linkchip"><a href={u} target="_blank" rel="noreferrer">{k}</a>
                      <button type="button" aria-label={`remove ${k} link`} onClick={() => setForm((f) => { const l = { ...f.links }; delete l[k]; return { ...f, links: l } })}>&times;</button></span>
                  ))}
                </div>
              </>
            )}
            <input id="f-link" type="url" placeholder="Paste another link: menu, Resy, article" onKeyDown={(e) => {
              if (e.key !== 'Enter') return; e.preventDefault(); const u = e.target.value.trim(); if (!/^https?:/.test(u)) return
              setForm((f) => ({ ...f, links: { ...f.links, [kindOf(u)]: u } })); e.target.value = ''
            }} />

            {showSug && (
              <div className="sug" aria-label="Suggested from Google">
                <div className="sug-head">
                  <span className="auth-label">Suggested</span>
                  {atmoState === 'loading' && <span className="auth-note">reading Google</span>}
                  {sug?.tags.length > 1 && <button type="button" className="link" onClick={takeAll}>Take all tags</button>}
                </div>
                {sug?.tags.length > 0 && (
                  <div className="tagpick">
                    {sug.tags.map((t) => <button key={t} type="button" className="chip sug-chip" onClick={() => toggleTag(t)}>{t}</button>)}
                  </div>
                )}
                {sug?.summary && <div className="sug-line"><span className="sug-k">Google says</span> {sug.summary}</div>}
                {sug?.kind && <div className="sug-line"><span className="sug-k">Kind</span> {sug.kind} <button type="button" className="link" onClick={useKind}>use</button></div>}
                {sug?.l_stop && <div className="sug-line"><span className="sug-k">L stop</span> {sug.l_stop.name}, {fmtMiles(sug.l_stop.mi)} <button type="button" className="link" onClick={useL}>use</button></div>}
                {sug?.lists.length > 0 && <div className="sug-line"><span className="sug-k">On</span> {sug.lists.map((k) => LIST_SOURCES[k] || k).join(', ')} <button type="button" className="link" onClick={useLists}>use</button></div>}
                {sug?.happy_hour && <div className="sug-line"><span className="sug-k">Happy hour</span> {sug.happy_hour} <button type="button" className="link" onClick={useHH}>use</button></div>}
                {atmoState === 'done' && !sug?.has && !sug?.summary && <div className="auth-note">Google had nothing to add.</div>}
              </div>
            )}

            <label className="auth-label">Tags</label>
            <div className="tagpick">
              {OCCASIONS.map((t) => (
                <button key={t} type="button" className="chip" aria-pressed={form.tags.includes(t)} onClick={() => toggleTag(t)}>{t}</button>
              ))}
            </div>
            {(form.lists || []).length > 0 && (
              <div className="auth-note">On: {form.lists.map((k) => LIST_SOURCES[k] || k).join(', ')}</div>
            )}
            <div className="two">
              <div><label className="auth-label" htmlFor="f-rec">Rec'd by</label><input id="f-rec" value={form.rec_by || ''} onChange={set('rec_by')} placeholder="Nate, Amanda, a friend's name" /></div>
              <div><label className="auth-label" htmlFor="f-status">Status</label>
                <select id="f-status" value={form.status} onChange={set('status')}>
                  <option value="want">To try</option><option value="fav">Favorite</option><option value="tried">Tried, fine</option><option value="pass">Pass</option>
                </select></div>
            </div>
            <div className="two">
              <div><label className="auth-label" htmlFor="f-source">Source</label><input id="f-source" value={form.source} onChange={set('source')} placeholder="NYT Best, Infatuation, IG" /></div>
              <div><label className="auth-label" htmlFor="f-kind2">&nbsp;</label><div className="auth-note">Rec'd by is a person. Source is where you saw it.</div></div>
            </div>
            <div className="two">
              <div><label className="auth-label" htmlFor="f-l">L stop</label><input id="f-l" value={form.l_stop || ''} onChange={set('l_stop')} placeholder="Bedford" /></div>
              <div><label className="auth-label" htmlFor="f-hh">Happy hour{form.happy_hour_source === 'google' ? ', per Google' : ''}</label><input id="f-hh" value={form.happy_hour || ''} onChange={setHH} placeholder="M to F 4 to 7p" /></div>
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
