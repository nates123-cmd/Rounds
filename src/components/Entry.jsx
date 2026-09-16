import { useEffect, useMemo, useState } from 'react'
import { openNow, PRICE } from '../lib/hours'
import { fmtMiles } from '../lib/geo'
import { LIST_SOURCES } from '../lib/tags'

export function Entry({ p, dist, who, onOpen, onWent, onEdit }) {
  const [verdict, setVerdict] = useState(null) // null | { pick, line }
  const st = useMemo(() => openNow(p.google?.periods), [p.google])
  useEffect(() => { onOpen(p.id, st) }, [p.id, st, onOpen])

  const initial = p.added_by && who ? (p.added_by === who.userId ? (who.email?.[0] || '').toUpperCase() : 'A') : ''
  const tags = (p.tags || []).filter((t) => t !== 'nyt')
  const closed = p.business_status === 'CLOSED_PERMANENTLY'

  const meta = []
  if (closed) meta.push(<span key="c" className="closed">closed for good</span>)
  else if (st) meta.push(st.open
    ? <span key="o" className="open">open til {st.until}</span>
    : <span key="o" className="closed">closed{st.opens ? `, opens ${st.opens}` : ' now'}</span>)
  if (p.happy_hour) meta.push(<span key="h" className="hh">HH {p.happy_hour}</span>)
  if (p.google?.price && PRICE[p.google.price]) meta.push(<span key="p">{PRICE[p.google.price]}</span>)
  if (p.moped_min != null) meta.push(<span key="m">{p.moped_min} min moped</span>)
  else if (dist != null) meta.push(<span key="d">{fmtMiles(dist)}</span>)
  if (p.l_stop) meta.push(<span key="l" className="l">{p.l_stop}</span>)

  const why = p.status === 'fav'
    ? (p.note ? <p className="why back">{p.note}</p> : <p className="why none">what do you go back for?</p>)
    : (p.status === 'tried' || p.status === 'pass')
      ? (p.note ? <p className="why verdict">{p.note}</p> : null)
      : p.note ? <p className="why">{p.note}</p>
        : (tags.length || p.source === 'nyt') ? null : <p className="why none">no why yet, add one before you forget</p>

  const submit = async (e) => {
    e.preventDefault()
    if (!verdict?.pick) return
    await onWent(p, verdict.pick, verdict.line?.trim())
    setVerdict(null)
  }

  return (
    <li className={`entry${p.status === 'pass' ? ' is-pass' : ''}${closed ? ' is-closed' : ''}`}>
      <h2 className="name"><button className="name-btn" onClick={onEdit}>{p.name}</button></h2>
      <div className="src-col">
        {LIST_SOURCES[p.source] ? <span className="src">{LIST_SOURCES[p.source]}</span>
          : p.source ? <span className="src soft">{p.source}</span> : null}
        {initial && <span className="who">{initial}</span>}
      </div>
      <div className="hood">
        {[p.hood, p.kind].filter(Boolean).map((s, i) => <span key={i}>{i ? <span className="sep">&middot;</span> : null}{s}</span>)}
      </div>
      {tags.length > 0 && (
        <div className="tags">{tags.map((t, i) => <span key={t}>{i ? <span className="sep">&middot;</span> : null}{t}</span>)}</div>
      )}
      {why}
      <div className="meta">{meta.map((m, i) => <span key={i}>{i ? <span className="sep">&middot;</span> : null}{m}</span>)}</div>
      <div className="acts">
        {p.google?.maps_uri && <a className="went" href={p.google.maps_uri} target="_blank" rel="noreferrer">Go</a>}
        <button className="went" type="button" aria-expanded={!!verdict}
          onClick={() => setVerdict((v) => (v ? null : { pick: p.status === 'fav' ? 'fav' : '', line: '' }))}>
          {p.status === 'want' ? 'Went?' : 'Went again'}
        </button>
      </div>
      {verdict && (
        <form className="verdict" onSubmit={submit}>
          <div className="vopts">
            {[['fav', 'Favorite'], ['tried', 'Fine'], ['pass', 'Pass']].map(([k, v]) => (
              <button key={k} type="button" aria-pressed={verdict.pick === k} onClick={() => setVerdict((s) => ({ ...s, pick: k }))}>{v}</button>
            ))}
          </div>
          <input type="text" id={`verdict-${p.id}`} autoFocus autoComplete="off" value={verdict.line}
            onChange={(e) => setVerdict((s) => ({ ...s, line: e.target.value }))}
            placeholder={p.status === 'fav' ? 'what to go back for' : 'one line: the pasta, the patio, too loud'} />
          <button type="submit" className="btn-solid" disabled={!verdict.pick}>Log to Ink</button>
        </form>
      )}
    </li>
  )
}
