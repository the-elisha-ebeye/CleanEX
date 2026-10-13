import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { cx } from '../lib/cx'
import { errorMessage, formatAmount, formatDate, monthStartISO, toAmount, todayISO } from '../lib/format'
import { useShopData } from '../lib/shop-data'
import { supabase } from '../lib/supabase'
import type { MovementType, StockMovement, SupplyStock } from '../lib/types'
import {
  Button,
  Dialog,
  EmptyState,
  Field,
  Icon,
  Input,
  Loading,
  Notice,
  PageHeader,
  Panel,
  SearchInput,
  Select,
  StatCard,
  Textarea,
} from './ui'

const qty = (n: number | string) => {
  const v = toAmount(n)
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}

const MOVEMENT_LABEL: Record<MovementType, string> = {
  purchase: 'Purchase',
  usage: 'Used',
  adjustment: 'Adjustment',
}

export function InventoryView() {
  const { supplies, opsError, opsLoading: loading, shop } = useShopData()
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [adding, setAdding] = useState(false)
  const [moving, setMoving] = useState<{ supply: SupplyStock; type: MovementType } | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)
  const [purchasesThisMonth, setPurchasesThisMonth] = useState<number | null>(null)

  useEffect(() => {
    if (opsError) return
    let cancelled = false
    supabase
      .from('stock_movements')
      .select('total_cost')
      .eq('shop_id', shop.id)
      .eq('movement_type', 'purchase')
      .gte('occurred_on', monthStartISO())
      .then(({ data }) => {
        if (!cancelled) setPurchasesThisMonth((data ?? []).reduce((s, r) => s + toAmount(r.total_cost), 0))
      })
    return () => {
      cancelled = true
    }
  }, [shop.id, supplies, opsError])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return supplies
      .filter((s) => showArchived || s.is_active)
      .filter((s) => !q || s.supply_name.toLowerCase().includes(q))
      .sort((a, b) => Number(b.is_low) - Number(a.is_low) || a.supply_name.localeCompare(b.supply_name))
  }, [supplies, query, showArchived])

  const active = supplies.filter((s) => s.is_active)
  const low = active.filter((s) => s.is_low)
  const viewingSupply = supplies.find((s) => s.supply_id === viewing)

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Detergents, hangers, bags and other supplies. Set a minimum to get a low-stock alert."
        action={
          !opsError && (
            <Button onClick={() => setAdding(true)}>
              <Icon name="plus" />
              Add supply
            </Button>
          )
        }
      />

      {opsError ? (
        <Notice tone="warning">
          Inventory is not available yet: {opsError}
        </Notice>
      ) : (
        <>
          <section aria-label="Inventory summary" className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            <StatCard label="Supplies tracked" icon="box" tone="blue" value={loading ? '…' : active.length} />
            <StatCard
              label="Low stock"
              icon="alert"
              tone={low.length ? 'coral' : 'green'}
              value={loading ? '…' : low.length}
              detail={low.length ? 'At or below minimum' : 'Everything above minimum'}
            />
            <StatCard
              label="Purchases this month"
              icon="cash"
              tone="amber"
              value={purchasesThisMonth === null ? '…' : formatAmount(purchasesThisMonth)}
              detail="From recorded purchase costs"
              className="max-sm:col-span-2"
            />
          </section>

          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <SearchInput
              label="Search supplies"
              placeholder="Search supplies"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="sm:max-w-xs"
            />
            <label className="flex items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="size-4 accent-brand" />
              Show archived
            </label>
          </div>

          {loading ? (
            <Loading />
          ) : rows.length === 0 ? (
            <EmptyState
              title={supplies.length === 0 ? 'No supplies yet' : 'No supplies match'}
              action={supplies.length === 0 && <Button onClick={() => setAdding(true)}>Add supply</Button>}
            >
              {supplies.length === 0 ? 'Add the supplies you buy regularly and how much you have now.' : 'Try another name.'}
            </EmptyState>
          ) : (
            <Panel>
              <table className="w-full border-collapse text-left text-[0.92rem]">
                <caption className="sr-only">Supplies</caption>
                <thead className="hidden border-b border-line bg-rinse/60 text-xs tracking-wide text-muted uppercase md:table-header-group">
                  <tr>
                    <th scope="col" className="px-5 py-2.5 font-semibold">Supply</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-semibold">On hand</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-semibold">Minimum</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Status</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Last purchase</th>
                    <th scope="col" className="px-5 py-2.5 text-right font-semibold"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((s) => (
                    <tr key={s.supply_id} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 px-4 py-3 md:table-row md:p-0">
                      <td className="min-w-0 md:px-5 md:py-3">
                        <button type="button" onClick={() => setViewing(s.supply_id)} className="text-left font-semibold hover:text-brand">
                          {s.supply_name}
                        </button>
                        {!s.is_active && <span className="ml-2 text-xs text-muted">Archived</span>}
                        <span className="block text-xs text-muted md:hidden">
                          Minimum {qty(s.minimum_quantity)} {s.unit}
                        </span>
                      </td>
                      <td className="text-right md:px-3 md:py-3">
                        <span className={cx('font-semibold', s.is_low && 'text-owed')}>{qty(s.quantity_on_hand)}</span>{' '}
                        <span className="text-muted">{s.unit}</span>
                      </td>
                      <td className="hidden text-right text-ink-soft md:table-cell md:px-3 md:py-3">{qty(s.minimum_quantity)}</td>
                      <td className="hidden md:table-cell md:px-3 md:py-3">
                        <StockBadge supply={s} />
                      </td>
                      <td className="hidden text-ink-soft md:table-cell md:px-3 md:py-3">{formatDate(s.last_purchase_on)}</td>
                      <td className="col-span-2 md:px-5 md:py-3">
                        <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
                          <span className="mr-auto md:hidden"><StockBadge supply={s} /></span>
                          <Button size="sm" variant="secondary" disabled={!s.is_active} onClick={() => setMoving({ supply: s, type: 'purchase' })}>
                            Purchase
                          </Button>
                          <Button size="sm" variant="secondary" disabled={!s.is_active} onClick={() => setMoving({ supply: s, type: 'usage' })}>
                            Use
                          </Button>
                          <Button size="sm" variant="quiet" disabled={!s.is_active} onClick={() => setMoving({ supply: s, type: 'adjustment' })}>
                            Adjust
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
        </>
      )}

      <Dialog open={adding} onClose={() => setAdding(false)} title="Add supply">
        {adding && <SupplyForm supply={null} onDone={() => setAdding(false)} />}
      </Dialog>
      <Dialog
        open={!!moving}
        onClose={() => setMoving(null)}
        title={moving ? `${MOVEMENT_LABEL[moving.type]}: ${moving.supply.supply_name}` : 'Stock'}
      >
        {moving && <MovementForm supply={moving.supply} initialType={moving.type} onDone={() => setMoving(null)} />}
      </Dialog>
      <SupplyDrawer supply={viewingSupply} onClose={() => setViewing(null)} />
    </>
  )
}

function StockBadge({ supply }: { supply: SupplyStock }) {
  if (!supply.is_active) return <span className="text-sm text-muted">Archived</span>
  if (supply.is_low)
    return <span className="inline-flex rounded-full bg-owed-wash px-2.5 py-0.5 text-[0.8rem] font-semibold text-owed">Low stock</span>
  return <span className="inline-flex rounded-full bg-settled-wash px-2.5 py-0.5 text-[0.8rem] font-semibold text-settled">In stock</span>
}

function SupplyForm({ supply, onDone }: { supply: SupplyStock | null; onDone: () => void }) {
  const { shop, reload } = useShopData()
  const [name, setName] = useState(supply?.supply_name ?? '')
  const [unit, setUnit] = useState(supply?.unit ?? '')
  const [minimum, setMinimum] = useState(supply ? qty(supply.minimum_quantity) : '')
  const [opening, setOpening] = useState('')
  const [notes, setNotes] = useState(supply?.notes ?? '')
  const [active, setActive] = useState(supply?.is_active ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const min = minimum.trim() ? Number(minimum) : 0
    const open = opening.trim() ? Number(opening) : 0
    if (!(min >= 0)) return setError('The minimum must be zero or more.')
    if (!(open >= 0)) return setError('Opening stock must be zero or more.')
    setBusy(true)
    setError(null)
    const { error } = supply
      ? await supabase
          .from('supplies')
          .update({ supply_name: name.trim(), unit: unit.trim() || 'units', minimum_quantity: min, notes: notes.trim() || null, is_active: active })
          .eq('id', supply.supply_id)
      : await supabase.rpc('create_supply', {
          p_shop_id: shop.id,
          p_supply_name: name.trim(),
          p_unit: unit.trim() || 'units',
          p_minimum_quantity: min,
          p_opening_quantity: open,
          p_notes: notes.trim() || null,
        })
    if (error) {
      setBusy(false)
      return setError(/supplies_shop_name_key/.test(error.message) ? 'A supply with that name already exists.' : errorMessage(error))
    }
    await reload()
    onDone()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <Notice>{error}</Notice>}
      <Field label="Name">{(id) => <Input id={id} required value={name} onChange={(e) => setName(e.target.value)} placeholder="For example, liquid detergent" />}</Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Unit" hint="litres, kg, packs, pieces…">
          {(id, d) => <Input id={id} aria-describedby={d} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="units" />}
        </Field>
        <Field label="Minimum level" hint="Alert at or below this.">
          {(id, d) => <Input id={id} aria-describedby={d} type="number" min="0" step="0.01" inputMode="decimal" value={minimum} onChange={(e) => setMinimum(e.target.value)} />}
        </Field>
        {!supply && (
          <Field label="Opening stock" hint="How much you have now.">
            {(id, d) => <Input id={id} aria-describedby={d} type="number" min="0" step="0.01" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} />}
          </Field>
        )}
      </div>
      <Field label="Notes (optional)">{(id) => <Textarea id={id} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
      {supply && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!active} onChange={(e) => setActive(!e.target.checked)} className="size-4 accent-brand" />
          Archive this supply (hide it and stop low-stock alerts)
        </label>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="quiet" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={busy || !name.trim()}>{busy ? 'Saving…' : supply ? 'Save changes' : 'Add supply'}</Button>
      </div>
    </form>
  )
}

function MovementForm({ supply, initialType, onDone }: { supply: SupplyStock; initialType: MovementType; onDone: () => void }) {
  const { shop, reload } = useShopData()
  const [type, setType] = useState<MovementType>(initialType)
  const [amount, setAmount] = useState('')
  const [direction, setDirection] = useState<'add' | 'remove'>('add')
  const [cost, setCost] = useState('')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submitting = useRef(false)
  const onHand = toAmount(supply.quantity_on_hand)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting.current) return
    const n = Number(amount)
    if (!(n > 0)) return setError('Enter a quantity greater than zero.')
    if (type === 'purchase' && cost.trim() && !(Number(cost) >= 0)) return setError('The cost must be zero or more.')
    const change = type === 'purchase' ? n : type === 'usage' ? -n : direction === 'add' ? n : -n
    if (onHand + change < 0) return setError(`Only ${qty(onHand)} ${supply.unit} on hand.`)
    if (date > todayISO()) return setError('The date cannot be in the future.')
    submitting.current = true
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('stock_movements').insert({
      shop_id: shop.id,
      supply_id: supply.supply_id,
      movement_type: type,
      quantity_change: change,
      total_cost: type === 'purchase' && cost.trim() ? Number(cost) : null,
      occurred_on: date,
      note: note.trim() || null,
    })
    if (error) {
      submitting.current = false
      setBusy(false)
      return setError(errorMessage(error))
    }
    await reload()
    onDone()
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        On hand now: <span className="font-semibold text-ink">{qty(onHand)} {supply.unit}</span>
      </p>
      {error && <Notice>{error}</Notice>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type">
          {(id) => (
            <Select id={id} value={type} onChange={(e) => setType(e.target.value as MovementType)}>
              <option value="purchase">Purchase (stock in)</option>
              <option value="usage">Used (stock out)</option>
              <option value="adjustment">Adjustment (count correction)</option>
            </Select>
          )}
        </Field>
        {type === 'adjustment' && (
          <Field label="Direction">
            {(id) => (
              <Select id={id} value={direction} onChange={(e) => setDirection(e.target.value as 'add' | 'remove')}>
                <option value="add">Add to stock</option>
                <option value="remove">Remove from stock</option>
              </Select>
            )}
          </Field>
        )}
        <Field label={`Quantity (${supply.unit})`}>
          {(id) => <Input id={id} type="number" min="0.01" step="0.01" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} />}
        </Field>
        {type === 'purchase' && (
          <Field label="Total cost (optional)">
            {(id) => <Input id={id} type="number" min="0" step="0.01" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />}
          </Field>
        )}
        <Field label="Date">{(id) => <Input id={id} type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
      </div>
      <Field label="Note (optional)">
        {(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} placeholder={type === 'purchase' ? 'Supplier, invoice number' : 'Reason'} />}
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="quiet" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
      </div>
    </form>
  )
}

