import { useMemo, useState } from 'react'
import { garmentSummary, itemCount, setOrderStatus } from '../lib/actions'
import { cx } from '../lib/cx'
import {
  NEXT_ACTION,
  NEXT_STATUS,
  STATUS_LABEL,
  describeDue,
  errorMessage,
  formatAmount,
  pieces,
  toAmount,
  todayISO,
} from '../lib/format'
import { useShopData } from '../lib/shop-data'
import { useShell } from '../lib/shell'
import type { Order, OrderStatus } from '../lib/types'
import { Button, Notice } from './ui'

const COLUMNS: { status: OrderStatus; hint: string; accent: string }[] = [
  { status: 'received', hint: 'Dropped off, waiting to start', accent: 'bg-taupe-500' },
  { status: 'in_progress', hint: 'Being washed, dried or pressed', accent: 'bg-brand' },
  { status: 'ready', hint: 'Waiting for the customer', accent: 'bg-tag' },
]

/** Open orders grouped by stage, most urgent first. */
export function BoardView({ orders }: { orders: Order[] }) {
  const { reload, loading } = useShopData()
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const today = todayISO()

  const byStatus = useMemo(() => {
    const groups: Record<string, Order[]> = { received: [], in_progress: [], ready: [] }
    for (const order of orders) groups[order.order_status]?.push(order)
    for (const list of Object.values(groups))
      list.sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
    return groups
  }, [orders])

  async function advance(order: Order) {
    const next = NEXT_STATUS[order.order_status]
    if (!next || busyId) return
    setError(null)
    setBusyId(order.id)
    try {
      await setOrderStatus(order.id, next)
      await reload()
    } catch (e) {
      setError(errorMessage(e))
    }
    setBusyId(null)
  }

  return (
    <>
      {error && (
        <div className="mb-4">
          <Notice>{error}</Notice>
        </div>
      )}
      <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0">
        {COLUMNS.map(({ status, hint, accent }) => {
          const list = byStatus[status]
          return (
            <section
              key={status}
              aria-labelledby={`col-${status}`}
              className="w-[min(21rem,85vw)] shrink-0 snap-start rounded-2xl bg-rinse p-3 lg:w-auto"
            >
              <div className="flex items-center gap-2 px-1 pb-3">
                <span aria-hidden="true" className={cx('size-2 rounded-full', accent)} />
                <h2 id={`col-${status}`} className="font-semibold">
                  {STATUS_LABEL[status]}
                </h2>
                <span className="rounded-full bg-paper px-2 text-sm font-semibold text-muted">{list.length}</span>
                <span className="sr-only">. {hint}</span>
              </div>
              <ol className="flex flex-col gap-2.5">
                {list.map((order) => (
                  <li key={order.id}>
                    <BoardCard
                      order={order}
                      today={today}
                      busy={busyId === order.id}
                      onAdvance={() => void advance(order)}
                    />
                  </li>
                ))}
              </ol>
              {!loading && list.length === 0 && (
                <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">
                  {hint}. Nothing here now.
                </p>
              )}
            </section>
          )
        })}
      </div>
    </>
  )
}

function BoardCard({
  order,
  today,
  busy,
  onAdvance,
}: {
  order: Order
  today: string
  busy: boolean
  onAdvance: () => void
}) {
  const { customerById, paymentStatus, clothingTypes } = useShopData()
  const { openOrder } = useShell()
  const customer = customerById.get(order.customer_id)
  const balance = toAmount(paymentStatus.get(order.id)?.balance_due)
  const due = describeDue(order.due_date, today)
  // Collection waits until the balance is settled; send staff to payment instead.
  const collectFirst = order.order_status === 'ready' && balance > 0
  const action = collectFirst ? 'Take payment' : NEXT_ACTION[order.order_status]

  return (
    <article className="card relative p-3.5">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => openOrder(order.id)}
          className="min-w-0 text-left after:absolute after:inset-0 after:content-['']"
          aria-label={`Open order ${order.order_number} for ${customer?.customer_name ?? 'unknown customer'}`}
        >
          <span className="ticket-number block text-sm text-brand">#{order.order_number}</span>
          <span className="block truncate font-semibold">{customer?.customer_name ?? 'Unknown customer'}</span>
        </button>
        <span className="shrink-0 text-xs text-muted">{pieces(itemCount(order))}</span>
      </div>
      <p className="mt-1 truncate text-sm text-ink-soft">{garmentSummary(order, clothingTypes)}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span
          className={cx(
            due.tone === 'late' && order.order_status !== 'ready' && 'font-semibold text-owed',
            due.tone === 'today' && 'font-semibold text-ink',
            (due.tone === 'quiet' || (due.tone === 'late' && order.order_status === 'ready')) && 'text-muted',
          )}
        >
          {due.text}
        </span>
        {balance > 0 ? (
          <span className="font-semibold text-owed">{formatAmount(balance)} owed</span>
        ) : (
          <span className="font-semibold text-settled">Paid</span>
        )}
      </div>
      {action && (
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={collectFirst ? () => openOrder(order.id) : onAdvance}
          className="relative z-[1] mt-3 w-full"
        >
          {busy ? 'Saving…' : action}
        </Button>
      )}
    </article>
  )
}
