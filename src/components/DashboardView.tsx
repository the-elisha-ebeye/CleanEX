import { useMemo, useState, type ReactNode } from 'react'
import { cx } from '../lib/cx'
import {
  describeDue,
  formatDate,
  formatAmount,
  greeting,
  startOfTodayISO,
  toAmount,
  todayISO,
} from '../lib/format'
import { serviceState } from '../lib/ops'
import { useShopData } from '../lib/shop-data'
import { useShell, viewHref } from '../lib/shell'
import type { Order } from '../lib/types'
import { OrdersTable } from './OrdersTable'
import { Button, EmptyState, Icon, Loading, Notice, Panel, SearchInput, StatCard, type IconName } from './ui'

export function DashboardView({ email }: { email: string | undefined }) {
  const { shop, orders, paymentStatus, paymentsToday, customerById, loading, services, prices } = useShopData()
  const { newOrder, openOrder } = useShell()
  const [query, setQuery] = useState('')
  const today = todayISO()

  const stats = useMemo(() => {
    const since = startOfTodayISO()
    const createdToday = orders.filter((o) => new Date(o.created_at).toISOString() >= since)
    const byStatus = (s: Order['order_status']) => orders.filter((o) => o.order_status === s)
    const ready = byStatus('ready')
    const owing = orders.filter(
      (o) => o.order_status !== 'cancelled' && toAmount(paymentStatus.get(o.id)?.balance_due) > 0,
    )
    const balance = (list: Order[]) =>
      list.reduce((sum, o) => sum + toAmount(paymentStatus.get(o.id)?.balance_due), 0)
    return {
      ordersToday: createdToday.length,
      piecesToday: createdToday.reduce(
        (n, o) => n + o.order_items.reduce((m, i) => m + i.quantity, 0),
        0,
      ),
      received: byStatus('received').length,
      processing: byStatus('in_progress').length,
      ready: ready.length,
      readyToCollect: balance(ready),
      revenueToday: paymentsToday.reduce((sum, p) => sum + toAmount(p.amount), 0),
      paymentsTodayCount: paymentsToday.length,
      outstanding: balance(owing),
      owingCount: owing.length,
    }
  }, [orders, paymentStatus, paymentsToday])

  const overdue = orders
    .filter((o) => (o.order_status === 'received' || o.order_status === 'in_progress') && o.due_date && o.due_date < today)
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
  const awaiting = orders
    .filter((o) => o.order_status === 'ready')
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))

  const needsPriceList = !loading && (services.length === 0 || prices.length === 0)
  const name = shop.business_name || email || 'there'

  return (
    <>
      <div className="mb-7 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-semibold text-muted">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="display mt-0.5 text-[1.75rem] sm:text-[2rem]">
            {greeting()}, {name}
          </h1>
          <p className="mt-1 text-muted">Here is what needs doing in the shop today.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <form
            role="search"
            className="sm:w-72"
            onSubmit={(e) => {
              e.preventDefault()
              window.location.hash = viewHref('orders', query.trim() ? { q: query.trim(), status: 'all' } : {})
            }}
          >
            <SearchInput
              label="Search orders"
              placeholder="Find order, name or phone"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </form>
          <div className="hidden lg:block">
            <Button onClick={() => newOrder()}>
              <Icon name="plus" />
              New order
            </Button>
          </div>
        </div>
      </div>

      {needsPriceList && (
        <div className="mb-6">
          <Notice tone="info">
            Before taking orders, add your garment types, services and prices in{' '}
            <a href={viewHref('settings', { tab: 'prices' })} className="font-semibold underline">
              Settings → Services &amp; prices
            </a>
            .
          </Notice>
        </div>
      )}

      <section aria-label="Today at a glance" className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-5">
        <StatCard
          label="Orders today"
          icon="orders"
          tone="blue"
          value={loading ? '…' : stats.ordersToday}
          detail={stats.piecesToday ? `${stats.piecesToday} pieces taken in` : 'None taken in yet'}
          href={viewHref('orders', { status: 'all' })}
        />
        <StatCard
          label="In progress"
          icon="spin"
          tone="taupe"
          value={loading ? '…' : stats.processing}
          detail={`${stats.received} received, waiting to start`}
          href={viewHref('orders', { status: 'in_progress' })}
        />
        <StatCard
          label="Ready for pickup"
          icon="bag"
          tone="amber"
          value={loading ? '…' : stats.ready}
          detail={stats.readyToCollect > 0 ? `${formatAmount(stats.readyToCollect)} to collect` : 'All paid up'}
          href={viewHref('orders', { status: 'ready' })}
        />
        <StatCard
          label="Collected today"
          icon="cash"
          tone="green"
          value={loading ? '…' : formatAmount(stats.revenueToday)}
          detail={`${stats.paymentsTodayCount} ${stats.paymentsTodayCount === 1 ? 'payment' : 'payments'} received`}
        />
        <StatCard
          label="Outstanding balances"
          icon="alert"
          tone="coral"
          value={loading ? '…' : formatAmount(stats.outstanding)}
          detail={`Across ${stats.owingCount} ${stats.owingCount === 1 ? 'order' : 'orders'}`}
          href={viewHref('orders', { status: 'all', payment: 'owing' })}
          className="max-sm:col-span-2"
        />
      </section>

      <QuickActions />

      <div className="mt-6 grid gap-6 2xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel
          title="Recent orders"
          description="The latest drop-offs and where they are."
          action={
            <a href={viewHref('orders', { status: 'all' })} className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
              View all <Icon name="arrowRight" className="size-4" />
            </a>
          }
        >
          {loading ? (
            <div className="px-5">
              <Loading label="Loading orders…" />
            </div>
          ) : orders.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No orders yet" action={!needsPriceList && <Button onClick={() => newOrder()}>New order</Button>}>
                Record the first drop-off and it will appear here.
              </EmptyState>
            </div>
          ) : (
            <OrdersTable orders={orders.slice(0, 8)} caption="Recent orders" />
          )}
        </Panel>

        <div className="order-first grid content-start gap-6 md:grid-cols-2 2xl:order-none 2xl:grid-cols-1">
          <Panel title="Needs attention" description="Late work, orders waiting to be collected and machines due for service.">
            {loading ? (
              <div className="px-5">
                <Loading />
              </div>
            ) : (
              <ul className="divide-y divide-line">
                <AttentionGroup
                  icon="clock"
                  tone="coral"
                  title="Overdue"
                  empty="Nothing is running late."
                  orders={overdue}
                  describe={(o) => describeDue(o.due_date, today).text}
                  onOpen={openOrder}
                  customerName={(o) => customerById.get(o.customer_id)?.customer_name}
                />
                <AttentionGroup
                  icon="bag"
                  tone="amber"
                  title="Awaiting collection"
                  empty="No finished orders are waiting."
                  orders={awaiting}
                  describe={(o) => {
                    const owed = toAmount(paymentStatus.get(o.id)?.balance_due)
                    return owed > 0 ? `${formatAmount(owed)} to collect` : 'Paid'
                  }}
                  onOpen={openOrder}
                  customerName={(o) => customerById.get(o.customer_id)?.customer_name}
                />
                <EquipmentAttention />
              </ul>
            )}
          </Panel>
          <LowStockPanel />
        </div>
      </div>
    </>
  )
}

