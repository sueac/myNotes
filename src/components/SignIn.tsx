import { useState } from "react"
import { supabase } from "../lib/supabase"

export function SignIn() {
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function signIn() {
    setBusy(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) {
      setMessage(error.message)
      setBusy(false)
    }
  }

  return (
    <main className="app">
      <section className="widget">
        <div className="now-title">Notes</div>
        <div className="subtle">Sign in to sync your notes across devices.</div>
        {message && <div className="subtle">{message}</div>}
        <footer className="actions">
          <button className="text-btn blue" onClick={signIn} disabled={busy}>
            Sign in with Google
          </button>
        </footer>
      </section>
    </main>
  )
}