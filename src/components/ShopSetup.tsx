import { useState, type FormEvent } from 'react'
import { errorMessage } from '../lib/format'
import { supabase } from '../lib/supabase'
import type { Shop } from '../lib/types'
import { Wordmark } from './Brand'
import { Button, Field, Input, Notice } from './ui'

export function ShopSetup({ userId, onCreated }: { userId: string; onCreated: (shop: Shop) => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const { data, error } = await supabase
      .from('shops')
      .insert({ business_name: name.trim(), owner_user_id: userId })
      .select('*')
      .single()
    setBusy(false)
    if (error) setError(errorMessage(error))
    else onCreated(data as Shop)
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-10 px-6 py-12">
      <Wordmark />
      <form
        onSubmit={submit}
        className="flex w-full max-w-md flex-col gap-5 rounded-xl bg-paper p-6 shadow-[0_1px_0_var(--color-line)] sm:p-8"
      >
        <div>
          <h1 className="display text-3xl">Name your shop</h1>
          <p className="mt-1 text-muted">
            This name appears at the top of the dashboard. You can add customers, services
            and prices once it is set up.
          </p>
        </div>
        {error && <Notice>{error}</Notice>}
        <Field label="Business name">
          {(id) => (
            <Input
              id={id}
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Button type="submit" disabled={busy || !name.trim()}>
          {busy ? 'Creating shop…' : 'Create shop'}
        </Button>
      </form>
    </main>
  )
}
