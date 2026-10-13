import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { setOrderStatus } from '../lib/actions'
import {
  NEXT_ACTION,
  NEXT_STATUS,
  STATUS_LABEL,
  describeDue,
  errorMessage,
  formatAmount,
  formatDate,
  formatDateTime,
  toAmount,
} from '../lib/format'
import { useShopData } from '../lib/shop-data'
import { supabase } from '../lib/supabase'
import { ORDER_STATUSES, type OrderItem, type OrderStatus, type Payment } from '../lib/types'
import { PAYMENT_METHODS, openReceipt } from '../lib/payments'
import { Button, Dialog, Field, Icon, Input, Notice, PaymentText, Select, StatusBadge } from './ui'


export function OrderDrawer({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const { orders, customerById, paymentStatus, clothingTypes, services, reload } = useShopData()
  const order = orders.find((o) => o.id === orderId)
  const [items, setItems] = useState<OrderItem[] | null>(null)
  const [payments, setPayments] = useState<Payment[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const loadDetail = useCallback(async (id: string) => {
    const [i, p] = await Promise.all([
      supabase.from('order_items').select('*').eq('order_id', id).order('created_at'),
      supabase.from('payments').select('*').eq('order_id', id).order('payment_date', { ascending: false }),
    ])
    if (i.error || p.error) setError(errorMessage(i.error ?? p.error))
    setItems((i.data ?? []) as OrderItem[])
    setPayments((p.data ?? []) as Payment[])
  }, [])

  useEffect(() => {
    if (!orderId) return
    // Reset the previous order's detail before fetching the new one.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(null)
    setPayments(null)
    setError(null)
    void loadDetail(orderId)
  }, [orderId, loadDetail])

  async function changeStatus(status: OrderStatus) {
    if (!order || busy || status === order.order_status) return
    if (status === 'picked_up' && balance > 0 &&
      !window.confirm(`${formatAmount(balance)} is still owed on this order. Mark it collected anyway?`))
      return
    if (status === 'cancelled' && !window.confirm(`Cancel order ${order.order_number}? Its payments stay on record.`))
      return
    setBusy(true)
    setError(null)
    try {
      await setOrderStatus(order.id, status)
      await reload()
    } catch (e) {
      setError(errorMessage(e))
    }
    setBusy(false)
  }

  const customer = order ? customerById.get(order.customer_id) : undefined
  const totals = order ? paymentStatus.get(order.id) : undefined
  const typeName = (id: string) => clothingTypes.find((t) => t.id === id)?.clothing_type_name ?? 'Item'
  const serviceName = (id: string) => services.find((s) => s.id === id)?.service_name ?? ''
  const balance = toAmount(totals?.balance_due)
  const next = order ? NEXT_STATUS[order.order_status] : undefined
  const due = order ? describeDue(order.due_date) : undefined

  return (
    <Dialog
      open={!!orderId}
      onClose={onClose}
      variant="drawer"
      title={order ? `Order ${order.order_number}` : 'Order'}
    >
      {!order ? (
        <p className="text-muted">This order is no longer in the list.</p>
      ) : (
        <div className="flex flex-col gap-7">
          <section className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xl font-semibold">{customer?.customer_name ?? 'Unknown customer'}</p>
              {customer?.phone && (
                <a href={`tel:${customer.phone}`} className="text-brand underline-offset-4 hover:underline">
                  {customer.phone}
                </a>
              )}
              <p className="mt-2 text-sm text-muted">
                Taken in {formatDateTime(order.created_at)}.{' '}
                {order.due_date ? `Due ${formatDate(order.due_date)}` : 'No due date'}
                {due?.tone === 'late' && order.order_status !== 'picked_up' && (
                  <span className="font-semibold text-owed"> ({due.text})</span>
                )}
                .
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusBadge status={order.order_status} />
              <Button size="sm" variant="secondary" onClick={() => openReceipt(order.id)}>
                <Icon name="printer" className="size-4" />
                Receipt
              </Button>
            </div>
          </section>

          {error && <Notice>{error}</Notice>}

          <section className="flex flex-wrap items-end gap-3">
            {next && !(next === 'picked_up' && balance > 0) && (
              <Button disabled={busy} onClick={() => void changeStatus(next)}>
                {NEXT_ACTION[order.order_status]}
              </Button>
            )}
            {next === 'picked_up' && balance > 0 && (
              <p className="basis-full text-sm text-owed">
                Take the remaining {formatAmount(balance)} before handing this order over.
              </p>
            )}
            <Field label="Status" className="min-w-48 flex-1">
              {(id) => (
                <Select
                  id={id}
                  value={order.order_status}
                  disabled={busy}
                  onChange={(e) => void changeStatus(e.target.value as OrderStatus)}
                >
                  {ORDER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </section>

          <section aria-labelledby="items-heading">
            <h3 id="items-heading" className="display text-xl">
              Items
            </h3>
            {items === null ? (
              <p className="mt-2 text-muted">Loading items…</p>
            ) : (
              <ul className="mt-2 divide-y divide-line/70 border-y border-line/70">
                {items.map((item) => (
                  <li key={item.id} className="flex items-baseline justify-between gap-4 py-2.5">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {item.quantity} × {typeName(item.clothing_type_id)}
                        <span className="font-normal text-muted">, {serviceName(item.service_id)}</span>
                      </p>
                      {(item.color || item.clothing_description) && (
                        <p className="text-sm text-muted">
                          {[item.color, item.clothing_description].filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0">{formatAmount(item.line_total_snapshot)}</span>
                  </li>
                ))}
              </ul>
            )}
            {totals && (
              <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-right">
                <dt className="text-muted">Subtotal</dt>
                <dd>{formatAmount(totals.item_subtotal)}</dd>
                {toAmount(order.discount) > 0 && (
                  <>
                    <dt className="text-muted">Discount</dt>
                    <dd>−{formatAmount(order.discount)}</dd>
                  </>
                )}
                <dt className="font-semibold">Total</dt>
                <dd className="font-semibold">{formatAmount(totals.order_total)}</dd>
                <dt className="text-muted">Paid</dt>
                <dd>{formatAmount(totals.amount_paid)}</dd>
                <dt className="font-semibold">Balance</dt>
                <dd className={balance > 0 ? 'font-semibold text-owed' : 'font-semibold text-settled'}>
                  {balance > 0 ? formatAmount(balance) : <PaymentText status={totals.payment_status} />}
                </dd>
              </dl>
            )}
          </section>

          {order.notes && (
            <section>
              <h3 className="display text-xl">Notes</h3>
              <p className="mt-1 whitespace-pre-line">{order.notes}</p>
            </section>
          )}

          <section aria-labelledby="payments-heading">
            <h3 id="payments-heading" className="display text-xl">
              Payments
            </h3>
            {balance > 0 && order.order_status !== 'cancelled' && (
              <PaymentForm
                key={balance}
                orderId={order.id}
                balance={balance}
                onRecorded={async () => {
                  await Promise.all([reload(), loadDetail(order.id)])
                }}
              />
            )}
            {payments && payments.length > 0 ? (
              <ul className="mt-4 divide-y divide-line/70 border-y border-line/70">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-4 py-2.5">
                    <div>
                      <p className="font-semibold">{p.payment_method}</p>
                      <p className="text-sm text-muted">
                        {formatDateTime(p.payment_date)}
                        {p.reference && `, ref ${p.reference}`}
                      </p>
                    </div>
                    <span>{formatAmount(p.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              payments && <p className="mt-2 text-muted">No payments recorded yet.</p>
            )}
          </section>
        </div>
      )}
    </Dialog>
  )
}

function PaymentForm({
  orderId,
  balance,
  onRecorded,
}: {
  orderId: string
  balance: number
  onRecorded: () => Promise<void>
}) {
  const [amount, setAmount] = useState(balance.toFixed(2))
  const [method, setMethod] = useState('')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // One id per payment attempt: a repeated submit hits the primary key instead
  // of recording the same money twice. A new id is drawn after each success.
  const [paymentId, setPaymentId] = useState(() => crypto.randomUUID())
  const submitting = useRef(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting.current) return
    const value = Number(amount)
    if (!/^\d+(\.\d{1,2})?$/.test(amount.trim()) || !(value > 0))
      return setError('Enter an amount greater than zero, with at most two decimal places.')
    if (value > balance + 0.0001)
      return setError(`The balance is ${formatAmount(balance)}. Enter that amount or less.`)
    if (!method) return setError('Choose how the customer paid.')
    submitting.current = true
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('payments').insert({
      id: paymentId,
      order_id: orderId,
      amount: value,
      payment_method: method,
      reference: reference.trim() || null,
    })
    if (error) {
      submitting.current = false
      setBusy(false)
      return setError(errorMessage(error))
    }
    setPaymentId(crypto.randomUUID())
    await onRecorded()
  }

  return (
    <form onSubmit={submit} noValidate className="mt-3 rounded-xl border border-line bg-rinse/60 p-4">
      {error && (
        <div className="mb-3">
          <Notice>{error}</Notice>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount">
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              type="number"
              min="0.01"
              step="0.01"
              max={balance.toFixed(2)}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="bg-paper"
            />
          )}
        </Field>
        <Field label="Method">
          {(id) => (
            <Select id={id} required value={method} onChange={(e) => setMethod(e.target.value)} className="bg-paper">
              <option value="">Choose…</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          )}
        </Field>
        <div className="flex gap-1.5 sm:col-span-2">
          <Button size="sm" variant="secondary" onClick={() => setAmount(balance.toFixed(2))}>
            Full balance
          </Button>
          {balance >= 0.02 && (
            <Button size="sm" variant="secondary" onClick={() => setAmount((Math.floor(balance * 50) / 100).toFixed(2))}>
              Half
            </Button>
          )}
        </div>
        <Field label="Reference" hint="Optional, such as a receipt or transaction ID." className="sm:col-span-2">
          {(id, describedBy) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="bg-paper"
            />
          )}
        </Field>
      </div>
      <Button type="submit" className="mt-4" disabled={busy}>
        {busy ? 'Recording…' : 'Record payment'}
      </Button>
    </form>
  )
}
