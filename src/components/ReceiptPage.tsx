import { useEffect, useState } from 'react'
import { errorMessage, formatAmount, formatDate, formatDateTime, STATUS_LABEL, PAYMENT_LABEL } from '../lib/format'
import { useShopData } from '../lib/shop-data'
import { supabase } from '../lib/supabase'
import type { Customer, OrderItem, OrderPaymentStatus, OrderStatus, Payment } from '../lib/types'
import { Button, Icon, Loading, Notice } from './ui'

type ReceiptData = {
  order: {
    id: string
    order_number: string
    order_status: OrderStatus
    due_date: string | null
    notes: string | null
    discount: number | string
    created_at: string
  }
  customer: Customer | null
  items: OrderItem[]
  payments: Payment[]
  totals: OrderPaymentStatus | null
}

/** A print-friendly receipt, read fresh from the database. */
export function ReceiptPage({ orderId }: { orderId: string }) {
  const { shop, clothingTypes, services } = useShopData()
  const [data, setData] = useState<ReceiptData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [o, i, p, t] = await Promise.all([
        supabase.from('orders').select('id, order_number, order_status, due_date, notes, discount, created_at, customer_id').eq('id', orderId).maybeSingle(),
        supabase.from('order_items').select('*').eq('order_id', orderId).order('created_at'),
        supabase.from('payments').select('*').eq('order_id', orderId).order('payment_date'),
        supabase.from('order_payment_status').select('*').eq('order_id', orderId).maybeSingle(),
      ])
      if (cancelled) return
      const failed = [o, i, p, t].find((r) => r.error)
      if (failed?.error) return setError(errorMessage(failed.error))
      if (!o.data) return setError('This order could not be found.')
      const c = await supabase.from('customers').select('*').eq('id', o.data.customer_id).maybeSingle()
      if (cancelled) return
      setData({
        order: o.data,
        customer: (c.data as Customer) ?? null,
        items: (i.data ?? []) as OrderItem[],
        payments: (p.data ?? []) as Payment[],
        totals: (t.data as OrderPaymentStatus) ?? null,
      })
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [orderId])

  useEffect(() => {
    if (data) document.title = `Receipt ${data.order.order_number} · ${shop.business_name}`
  }, [data, shop.business_name])

  const typeName = (id: string) => clothingTypes.find((t) => t.id === id)?.clothing_type_name ?? 'Item'
  const serviceName = (id: string) => services.find((s) => s.id === id)?.service_name ?? ''

  return (
    <main className="min-h-svh bg-rinse px-4 py-8 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-4 flex max-w-md items-center justify-between gap-3">
        <a href="#/orders" className="text-sm font-semibold text-brand hover:underline">
          ← Back to orders
        </a>
        <Button onClick={() => window.print()} disabled={!data}>
          <Icon name="printer" />
          Print
        </Button>
      </div>

      <article className="receipt mx-auto max-w-md rounded-2xl border border-line bg-paper p-6 text-sm shadow-[var(--shadow-card)]">
        {error ? (
          <Notice>{error}</Notice>
        ) : !data ? (
          <Loading label="Loading receipt…" />
        ) : (
          <>
            <header className="border-b border-dashed border-line-strong pb-4 text-center">
              <p className="text-lg font-bold">{shop.business_name}</p>
              {shop.business_address && <p className="whitespace-pre-line text-muted">{shop.business_address}</p>}
              {shop.business_phone && <p className="text-muted">Tel {shop.business_phone}</p>}
            </header>

            <section className="grid grid-cols-2 gap-y-1 border-b border-dashed border-line-strong py-4">
              <span className="text-muted">Order</span>
              <span className="text-right text-base font-bold">#{data.order.order_number}</span>
              <span className="text-muted">Received</span>
              <span className="text-right">{formatDateTime(data.order.created_at)}</span>
              <span className="text-muted">Due</span>
              <span className="text-right">{formatDate(data.order.due_date)}</span>
              <span className="text-muted">Customer</span>
              <span className="text-right">{data.customer?.customer_name ?? '—'}</span>
              <span className="text-muted">Phone</span>
              <span className="text-right">{data.customer?.phone ?? '—'}</span>
              <span className="text-muted">Status</span>
              <span className="text-right">{STATUS_LABEL[data.order.order_status]}</span>
            </section>

            <table className="w-full border-b border-dashed border-line-strong">
              <caption className="sr-only">Items</caption>
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th scope="col" className="pt-3 pb-1 font-semibold">Item</th>
                  <th scope="col" className="pt-3 pb-1 text-right font-semibold">Qty × price</th>
                  <th scope="col" className="pt-3 pb-1 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id} className="align-top">
                    <td className="py-1.5 pr-2">
                      <span className="font-semibold">{typeName(item.clothing_type_id)}</span>
                      <span className="block text-xs text-muted">
                        {[serviceName(item.service_id), item.color, item.clothing_description].filter(Boolean).join(' · ')}
                      </span>
                    </td>
                    <td className="py-1.5 text-right whitespace-nowrap">
                      {item.quantity} × {formatAmount(item.unit_price_snapshot)}
                    </td>
                    <td className="py-1.5 pl-2 text-right">{formatAmount(item.line_total_snapshot)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {data.totals && (
              <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 border-b border-dashed border-line-strong py-4 text-right">
                <dt className="text-muted">Subtotal</dt>
                <dd>{formatAmount(data.totals.item_subtotal)}</dd>
                <dt className="text-muted">Discount</dt>
                <dd>−{formatAmount(data.order.discount)}</dd>
                <dt className="font-bold">Total</dt>
                <dd className="font-bold">{formatAmount(data.totals.order_total)}</dd>
                <dt className="text-muted">Paid</dt>
                <dd>{formatAmount(data.totals.amount_paid)}</dd>
                <dt className="text-base font-bold">Balance due</dt>
                <dd className="text-base font-bold">{formatAmount(data.totals.balance_due)}</dd>
                <dt className="text-muted">Payment status</dt>
                <dd>{PAYMENT_LABEL[data.totals.payment_status]}</dd>
              </dl>
            )}

            {data.payments.length > 0 && (
              <section className="border-b border-dashed border-line-strong py-4">
                <p className="mb-1 text-xs font-semibold text-muted">Payments</p>
                {data.payments.map((p) => (
                  <p key={p.id} className="flex justify-between gap-3">
                    <span>
                      {formatDateTime(p.payment_date)} · {p.payment_method}
                      {p.reference && ` · ${p.reference}`}
                    </span>
                    <span>{formatAmount(p.amount)}</span>
                  </p>
                ))}
              </section>
            )}

            {data.order.notes && (
              <p className="border-b border-dashed border-line-strong py-4 whitespace-pre-line">
                <span className="block text-xs font-semibold text-muted">Notes</span>
                {data.order.notes}
              </p>
            )}

            <footer className="pt-4 text-center text-xs text-muted">
              {shop.receipt_note ? <p className="whitespace-pre-line">{shop.receipt_note}</p> : <p>Please bring this receipt when collecting.</p>}
            </footer>
          </>
        )}
      </article>
    </main>
  )
}
