import { garmentSummary } from '../lib/actions'
import { cx } from '../lib/cx'
import { describeDue, formatAmount, formatDate, toAmount } from '../lib/format'
import { useShopData } from '../lib/shop-data'
import { useShell } from '../lib/shell'
import { OPEN_STATUSES } from '../lib/actions'
import type { Order } from '../lib/types'
import { PaymentBadge, StatusBadge } from './ui'

/** Orders as a table on wide screens and as stacked rows on phones. */
export function OrdersTable({ orders, caption }: { orders: Order[]; caption: string }) {
  const { customerById, paymentStatus, clothingTypes } = useShopData()
  const { openOrder } = useShell()

  return (
    <table className="w-full border-collapse text-left text-[0.92rem]">
      <caption className="sr-only">{caption}</caption>
      <thead className="hidden border-b border-line bg-rinse/60 text-xs tracking-wide text-muted uppercase md:table-header-group">
        <tr>
          <th scope="col" className="px-5 py-2.5 font-semibold">Order</th>
          <th scope="col" className="px-3 py-2.5 font-semibold">Customer</th>
          <th scope="col" className="px-3 py-2.5 font-semibold">Garments</th>
          <th scope="col" className="px-3 py-2.5 text-right font-semibold">Amount</th>
          <th scope="col" className="px-3 py-2.5 font-semibold">Status</th>
          <th scope="col" className="px-3 py-2.5 font-semibold">Payment</th>
          <th scope="col" className="px-5 py-2.5 font-semibold">Due</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {orders.map((o) => {
          const c = customerById.get(o.customer_id)
          const p = paymentStatus.get(o.id)
          const balance = toAmount(p?.balance_due)
          const due = describeDue(o.due_date)
          const late = due.tone === 'late' && OPEN_STATUSES.includes(o.order_status)
          return (
            <tr
              key={o.id}
              className="relative grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 px-4 py-3 hover:bg-rinse/70 md:table-row md:p-0"
            >
              <td className="md:px-5 md:py-3">
                <button
                  type="button"
                  onClick={() => openOrder(o.id)}
                  className="ticket-number whitespace-nowrap text-brand after:absolute after:inset-0 after:content-[''] hover:underline"
                >
                  #{o.order_number}
                </button>
              </td>
              <td className="col-start-1 min-w-0 md:px-3 md:py-3">
                <span className="block truncate font-semibold">{c?.customer_name ?? 'Unknown customer'}</span>
                <span className="block truncate text-xs text-muted md:hidden">
                  {garmentSummary(o, clothingTypes)}
                </span>
              </td>
              <td className="hidden max-w-56 truncate text-ink-soft md:table-cell md:px-3 md:py-3">
                {garmentSummary(o, clothingTypes) || '—'}
              </td>
              <td className="col-start-2 row-start-1 text-right md:px-3 md:py-3">
                <span className="block font-semibold">{p ? formatAmount(p.order_total) : '—'}</span>
                {balance > 0 && o.order_status !== 'cancelled' && (
                  <span className="block text-xs text-owed">{formatAmount(balance)} due</span>
                )}
              </td>
              <td className="col-span-2 flex flex-wrap items-center gap-1.5 md:table-cell md:px-3 md:py-3">
                <StatusBadge status={o.order_status} />
                <span className="md:hidden">
                  <PaymentBadge status={p?.payment_status} />
                </span>
                <span className={cx('text-xs md:hidden', late ? 'font-semibold text-owed' : 'text-muted')}>
                  {o.due_date ? `· ${late ? due.text : `Due ${formatDate(o.due_date)}`}` : ''}
                </span>
              </td>
              <td className="hidden md:table-cell md:px-3 md:py-3">
                <PaymentBadge status={p?.payment_status} />
              </td>
              <td className="hidden whitespace-nowrap md:table-cell md:px-5 md:py-3">
                <span className={late ? 'font-semibold text-owed' : undefined}>{formatDate(o.due_date)}</span>
                {late && <span className="block text-xs text-owed">{due.text}</span>}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
