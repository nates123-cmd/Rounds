/**
 * Email one-time-code sign in, the suite's usual gate.
 *
 * Everything in rounds_places is behind RLS through household_ids(), so a
 * signed-out client gets an empty list rather than an error. The gate stands
 * in front so an empty list always means an empty list.
 */
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const STATES = { loading: 'loading', prompt: 'prompt', code: 'code', ready: 'ready' }

export function AuthGate({ children }) {
  const [state, setState] = useState(STATES.loading)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setState(data.session ? STATES.ready : STATES.prompt)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (mounted) setState(session ? STATES.ready : STATES.prompt)
    })
    return () => { mounted = false; sub.subscription.unsubscribe() }
  }, [])

  const sendCode = async (e) => {
    e.preventDefault()
    if (!email || busy) return
    setBusy(true); setError(null)
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
    setBusy(false)
    if (error) { setError(error.message); return }
    setCode(''); setState(STATES.code)
  }

  const verifyCode = async (e) => {
    e.preventDefault()
    if (code.length !== 8 || busy) return
    setBusy(true); setError(null)
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
    setBusy(false)
    if (error) setError(error.message)
  }

  if (state === STATES.loading) return <div className="auth-shell" />
  if (state === STATES.ready) return children

  return (
    <div className="auth-shell">
      <div className="auth-col">
        <h1 className="title">Ro<em>unds</em></h1>
        <p className="auth-sub">Where to go tonight, and why it made the list. Sign in with your email and the list is yours.</p>

        {state === STATES.prompt && (
          <form onSubmit={sendCode} className="auth-form">
            <label className="auth-label" htmlFor="auth-email">Email</label>
            <input id="auth-email" type="email" autoComplete="email" autoFocus required
              value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            <button className="btn-solid" type="submit" disabled={busy || !email}>
              {busy ? 'Sending' : 'Email me a code'}
            </button>
            {error && <div className="err">{error}</div>}
            <div className="auth-note">The code comes from the suite, not from Rounds. It can take a minute.</div>
          </form>
        )}

        {state === STATES.code && (
          <form onSubmit={verifyCode} className="auth-form">
            <label className="auth-label" htmlFor="auth-code">8-digit code</label>
            <input id="auth-code" type="text" inputMode="numeric" autoComplete="one-time-code" autoFocus required
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="12345678" maxLength={8} />
            <button className="btn-solid" type="submit" disabled={busy || code.length !== 8}>
              {busy ? 'Checking' : 'Sign in'}
            </button>
            {error && <div className="err">{error}</div>}
            <div className="auth-note">Sent to {email}.</div>
            <button type="button" className="link" onClick={() => { setError(null); setCode(''); setState(STATES.prompt) }}>
              Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export async function signOut() {
  await supabase.auth.signOut()
}
