import { useState, type FormEvent } from 'react'
import { errorMessage } from '../lib/format'
import { supabase } from '../lib/supabase'
import { Wordmark } from './Brand'
import { Button, Field, Icon, Input, Notice, type IconName } from './ui'

type Mode = 'sign-in' | 'sign-up'

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)
    if (mode === 'sign-in') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(errorMessage(error))
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) setError(errorMessage(error))
      else if (!data.session)
        setInfo(`We sent a confirmation link to ${email}. Open it, then sign in here.`)
    }
    setBusy(false)
  }

  return (
    <main className="grid min-h-svh lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <section className="relative flex flex-col justify-between gap-10 overflow-hidden bg-taupe-50 px-6 py-8 sm:px-10 lg:px-14 lg:py-12">
        <Wordmark />
        <div>
          <h1 className="display max-w-[13ch] text-4xl text-ink sm:text-5xl lg:text-6xl">
            Every order, from drop-off to <span className="text-brand">pickup.</span>
          </h1>
          <p className="mt-5 max-w-[44ch] text-lg text-ink-soft">
            Take in orders, track each load through the shop, and see who still owes what before you
            hand anything over.
          </p>
        </div>
        <FeatureCards />
      </section>

      <section className="flex items-center justify-center px-6 py-12 sm:px-10">
        <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-5" noValidate={false}>
          <div>
            <h2 className="display text-3xl">
              {mode === 'sign-in' ? 'Sign in to your shop' : 'Create your account'}
            </h2>
            <p className="mt-1 text-muted">
              {mode === 'sign-in'
                ? 'Use the email and password you registered with.'
                : 'You will name your shop on the next step.'}
            </p>
          </div>

          {error && <Notice>{error}</Notice>}
          {info && <Notice tone="info">{info}</Notice>}

          <Field label="Email">
            {(id) => (
              <Input
                id={id}
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </Field>
          <Field
            label="Password"
            hint={mode === 'sign-up' ? 'At least 6 characters.' : undefined}
          >
            {(id, describedBy) => (
              <Input
                id={id}
                type="password"
                autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                required
                minLength={6}
                aria-describedby={describedBy}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </Field>

          <Button type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
          </Button>

          <p className="text-center text-sm text-muted">
            {mode === 'sign-in' ? 'New to CleanEX?' : 'Already registered?'}{' '}
            <button
              type="button"
              className="font-semibold text-brand underline-offset-4 hover:underline"
              onClick={() => {
                setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')
                setError(null)
                setInfo(null)
              }}
            >
              {mode === 'sign-in' ? 'Create an account' : 'Sign in instead'}
            </button>
          </p>
        </form>
      </section>
    </main>
  )
}

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'orders', title: 'Orders & receipts', text: 'Priced from your list, printed in a click.' },
  { icon: 'cash', title: 'Payments & balances', text: 'Deposits, part payments, nothing missed.' },
  { icon: 'box', title: 'Supplies & costs', text: 'Low-stock alerts and monthly spend.' },
]

function FeatureCards() {
  return (
    <ul className="hidden gap-3 sm:grid sm:grid-cols-3">
      {FEATURES.map((f) => (
        <li key={f.title} className="rounded-2xl border border-taupe-100 bg-paper p-4 shadow-[var(--shadow-card)]">
          <span className="grid size-9 place-items-center rounded-xl bg-brand-wash text-brand">
            <Icon name={f.icon} />
          </span>
          <p className="mt-3 font-semibold text-ink">{f.title}</p>
          <p className="mt-0.5 text-sm text-taupe-700">{f.text}</p>
        </li>
      ))}
    </ul>
  )
}