function QuickActions() {
  const { newOrder, addCustomer, recordPayment } = useShell()
  const actions: { label: string; detail: string; icon: IconName; onClick: () => void; tone: string; tile: string }[] = [
    { label: 'New order', detail: 'Take in a drop-off', icon: 'plus', onClick: () => newOrder(), tone: 'bg-brand-wash hover:border-brand/40', tile: 'bg-brand text-white' },
    { label: 'Add customer', detail: 'Save name and phone', icon: 'userPlus', onClick: addCustomer, tone: 'bg-settled-wash hover:border-settled/40', tile: 'bg-settled text-white' },
    { label: 'Record payment', detail: 'Against an open balance', icon: 'cash', onClick: recordPayment, tone: 'bg-tag-wash hover:border-tag/50', tile: 'bg-tag text-white' },
  ]
  return (
    <section aria-label="Quick actions" className="mt-6 grid gap-3 sm:grid-cols-3">
      {actions.map((a) => (
        <button
          key={a.label}
          type="button"
          onClick={a.onClick}
          className={cx('flex items-center gap-3 rounded-2xl border border-transparent p-4 text-left transition-colors', a.tone)}
        >
          <span className={cx('grid size-10 shrink-0 place-items-center rounded-xl shadow-sm', a.tile)}>
            <Icon name={a.icon} />
          </span>
          <span>
            <span className="block font-semibold text-ink">{a.label}</span>
            <span className="block text-sm text-ink-soft">{a.detail}</span>
          </span>
        </button>
      ))}
    </section>
  )
}

const GROUP_TONE = {
  coral: 'bg-owed-wash text-owed',
  amber: 'bg-tag-wash text-tag-deep',
} as const