function SupplyDrawer({ supply, onClose }: { supply: SupplyStock | undefined; onClose: () => void }) {
  const [movements, setMovements] = useState<StockMovement[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const id = supply?.supply_id
  const onHand = supply?.quantity_on_hand

  useEffect(() => {
    if (!id) return
    let cancelled = false
    // Reset before loading this supply's history.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMovements(null)
    setError(null)
    supabase
      .from('stock_movements')
      .select('*')
      .eq('supply_id', id)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setError(errorMessage(error))
        setMovements((data ?? []) as StockMovement[])
      })
    return () => {
      cancelled = true
    }
  }, [id, onHand])

  return (
    <Dialog
      open={!!supply}
      onClose={() => {
        setEditing(false)
        onClose()
      }}
      variant="drawer"
      title={supply?.supply_name ?? 'Supply'}
    >
      {supply &&
        (editing ? (
          <SupplyForm supply={supply} onDone={() => setEditing(false)} />
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-3xl font-semibold">
                  {qty(supply.quantity_on_hand)} <span className="text-base font-normal text-muted">{supply.unit} on hand</span>
                </p>
                <p className="mt-1 text-sm text-muted">Minimum {qty(supply.minimum_quantity)} {supply.unit}</p>
                {supply.notes && <p className="mt-1 text-sm text-ink-soft">{supply.notes}</p>}
              </div>
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
            </div>
            {error && <Notice>{error}</Notice>}
            <section aria-labelledby="movement-history">
              <h3 id="movement-history" className="font-semibold">Stock history</h3>
              {!movements ? (
                <Loading />
              ) : movements.length === 0 ? (
                <p className="mt-2 text-sm text-muted">No stock recorded yet.</p>
              ) : (
                <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
                  {movements.map((m) => {
                    const change = toAmount(m.quantity_change)
                    return (
                      <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                        <span className="min-w-0">
                          <span className="block font-semibold">{MOVEMENT_LABEL[m.movement_type]}</span>
                          <span className="block text-xs text-muted">
                            {formatDate(m.occurred_on)}
                            {m.note && ` · ${m.note}`}
                            {m.total_cost !== null && ` · cost ${formatAmount(m.total_cost)}`}
                          </span>
                        </span>
                        <span className={cx('shrink-0 font-semibold', change > 0 ? 'text-settled' : 'text-owed')}>
                          {change > 0 ? '+' : '−'}
                          {qty(Math.abs(change))}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>
        ))}
    </Dialog>
  )
}
