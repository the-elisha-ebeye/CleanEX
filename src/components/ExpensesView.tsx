import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { cx } from '../lib/cx'
import {
  errorMessage,
  formatAmount,
  formatDate,
  monthStartISO,
  nextMonthStartISO,
  toAmount,
  todayISO,
} from '../lib/format'
import { PAYMENT_METHODS } from '../lib/payments'
import { useShopData } from '../lib/shop-data'
import { serviceState } from '../lib/ops'
import { viewHref } from '../lib/shell'
import { supabase } from '../lib/supabase'
import type { EquipmentStatus, Expense, MaintenanceRecord } from '../lib/types'
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
  Segmented,
  Select,
  StatCard,
  Textarea,
} from './ui'

const CATEGORIES = ['Rent', 'Utilities', 'Wages', 'Water', 'Fuel', 'Repairs', 'Transport', 'Marketing', 'Other']

type Tab = 'expenses' | 'equipment'

export function ExpensesView({ params }: { params: URLSearchParams }) {
  const { opsError } = useShopData()
  const tab: Tab = params.get('tab') === 'equipment' ? 'equipment' : 'expenses'
  return (
    <>
      <PageHeader title="Expenses" description="Running costs and equipment upkeep, so you can see what the shop spends each month." />
      <div className="mb-6">
        <Segmented
          label="Expenses section"
          value={tab}
          onChange={(t) => {
            window.location.hash = viewHref('expenses', t === 'equipment' ? { tab: 'equipment' } : {})
          }}
          options={[
            { id: 'expenses', label: 'Operating expenses' },
            { id: 'equipment', label: 'Equipment & maintenance' },
          ]}
        />
      </div>
      {opsError ? (
        <Notice tone="warning">Expenses are not available yet: {opsError}</Notice>
      ) : tab === 'expenses' ? (
        <ExpensesTab />
      ) : (
        <EquipmentTab />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Operating expenses
// ---------------------------------------------------------------------------

function ExpensesTab() {
  const { shop } = useShopData()
  const [month, setMonth] = useState(todayISO().slice(0, 7))
  const [expenses, setExpenses] = useState<Expense[] | null>(null)
  const [other, setOther] = useState<{ maintenance: number; purchases: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Expense | 'new' | null>(null)

  const from = monthStartISO(`${month}-01`)
  const to = nextMonthStartISO(`${month}-01`)

  const load = useCallback(async () => {
    const [e, m, p] = await Promise.all([
      supabase.from('expenses').select('*').eq('shop_id', shop.id).gte('expense_date', from).lt('expense_date', to).order('expense_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('maintenance_records').select('cost').eq('shop_id', shop.id).gte('service_date', from).lt('service_date', to),
      supabase.from('stock_movements').select('total_cost').eq('shop_id', shop.id).eq('movement_type', 'purchase').gte('occurred_on', from).lt('occurred_on', to),
    ])
    const failed = e.error ?? m.error ?? p.error
    if (failed) return setError(errorMessage(failed))
    setError(null)
    setExpenses((e.data ?? []) as Expense[])
    setOther({
      maintenance: (m.data ?? []).reduce((s, r) => s + toAmount(r.cost), 0),
      purchases: (p.data ?? []).reduce((s, r) => s + toAmount(r.total_cost), 0),
    })
  }, [shop.id, from, to])

  useEffect(() => {
    // Fetch the month's records; state lands after the round trip.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpenses(null)
    void load()
  }, [load])

  const total = (expenses ?? []).reduce((s, e) => s + toAmount(e.amount), 0)
  const byCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of expenses ?? []) map.set(e.category, (map.get(e.category) ?? 0) + toAmount(e.amount))
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [expenses])

  async function remove(expense: Expense) {
    if (!window.confirm(`Delete “${expense.description}” (${formatAmount(expense.amount)})?`)) return
    const { error } = await supabase.from('expenses').delete().eq('id', expense.id)
    if (error) return setError(errorMessage(error))
    await load()
  }

  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <Field label="Month" className="w-48">
          {(id) => <Input id={id} type="month" value={month} max={todayISO().slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} />}
        </Field>
        <Button onClick={() => setEditing('new')}>
          <Icon name="plus" />
          Record expense
        </Button>
      </div>

      {error && <div className="mb-4"><Notice>{error}</Notice></div>}

      <section aria-label={`Spending in ${monthLabel}`} className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Operating expenses" icon="wallet" tone="coral" value={expenses ? formatAmount(total) : '…'} detail={`${expenses?.length ?? 0} recorded`} />
        <StatCard label="Equipment maintenance" icon="wrench" tone="taupe" value={other ? formatAmount(other.maintenance) : '…'} detail="From service records" />
        <StatCard label="Supply purchases" icon="box" tone="amber" value={other ? formatAmount(other.purchases) : '…'} detail="From inventory" />
        <StatCard label={`Total spent, ${monthLabel}`} icon="cash" tone="blue" value={other && expenses ? formatAmount(total + other.maintenance + other.purchases) : '…'} detail="All three combined" />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <Panel title={`Expenses in ${monthLabel}`}>
          {!expenses ? (
            <div className="px-5"><Loading /></div>
          ) : expenses.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No expenses this month" action={<Button onClick={() => setEditing('new')}>Record expense</Button>}>
                Record rent, utilities, wages and other running costs as you pay them.
              </EmptyState>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {expenses.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{e.description}</p>
                    <p className="text-sm text-muted">
                      {formatDate(e.expense_date)} · {e.category}
                      {e.payment_method && ` · ${e.payment_method}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="mr-2 font-semibold">{formatAmount(e.amount)}</span>
                    <Button size="sm" variant="quiet" onClick={() => setEditing(e)}>Edit</Button>
                    <Button size="sm" variant="quiet" aria-label={`Delete ${e.description}`} onClick={() => void remove(e)}>
                      <Icon name="trash" className="size-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        {byCategory.length > 0 && (
          <Panel title="By category">
            <ul className="divide-y divide-line">
              {byCategory.map(([cat, amount]) => (
                <li key={cat} className="flex justify-between gap-3 px-5 py-2.5 text-sm">
                  <span>{cat}</span>
                  <span className="font-semibold">{formatAmount(amount)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Record expense' : 'Edit expense'}>
        {editing !== null && (
          <ExpenseForm
            expense={editing === 'new' ? null : editing}
            onDone={async (saved) => {
              setEditing(null)
              if (saved) await load()
            }}
          />
        )}
      </Dialog>
    </>
  )
}

function ExpenseForm({ expense, onDone }: { expense: Expense | null; onDone: (saved: boolean) => void }) {
  const { shop } = useShopData()
  const [date, setDate] = useState(expense?.expense_date ?? todayISO())
  const [category, setCategory] = useState(expense?.category ?? '')
  const [description, setDescription] = useState(expense?.description ?? '')
  const [amount, setAmount] = useState(expense ? toAmount(expense.amount).toFixed(2) : '')
  const [method, setMethod] = useState(expense?.payment_method ?? '')
  const [notes, setNotes] = useState(expense?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const value = Number(amount)
    if (!(value > 0)) return setError('Enter an amount greater than zero.')
    if (!category.trim() || !description.trim()) return setError('Enter a category and a description.')
    if (date > todayISO()) return setError('The date cannot be in the future.')
    setBusy(true)
    setError(null)
    const values = {
      expense_date: date,
      category: category.trim(),
      description: description.trim(),
      amount: value,
      payment_method: method || null,
      notes: notes.trim() || null,
    }
    const { error } = expense
      ? await supabase.from('expenses').update(values).eq('id', expense.id)
      : await supabase.from('expenses').insert({ ...values, shop_id: shop.id })
    if (error) {
      setBusy(false)
      return setError(errorMessage(error))
    }
    onDone(true)
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {error && <Notice>{error}</Notice>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date">{(id) => <Input id={id} type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        <Field label="Amount">{(id) => <Input id={id} type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field>
        <Field label="Category">
          {(id) => (
            <>
              <Input id={id} list={`${id}-cats`} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Rent, utilities…" />
              <datalist id={`${id}-cats`}>{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
            </>
          )}
        </Field>
        <Field label="Paid by (optional)">
          {(id) => (
            <Select id={id} value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">—</option>
              {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
            </Select>
          )}
        </Field>
      </div>
      <Field label="Description">{(id) => <Input id={id} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="For example, October electricity" />}</Field>
      <Field label="Notes (optional)">{(id) => <Textarea id={id} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
      <div className="flex justify-end gap-2">
        <Button variant="quiet" onClick={() => onDone(false)}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : expense ? 'Save changes' : 'Record expense'}</Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Equipment and maintenance
// ---------------------------------------------------------------------------

function EquipmentTab() {
  const { equipment, opsLoading: loading } = useShopData()
  const [adding, setAdding] = useState(false)
  const [servicing, setServicing] = useState<EquipmentStatus | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)
  const rows = equipment.filter((e) => e.is_active)
  const viewed = equipment.find((e) => e.equipment_id === viewing)

  return (
    <>
      <div className="mb-5 flex justify-end">
        <Button onClick={() => setAdding(true)}>
          <Icon name="plus" />
          Add equipment
        </Button>
      </div>
      {loading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState title="No equipment yet" action={<Button onClick={() => setAdding(true)}>Add equipment</Button>}>
          Add washers, dryers, irons and boilers to track their service dates and repair costs.
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {rows.map((e) => {
            const state = serviceState(e)
            return (
              <article key={e.equipment_id} className="card flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <button type="button" className="text-left font-semibold hover:text-brand" onClick={() => setViewing(e.equipment_id)}>
                    {e.equipment_name}
                  </button>
                  <span className="grid size-8 place-items-center rounded-lg bg-taupe-100 text-taupe-700"><Icon name="wrench" className="size-4" /></span>
                </div>
                <p
                  className={cx(
                    'text-sm font-semibold',
                    state.tone === 'late' && 'text-owed',
                    state.tone === 'soon' && 'text-tag-deep',
                    state.tone === 'quiet' && 'text-muted',
                  )}
                >
                  {state.label}
                </p>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted">Last serviced</dt>
                    <dd>{formatDate(e.last_service_date)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Maintenance cost</dt>
                    <dd>{formatAmount(e.total_maintenance_cost)} <span className="text-muted">({e.record_count})</span></dd>
                  </div>
                </dl>
                <div className="mt-auto flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setServicing(e)}>Record service</Button>
                  <Button size="sm" variant="quiet" onClick={() => setViewing(e.equipment_id)}>History</Button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <Dialog open={adding} onClose={() => setAdding(false)} title="Add equipment">
        {adding && <EquipmentForm onDone={() => setAdding(false)} />}
      </Dialog>
      <Dialog open={!!servicing} onClose={() => setServicing(null)} title={servicing ? `Service: ${servicing.equipment_name}` : 'Service'}>
        {servicing && <MaintenanceForm equipment={servicing} onDone={() => setServicing(null)} />}
      </Dialog>
      <EquipmentDrawer equipment={viewed} onClose={() => setViewing(null)} />
    </>
  )
}

function EquipmentForm({ equipment, onDone }: { equipment?: EquipmentStatus; onDone: () => void }) {
  const { shop, reload } = useShopData()
  const [name, setName] = useState(equipment?.equipment_name ?? '')
  const [notes, setNotes] = useState(equipment?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    const values = { equipment_name: name.trim(), notes: notes.trim() || null }
    const { error } = equipment
      ? await supabase.from('equipment').update(values).eq('id', equipment.equipment_id)
      : await supabase.from('equipment').insert({ ...values, shop_id: shop.id })
    if (error) {
      setBusy(false)
      return setError(/equipment_shop_name_key/.test(error.message) ? 'Equipment with that name already exists.' : errorMessage(error))
    }
    await reload()
    onDone()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <Notice>{error}</Notice>}
      <Field label="Name">{(id) => <Input id={id} required value={name} onChange={(e) => setName(e.target.value)} placeholder="For example, Washer 2 (front loader)" />}</Field>
      <Field label="Notes (optional)" hint="Model, serial number, supplier contact.">
        {(id, d) => <Textarea id={id} aria-describedby={d} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="quiet" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={busy || !name.trim()}>{busy ? 'Saving…' : equipment ? 'Save changes' : 'Add equipment'}</Button>
      </div>
    </form>
  )
}

function MaintenanceForm({ equipment, onDone }: { equipment: EquipmentStatus; onDone: () => void }) {
  const { shop, reload } = useShopData()
  const [date, setDate] = useState(todayISO())
  const [description, setDescription] = useState('')
  const [cost, setCost] = useState('')
  const [next, setNext] = useState('')
  const [by, setBy] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const value = cost.trim() ? Number(cost) : 0
    if (!(value >= 0)) return setError('The cost must be zero or more.')
    if (!description.trim()) return setError('Describe the work done.')
    if (date > todayISO()) return setError('The service date cannot be in the future.')
    if (next && next < date) return setError('The next service date must be on or after the service date.')
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('maintenance_records').insert({
      shop_id: shop.id,
      equipment_id: equipment.equipment_id,
      service_date: date,
      description: description.trim(),
      cost: value,
      next_service_date: next || null,
      performed_by: by.trim() || null,
    })
    if (error) {
      setBusy(false)
      return setError(errorMessage(error))
    }
    await reload()
    onDone()
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {error && <Notice>{error}</Notice>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Service date">{(id) => <Input id={id} type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        <Field label="Cost">{(id) => <Input id={id} type="number" min="0" step="0.01" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" />}</Field>
        <Field label="Next service date (optional)">{(id) => <Input id={id} type="date" min={date} value={next} onChange={(e) => setNext(e.target.value)} />}</Field>
        <Field label="Done by (optional)">{(id) => <Input id={id} value={by} onChange={(e) => setBy(e.target.value)} />}</Field>
      </div>
      <Field label="Work done">{(id) => <Textarea id={id} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Replaced drive belt, descaled boiler…" />}</Field>
      <div className="flex justify-end gap-2">
        <Button variant="quiet" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save service record'}</Button>
      </div>
    </form>
  )
}

function EquipmentDrawer({ equipment, onClose }: { equipment: EquipmentStatus | undefined; onClose: () => void }) {
  const { reload } = useShopData()
  const [records, setRecords] = useState<MaintenanceRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const id = equipment?.equipment_id
  const count = equipment?.record_count

  useEffect(() => {
    if (!id) return
    let cancelled = false
    // Reset before loading this machine's history.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecords(null)
    setError(null)
    supabase
      .from('maintenance_records')
      .select('*')
      .eq('equipment_id', id)
      .order('service_date', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setError(errorMessage(error))
        setRecords((data ?? []) as MaintenanceRecord[])
      })
    return () => {
      cancelled = true
    }
  }, [id, count])

  async function archive() {
    if (!equipment || !window.confirm(`Retire ${equipment.equipment_name}? Its service history is kept.`)) return
    const { error } = await supabase.from('equipment').update({ is_active: false }).eq('id', equipment.equipment_id)
    if (error) return setError(errorMessage(error))
    await reload()
    onClose()
  }

  return (
    <Dialog
      open={!!equipment}
      onClose={() => {
        setEditing(false)
        onClose()
      }}
      variant="drawer"
      title={equipment?.equipment_name ?? 'Equipment'}
    >
      {equipment &&
        (editing ? (
          <EquipmentForm equipment={equipment} onDone={() => setEditing(false)} />
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{serviceState(equipment).label}</p>
                {equipment.notes && <p className="mt-1 whitespace-pre-line text-sm text-ink-soft">{equipment.notes}</p>}
                <p className="mt-1 text-sm text-muted">Total maintenance cost {formatAmount(equipment.total_maintenance_cost)}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
                <Button size="sm" variant="danger" onClick={() => void archive()}>Retire</Button>
              </div>
            </div>
            {error && <Notice>{error}</Notice>}
            <section aria-labelledby="service-history">
              <h3 id="service-history" className="font-semibold">Service history</h3>
              {!records ? (
                <Loading />
              ) : records.length === 0 ? (
                <p className="mt-2 text-sm text-muted">No service recorded yet.</p>
              ) : (
                <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
                  {records.map((r) => (
                    <li key={r.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                      <span className="min-w-0">
                        <span className="block font-semibold">{r.description}</span>
                        <span className="block text-xs text-muted">
                          {formatDate(r.service_date)}
                          {r.performed_by && ` · ${r.performed_by}`}
                          {r.next_service_date && ` · next ${formatDate(r.next_service_date)}`}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold">{formatAmount(r.cost)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ))}
    </Dialog>
  )
}