function AttentionGroup({
  icon,
  tone,
  title,
  empty,
  orders,
  describe,
  onOpen,
  customerName,
}: {
  icon: IconName
  tone: keyof typeof GROUP_TONE
  title: string
  empty: string
  orders: Order[]
  describe: (o: Order) => ReactNode
  onOpen: (id: string) => void
  customerName: (o: Order) => string | undefined
}) {
  const shown = orders.slice(0, 4)
  return (
    <li className="px-5 py-4">
      <div className="flex items-center gap-2.5">
        <span className={cx('grid size-7 place-items-center rounded-lg', GROUP_TONE[tone])}>
          <Icon name={icon} className="size-4" />
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="ml-auto text-sm font-semibold text-muted">{orders.length}</span>
      </div>
      {orders.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {shown.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => onOpen(o.id)}
                className="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-rinse"
              >
                <span className="min-w-0 truncate">
                  <span className="font-semibold">#{o.order_number}</span>{' '}
                  <span className="text-ink-soft">{customerName(o) ?? 'Unknown customer'}</span>
                </span>
                <span className={cx('shrink-0 text-xs font-semibold', tone === 'coral' ? 'text-owed' : 'text-tag-deep')}>
                  {describe(o)}
                </span>
              </button>
            </li>
          ))}
          {orders.length > shown.length && (
            <li className="pt-1 text-xs text-muted">and {orders.length - shown.length} more</li>
          )}
        </ul>
      )}
    </li>
  )
}

function LowStockPanel() {
  const { supplies, opsError, opsLoading: loading } = useShopData()
  const low = supplies.filter((s) => s.is_low)
  const tracked = supplies.filter((s) => s.is_active).length
  return (
    <Panel
      title="Low-stock supplies"
      description={opsError ? undefined : `${tracked} ${tracked === 1 ? 'supply' : 'supplies'} tracked`}
      action={
        !opsError && (
          <a href={viewHref('inventory')} className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
            Inventory <Icon name="arrowRight" className="size-4" />
          </a>
        )
      }
    >
      {opsError ? (
        <p className="px-5 py-4 text-sm text-muted">Inventory is not available yet: {opsError}</p>
      ) : loading ? (
        <div className="px-5"><Loading /></div>
      ) : tracked === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">
          No supplies tracked yet. <a href={viewHref('inventory')} className="font-semibold text-brand hover:underline">Add your supplies</a> to get low-stock alerts.
        </p>
      ) : low.length === 0 ? (
        <p className="flex items-center gap-2 px-5 py-4 text-sm text-settled">
          <Icon name="check" className="size-4" /> Every supply is above its minimum.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {low.slice(0, 5).map((s) => {
            const onHand = toAmount(s.quantity_on_hand)
            const min = toAmount(s.minimum_quantity)
            return (
              <li key={s.supply_id} className="px-5 py-3">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-semibold">{s.supply_name}</span>
                  <span className="text-owed">
                    <span className="font-semibold">{onHand}</span> / {min} {s.unit}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-owed-wash" aria-hidden="true">
                  <div className="h-full rounded-full bg-owed" style={{ width: `${Math.min(100, min ? (onHand / min) * 100 : 0)}%` }} />
                </div>
              </li>
            )
          })}
          {low.length > 5 && <li className="px-5 py-2 text-xs text-muted">and {low.length - 5} more</li>}
        </ul>
      )}
    </Panel>
  )
}

function EquipmentAttention() {
  const { equipment, opsError } = useShopData()
  if (opsError) return null
  const due = equipment
    .filter((e) => e.is_active)
    .map((e) => ({ e, state: serviceState(e) }))
    .filter(({ state }) => state.tone !== 'quiet')
    .sort((a, b) => (a.e.next_service_date ?? '').localeCompare(b.e.next_service_date ?? ''))
  if (due.length === 0) return null
  return (
    <li className="px-5 py-4">
      <div className="flex items-center gap-2.5">
        <span className="grid size-7 place-items-center rounded-lg bg-taupe-100 text-taupe-700">
          <Icon name="wrench" className="size-4" />
        </span>
        <h3 className="text-sm font-semibold">Equipment service</h3>
        <span className="ml-auto text-sm font-semibold text-muted">{due.length}</span>
      </div>
      <ul className="mt-2 flex flex-col">
        {due.slice(0, 4).map(({ e, state }) => (
          <li key={e.equipment_id}>
            <a
              href={viewHref('expenses', { tab: 'equipment' })}
              className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-rinse"
            >
              <span className="truncate font-semibold">{e.equipment_name}</span>
              <span className={cx('shrink-0 text-xs font-semibold', state.tone === 'late' ? 'text-owed' : 'text-tag-deep')}>
                {state.tone === 'late' ? 'Overdue' : `Due ${formatDate(e.next_service_date)}`}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </li>
  )
}
