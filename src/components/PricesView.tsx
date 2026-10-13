import { useState, type FormEvent } from 'react'
import { errorMessage, toAmount } from '../lib/format'
import { useShopData } from '../lib/shop-data'
import { supabase } from '../lib/supabase'
import type { ClothingType, Service, ServicePrice } from '../lib/types'
import { cx } from '../lib/cx'
import { Button, EmptyState, Input, Notice } from './ui'

export function PricesView() {
  const { clothingTypes, services, loading } = useShopData()
  const [error, setError] = useState<string | null>(null)

  return (
    <>
      <p className="mb-5 max-w-[70ch] text-sm text-muted">
        Each price is for one piece of a garment type with one service. Orders keep the price they
        were taken at, so changes here only affect new orders.
      </p>

      {error && (
        <div className="mb-5">
          <Notice>{error}</Notice>
        </div>
      )}

      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <AddForm kind="clothing" onError={setError} />
        <AddForm kind="service" onError={setError} />
      </div>

      {!loading && (clothingTypes.length === 0 || services.length === 0) ? (
        <EmptyState title="Add garment types and services to start pricing">
          Prices are set for each pair, for example one garment type with one service.
          Once you have at least one of each, the price grid appears here.
        </EmptyState>
      ) : (
        <PriceGrid onError={setError} />
      )}
    </>
  )
}

function AddForm({ kind, onError }: { kind: 'clothing' | 'service'; onError: (e: string | null) => void }) {
  const { shop, reload } = useShopData()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const label = kind === 'clothing' ? 'Add a garment type' : 'Add a service'

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    onError(null)
    const { error } =
      kind === 'clothing'
        ? await supabase.from('clothing_types').insert({ shop_id: shop.id, clothing_type_name: name.trim() })
        : await supabase.from('services').insert({ shop_id: shop.id, service_name: name.trim() })
    if (error) onError(errorMessage(error))
    else {
      setName('')
      await reload()
    }
    setBusy(false)
  }

  const inputId = `add-${kind}`
  return (
    <form onSubmit={submit} className="card p-4">
      <label htmlFor={inputId} className="font-semibold">
        {label}
      </label>
      <div className="mt-2 flex gap-2">
        <Input
          id={inputId}
          required
          placeholder={kind === 'clothing' ? 'For example, shirt' : 'For example, wash and iron'}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" variant="secondary" disabled={busy || !name.trim()}>
          Add
        </Button>
      </div>
    </form>
  )
}

function PriceGrid({ onError }: { onError: (e: string | null) => void }) {
  const { clothingTypes, services, prices, reload } = useShopData()

  async function toggle(table: 'clothing_types' | 'services', row: ClothingType | Service) {
    onError(null)
    const { error } = await supabase.from(table).update({ is_active: !row.is_active }).eq('id', row.id)
    if (error) onError(errorMessage(error))
    await reload()
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">
          Price per piece, by clothing type and service. Leave a cell empty when the service is not offered.
        </caption>
        <thead>
          <tr className="border-b border-line align-bottom">
            <th scope="col" className="sticky left-0 z-[1] min-w-40 bg-paper px-4 py-3 text-sm font-semibold text-muted">
              Garment type
            </th>
            {services.map((s) => (
              <th key={s.id} scope="col" className="min-w-36 px-3 py-3">
                <span className={cx('block font-semibold', !s.is_active && 'text-muted line-through')}>
                  {s.service_name}
                </span>
                <button
                  type="button"
                  onClick={() => void toggle('services', s)}
                  className="text-sm font-normal text-brand hover:underline"
                >
                  {s.is_active ? 'Pause' : 'Resume'}
                  <span className="sr-only"> {s.service_name}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line/70">
          {clothingTypes.map((t) => (
            <tr key={t.id}>
              <th scope="row" className="sticky left-0 z-[1] bg-paper px-4 py-2.5 text-left">
                <span className={cx('block font-semibold', !t.is_active && 'text-muted line-through')}>
                  {t.clothing_type_name}
                </span>
                <button
                  type="button"
                  onClick={() => void toggle('clothing_types', t)}
                  className="text-sm font-normal text-brand hover:underline"
                >
                  {t.is_active ? 'Pause' : 'Resume'}
                  <span className="sr-only"> {t.clothing_type_name}</span>
                </button>
              </th>
              {services.map((s) => (
                <td key={s.id} className="px-3 py-2.5">
                  <PriceCell
                    clothingType={t}
                    service={s}
                    price={prices.find((p) => p.clothing_type_id === t.id && p.service_id === s.id)}
                    onError={onError}
                    onSaved={reload}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-line/70 px-4 py-3 text-sm text-muted">
        Prices save when you leave a cell. Clearing a cell stops offering that pair on new orders.
        Paused items and services stay on past orders but cannot be added to new ones.
      </p>
    </div>
  )
}

function PriceCell({
  clothingType,
  service,
  price,
  onError,
  onSaved,
}: {
  clothingType: ClothingType
  service: Service
  price: ServicePrice | undefined
  onError: (e: string | null) => void
  onSaved: () => Promise<void>
}) {
  const shown = price?.is_active ? toAmount(price.unit_price).toFixed(2) : ''
  const [value, setValue] = useState(shown)
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const { shop } = useShopData()

  async function save() {
    const trimmed = value.trim()
    if (trimmed === shown) return
    const amount = Number.parseFloat(trimmed)
    if (trimmed && !(amount >= 0)) {
      onError('Prices must be a number of zero or more.')
      setValue(shown)
      return
    }
    setState('saving')
    onError(null)
    let error
    if (!trimmed) {
      // Prices can't be deleted once an order uses them, so clearing deactivates.
      if (price) ({ error } = await supabase.from('service_prices').update({ is_active: false }).eq('id', price.id))
    } else if (price) {
      ;({ error } = await supabase
        .from('service_prices')
        .update({ unit_price: amount, is_active: true })
        .eq('id', price.id))
    } else {
      ;({ error } = await supabase.from('service_prices').insert({
        shop_id: shop.id,
        clothing_type_id: clothingType.id,
        service_id: service.id,
        unit_price: amount,
      }))
    }
    if (error) {
      onError(errorMessage(error))
      setValue(shown)
      setState('idle')
      return
    }
    await onSaved()
    if (trimmed) setValue(amount.toFixed(2))
    setState('saved')
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        aria-label={`Price for ${clothingType.clothing_type_name}, ${service.service_name}`}
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        placeholder="Not offered"
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setState('idle')
        }}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
        className={cx('max-w-32 text-right', !value && 'placeholder:text-sm')}
      />
      <span className="w-14 text-xs text-muted" aria-live="polite">
        {state === 'saving' ? 'Saving' : state === 'saved' ? 'Saved' : ''}
      </span>
    </div>
  )
}
