import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { errorMessage, formatAmount, formatDate, toAmount } from '../lib/format'
import { useShopData } from '../lib/shop-data'
import { useShell } from '../lib/shell'
import { supabase } from '../lib/supabase'
import type { Customer, OrderPaymentStatus, OrderStatus } from '../lib/types'
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
  PaymentBadge,
  SearchInput,
  StatusBadge,
  Textarea,
} from './ui'

export function CustomersView() {
  const { customers, orders, paymentStatus, loading } = useShopData()
  const { addCustomer } = useShell()
  const [query, setQuery] = useState('')
  const [viewing, setViewing] = useState<string | null>(null)

  // Summary from the orders already loaded; the profile drawer reads exact totals.
  const stats = useMemo(() => {
    const map = new Map<string, { count: number; owed: number; last: string | null }>()
    for (const o of orders) {
      const entry = map.get(o.customer_id) ?? { count: 0, owed: 0, last: null }
      entry.count += 1
      if (o.order_status !== 'cancelled') entry.owed += toAmount(paymentStatus.get(o.id)?.balance_due)
      if (!entry.last || o.created_at > entry.last) entry.last = o.created_at
      map.set(o.customer_id, entry)
    }
    return map
  }, [orders, paymentStatus])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(
      (c) =>
        c.customer_name.toLowerCase().includes(q) ||
        c.phone.replace(/\s/g, '').includes(q.replace(/\s/g, '')),
    )
  }, [customers, query])

  return (
    <>
      <PageHeader
        title="Customers"
        description="Everyone who has left clothes with you, their history and what they still owe."
        action={
          <Button onClick={addCustomer}>
            <Icon name="userPlus" />
            Add customer
          </Button>
        }
      />

      {customers.length > 0 && (
        <SearchInput
          label="Search customers"
          placeholder="Name or phone"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mb-4 md:max-w-sm"
        />
      )}

      {loading ? (
        <Loading label="Loading customers…" />
      ) : rows.length === 0 ? (
        <EmptyState
          title={customers.length === 0 ? 'No customers yet' : 'No customer matches'}
          action={customers.length === 0 && <Button onClick={addCustomer}>Add customer</Button>}
        >
          {customers.length === 0
            ? 'Customers are also added when you take a new order.'
            : 'Try a different name or phone number.'}
        </EmptyState>
      ) : (
        <Panel>
          <table className="w-full border-collapse text-left text-[0.92rem]">
            <caption className="sr-only">Customers</caption>
            <thead className="hidden border-b border-line bg-rinse/60 text-xs tracking-wide text-muted uppercase sm:table-header-group">
              <tr>
                <th scope="col" className="px-5 py-2.5 font-semibold">Customer</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Phone</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Orders</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Last order</th>
                <th scope="col" className="px-5 py-2.5 text-right font-semibold">Owes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((c) => {
                const s = stats.get(c.id)
                return (
                  <tr key={c.id} className="relative grid grid-cols-[1fr_auto] gap-x-3 px-4 py-3 hover:bg-rinse/70 sm:table-row sm:p-0">
                    <td className="min-w-0 sm:px-5 sm:py-3">
                      <button
                        type="button"
                        onClick={() => setViewing(c.id)}
                        className="block max-w-full truncate text-left font-semibold after:absolute after:inset-0 after:content-[''] hover:text-brand"
                      >
                        {c.customer_name}
                      </button>
                      <span className="block text-xs text-muted sm:hidden">
                        {c.phone} · {s?.count ?? 0} {s?.count === 1 ? 'order' : 'orders'}
                      </span>
                    </td>
                    <td className="hidden text-ink-soft sm:table-cell sm:px-3 sm:py-3">{c.phone}</td>
                    <td className="hidden text-right sm:table-cell sm:px-3 sm:py-3">{s?.count ?? 0}</td>
                    <td className="hidden text-ink-soft sm:table-cell sm:px-3 sm:py-3">{s?.last ? formatDate(s.last) : '—'}</td>
                    <td className="self-center text-right sm:px-5 sm:py-3">
                      {s && s.owed > 0 ? (
                        <span className="font-semibold text-owed">{formatAmount(s.owed)}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Panel>
      )}

      <CustomerDrawer customerId={viewing} onClose={() => setViewing(null)} />
    </>
  )
}

type HistoryRow = {
  id: string
  order_number: string
  order_status: OrderStatus
  due_date: string | null
  created_at: string
}

function CustomerDrawer({ customerId, onClose }: { customerId: string | null; onClose: () => void }) {
  const { customerById, orders: loadedOrders } = useShopData()
  const { openOrder, newOrder } = useShell()
  const customer = customerId ? customerById.get(customerId) : undefined
  const [editing, setEditing] = useState(false)
  const [history, setHistory] = useState<{ orders: HistoryRow[]; totals: Map<string, OrderPaymentStatus> } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!customerId) return
    let cancelled = false
    // Clear the previous customer's history before loading this one.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistory(null)
    setError(null)
    setEditing(false)
    void (async () => {
      const o = await supabase
        .from('orders')
        .select('id, order_number, order_status, due_date, created_at')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
      if (cancelled) return
      if (o.error) return setError(errorMessage(o.error))
      const ids = (o.data ?? []).map((r) => r.id)
      const t = ids.length
        ? await supabase.from('order_payment_status').select('*').in('order_id', ids)
        : { data: [], error: null }
      if (cancelled) return
      if (t.error) return setError(errorMessage(t.error))
      setHistory({
        orders: (o.data ?? []) as HistoryRow[],
        totals: new Map(((t.data ?? []) as OrderPaymentStatus[]).map((r) => [r.order_id, r])),
      })
    })()
    return () => {
      cancelled = true
    }
    // Reload when orders change elsewhere (a payment or status update).
  }, [customerId, loadedOrders])

  const summary = useMemo(() => {
    if (!history) return null
    let spend = 0
    let paid = 0
    let owed = 0
    let active = 0
    for (const o of history.orders) {
      const t = history.totals.get(o.id)
      paid += toAmount(t?.amount_paid)
      if (o.order_status === 'cancelled') continue
      active += 1
      spend += toAmount(t?.order_total)
      owed += toAmount(t?.balance_due)
    }
    const first = history.orders.at(-1)?.created_at ?? null
    return { spend, paid, owed, active, first }
  }, [history])

  return (
    <Dialog open={!!customerId} onClose={onClose} variant="drawer" title={customer?.customer_name ?? 'Customer'}>
      {!customer ? (
        <p className="text-muted">This customer is no longer on the list.</p>
      ) : editing ? (
        <CustomerForm customer={customer} onDone={() => setEditing(false)} />
      ) : (
        <div className="flex flex-col gap-6">
          <section className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <a href={`tel:${customer.phone}`} className="font-semibold text-brand hover:underline">
                {customer.phone}
              </a>
              {customer.notes && <p className="mt-1 whitespace-pre-line text-sm text-ink-soft">{customer.notes}</p>}
              <p className="mt-1 text-sm text-muted">
                Customer since {formatDate(summary?.first ?? customer.created_at)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                Edit
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  onClose()
                  newOrder(customer.id)
                }}
              >
                <Icon name="plus" className="size-4" />
                New order
              </Button>
            </div>
          </section>

          {error && <Notice>{error}</Notice>}

          {!history ? (
            !error && <Loading label="Loading order history…" />
          ) : (
            <>
              <dl className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-line p-3">
                  <dt className="text-xs font-semibold text-muted">Lifetime spend</dt>
                  <dd className="mt-1 text-lg font-semibold">{formatAmount(summary?.spend)}</dd>
                  <dd className="text-xs text-muted">{summary?.active} {summary?.active === 1 ? 'order' : 'orders'}</dd>
                </div>
                <div className="rounded-xl border border-line p-3">
                  <dt className="text-xs font-semibold text-muted">Paid</dt>
                  <dd className="mt-1 text-lg font-semibold text-settled">{formatAmount(summary?.paid)}</dd>
                </div>
                <div className="rounded-xl border border-line p-3">
                  <dt className="text-xs font-semibold text-muted">Outstanding</dt>
                  <dd className={`mt-1 text-lg font-semibold ${summary && summary.owed > 0 ? 'text-owed' : ''}`}>
                    {formatAmount(summary?.owed)}
                  </dd>
                </div>
              </dl>
              <p className="-mt-3 text-xs text-muted">Lifetime spend and outstanding exclude cancelled orders.</p>

              <section aria-labelledby="customer-history">
                <h3 id="customer-history" className="font-semibold">
                  Order history
                </h3>
                {history.orders.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">No orders yet.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
                    {history.orders.map((o) => {
                      const t = history.totals.get(o.id)
                      return (
                        <li key={o.id}>
                          <button
                            type="button"
                            onClick={() => {
                              onClose()
                              openOrder(o.id)
                            }}
                            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-rinse"
                          >
                            <span className="min-w-0">
                              <span className="block font-semibold">
                                #{o.order_number}{' '}
                                <span className="font-normal text-muted">· {formatDate(o.created_at)}</span>
                              </span>
                              <span className="mt-1 flex flex-wrap gap-1.5">
                                <StatusBadge status={o.order_status} />
                                <PaymentBadge status={t?.payment_status} />
                              </span>
                            </span>
                            <span className="shrink-0 text-right">
                              <span className="block font-semibold">{formatAmount(t?.order_total)}</span>
                              {toAmount(t?.balance_due) > 0 && o.order_status !== 'cancelled' && (
                                <span className="block text-xs text-owed">{formatAmount(t?.balance_due)} due</span>
                              )}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </Dialog>
  )
}

export function CustomerForm({ customer, onDone }: { customer: Customer | null; onDone: () => void }) {
  const { shop, reload } = useShopData()
  const [name, setName] = useState(customer?.customer_name ?? '')
  const [phone, setPhone] = useState(customer?.phone ?? '')
  const [notes, setNotes] = useState(customer?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    const values = { customer_name: name.trim(), phone: phone.trim(), notes: notes.trim() || null }
    const { error } = customer
      ? await supabase.from('customers').update(values).eq('id', customer.id)
      : await supabase.from('customers').insert({ ...values, shop_id: shop.id })
    if (error) {
      setBusy(false)
      return setError(errorMessage(error))
    }
    await reload()
    onDone()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <Notice>{error}</Notice>}
      <Field label="Name">
        {(id) => <Input id={id} required value={name} onChange={(e) => setName(e.target.value)} />}
      </Field>
      <Field label="Phone">
        {(id) => <Input id={id} type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} />}
      </Field>
      <Field label="Notes" hint="Optional, such as allergies to detergents or preferred pickup times.">
        {(id, describedBy) => (
          <Textarea id={id} aria-describedby={describedBy} value={notes} onChange={(e) => setNotes(e.target.value)} />
        )}
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="quiet" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !name.trim() || !phone.trim()}>
          {busy ? 'Saving…' : customer ? 'Save changes' : 'Add customer'}
        </Button>
      </div>
    </form>
  )
}
