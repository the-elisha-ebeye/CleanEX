import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AppShell } from './components/AppShell'
import { AuthScreen } from './components/AuthScreen'
import { CleanexMark } from './components/Brand'
import { ShopSetup } from './components/ShopSetup'
import { Button, Notice } from './components/ui'
import { errorMessage } from './lib/format'
import { ShopDataProvider } from './lib/shop-data'
import { supabase } from './lib/supabase'
import type { Shop } from './lib/types'

type ShopState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; shop: Shop }
  | { status: 'error'; message: string }

function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <Splash />
  if (!session) return <AuthScreen />
  return <ShopGate key={session.user.id} userId={session.user.id} email={session.user.email} />
}

function ShopGate({ userId, email }: { userId: string; email: string | undefined }) {
  const [state, setState] = useState<ShopState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('shops')
      .select('*')
      .eq('owner_user_id', userId)
      .order('created_at')
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setState({ status: 'error', message: errorMessage(error) })
        else if (!data) setState({ status: 'missing' })
        else setState({ status: 'ready', shop: data as Shop })
      })
    return () => {
      cancelled = true
    }
  }, [userId, attempt])

  if (state.status === 'loading') return <Splash />
  if (state.status === 'error')
    return (
      <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-4 px-6">
        <h1 className="display text-3xl">Your shop could not be loaded</h1>
        <Notice>{state.message}</Notice>
        <div className="flex gap-3">
          <Button
            onClick={() => {
              setState({ status: 'loading' })
              setAttempt((n) => n + 1)
            }}
          >
            Try again
          </Button>
          <Button variant="secondary" onClick={() => supabase.auth.signOut()}>
            Sign out
          </Button>
        </div>
      </main>
    )
  if (state.status === 'missing')
    return <ShopSetup userId={userId} onCreated={(shop) => setState({ status: 'ready', shop })} />

  return (
    <ShopDataProvider shop={state.shop}>
      <AppShell email={email} />
    </ShopDataProvider>
  )
}

function Splash() {
  return (
    <div className="flex min-h-svh items-center justify-center" role="status">
      <CleanexMark className="size-12 animate-pulse" />
      <span className="sr-only">Loading</span>
    </div>
  )
}

export default App
