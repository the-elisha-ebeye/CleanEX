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
import { Button, EmptyState, Icon, Loading, Notice, Panel, SearchInput, StatCard, StatusBadge, type IconName } from './ui'

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
      active: byStatus('received').length + byStatus('in_progress').length,
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
      <div className="mb-5 flex flex-col gap-4 sm:mb-7 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted sm:text-sm">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="display mt-0.5 text-[1.4rem] sm:text-[2rem]">
            {greeting()},<span className="max-sm:block max-sm:truncate"> {name}</span>
          </h1>
          <p className="mt-1 text-muted max-sm:hidden">Here is what needs doing in the shop today.</p>
        </div>
        <div className="flex flex-col gap-2 max-sm:hidden sm:flex-row sm:items-center">
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

      <MobileToday
        loading={loading}
        revenueToday={stats.revenueToday}
        paymentsTodayCount={stats.paymentsTodayCount}
        active={stats.active}
        ready={stats.ready}
        outstanding={stats.outstanding}
        owingCount={stats.owingCount}
      />

      <section aria-label="Today at a glance" className="grid gap-4 max-sm:hidden sm:grid-cols-3 xl:grid-cols-5">
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
        />
      </section>

      <QuickActions />

      <MobileAttention loading={loading} overdue={overdue.length} awaiting={awaiting.length} />

      <div className="mt-5 grid gap-6 sm:mt-6 2xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel
          title="Recent orders"
          description={<span className="max-sm:hidden">The latest drop-offs and where they are.</span>}
          action={
            <a href={viewHref('orders', { status: 'all' })} className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline max-sm:hidden">
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
            <>
              <div className="max-sm:hidden">
                <OrdersTable orders={orders.slice(0, 8)} caption="Recent orders" />
              </div>
              <RecentOrdersList orders={orders.slice(0, 5)} />
            </>
          )}
        </Panel>

        <div className="order-first grid content-start gap-6 max-sm:hidden md:grid-cols-2 2xl:order-none 2xl:grid-cols-1">
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
  // On phones, New order and Add customer sit side by side and Record payment
  // drops to a slim secondary row; from sm up all three are equal cards.
  const card =
    'flex rounded-2xl border text-left transition-colors max-sm:min-h-24 max-sm:flex-col max-sm:items-start max-sm:justify-between max-sm:gap-2 max-sm:p-3.5 sm:items-center sm:gap-3 sm:p-4'
  return (
    <section aria-label="Quick actions" className="mt-5 grid grid-cols-2 gap-3 sm:mt-6 sm:grid-cols-3">
      <button
        type="button"
        onClick={() => newOrder()}
        className={cx(card, 'border-transparent bg-brand text-white hover:bg-brand-deep sm:bg-brand-wash sm:text-ink sm:hover:border-brand/40 sm:hover:bg-brand-wash')}
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/20 shadow-sm sm:bg-brand sm:text-white">
          <Icon name="plus" />
        </span>
        <span>
          <span className="block font-semibold">New order</span>
          <span className="block text-sm text-ink-soft max-sm:hidden">Take in a drop-off</span>
        </span>
      </button>
      <button
        type="button"
        onClick={addCustomer}
        className={cx(card, 'border-line bg-paper hover:border-settled/40 sm:border-transparent sm:bg-settled-wash')}
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-settled text-white shadow-sm">
          <Icon name="userPlus" />
        </span>
        <span>
          <span className="block font-semibold text-ink">Add customer</span>
          <span className="block text-sm text-ink-soft max-sm:hidden">Save name and phone</span>
        </span>
      </button>
      <button
        type="button"
        onClick={recordPayment}
        className="flex min-h-11 items-center gap-3 rounded-xl border border-line px-3.5 text-left transition-colors hover:bg-rinse max-sm:col-span-2 sm:rounded-2xl sm:border-transparent sm:bg-tag-wash sm:p-4 sm:hover:border-tag/50 sm:hover:bg-tag-wash"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-tag text-white shadow-sm sm:size-10 sm:rounded-xl">
          <Icon name="cash" className="size-4 sm:size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink sm:text-base">Record payment</span>
          <span className="block text-sm text-ink-soft max-sm:hidden">Against an open balance</span>
        </span>
        <Icon name="arrowRight" className="size-4 text-muted sm:hidden" />
      </button>
    </section>
  )
}

/** Phone-only: the three numbers an owner checks first, plus money still owed. */
function MobileToday({
  loading,
  revenueToday,
  paymentsTodayCount,
  active,
  ready,
  outstanding,
  owingCount,
}: {
  loading: boolean
  revenueToday: number
  paymentsTodayCount: number
  active: number
  ready: number
  outstanding: number
  owingCount: number
}) {
  const v = (x: ReactNode) => (loading ? '…' : x)
  return (
    <section aria-label="Today at a glance" className="sm:hidden">
      <div className="grid grid-cols-2 gap-3">
        <div className="card col-span-2 flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-muted">Collected today</p>
            <p className="mt-0.5 truncate text-[1.6rem] leading-tight font-semibold tracking-tight">{v(formatAmount(revenueToday))}</p>
            <p className="text-xs text-muted">
              {paymentsTodayCount} {paymentsTodayCount === 1 ? 'payment' : 'payments'}
            </p>
          </div>
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-settled-wash text-settled">
            <Icon name="cash" />
          </span>
        </div>
        <MobileStat href={viewHref('orders', { status: 'open' })} label="Active orders" value={v(active)} dot="bg-brand" />
        <MobileStat href={viewHref('orders', { status: 'ready' })} label="Ready for pickup" value={v(ready)} dot="bg-tag" />
      </div>
      {!loading && outstanding > 0 && (
        <a
          href={viewHref('orders', { status: 'all', payment: 'owing' })}
          className="mt-3 flex min-h-11 items-center justify-between gap-3 rounded-xl border border-owed/30 bg-paper px-3.5 text-sm"
        >
          <span className="min-w-0 truncate">
            <span className="font-semibold text-owed">{formatAmount(outstanding)}</span>{' '}
            <span className="text-ink-soft">
              owed on {owingCount} {owingCount === 1 ? 'order' : 'orders'}
            </span>
          </span>
          <Icon name="arrowRight" className="size-4 shrink-0 text-owed" />
        </a>
      )}
    </section>
  )
}

function MobileStat({ href, label, value, dot }: { href: string; label: string; value: ReactNode; dot: string }) {
  return (
    <a href={href} className="card block p-4 active:bg-rinse">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-muted">
        <span aria-hidden="true" className={cx('size-2 rounded-full', dot)} />
        {label}
      </p>
      <p className="mt-1 text-[1.6rem] leading-tight font-semibold tracking-tight">{value}</p>
    </a>
  )
}

/** Phone-only: one tappable row per thing that needs doing, with a count. */
function MobileAttention({ loading, overdue, awaiting }: { loading: boolean; overdue: number; awaiting: number }) {
  const { supplies, equipment, opsError } = useShopData()
  if (loading) return null
  const low = opsError ? 0 : supplies.filter((s) => s.is_low).length
  const service = opsError
    ? 0
    : equipment.filter((e) => e.is_active && serviceState(e).tone !== 'quiet').length
  type Row = { label: string; count: number; href: string; icon: IconName; tone: string }
  const all: Row[] = [
    { label: 'Overdue orders', count: overdue, href: viewHref('orders', { status: 'overdue' }), icon: 'clock', tone: 'bg-owed-wash text-owed' },
    { label: 'Awaiting collection', count: awaiting, href: viewHref('orders', { status: 'ready' }), icon: 'bag', tone: 'bg-tag-wash text-tag-deep' },
    { label: 'Low-stock supplies', count: low, href: viewHref('inventory'), icon: 'box', tone: 'bg-owed-wash text-owed' },
    { label: 'Equipment service due', count: service, href: viewHref('expenses', { tab: 'equipment' }), icon: 'wrench', tone: 'bg-taupe-100 text-taupe-700' },
  ]
  const rows = all.filter((r) => r.count > 0)

  return (
    <section aria-labelledby="mobile-attention" className="mt-5 sm:hidden">
      <h2 id="mobile-attention" className="mb-2 text-base font-semibold">
        Needs attention
      </h2>
      {rows.length === 0 ? (
        <p className="flex min-h-11 items-center gap-2 rounded-xl bg-settled-wash px-3.5 text-sm font-semibold text-settled">
          <Icon name="check" className="size-4" /> All clear for now.
        </p>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {rows.map((r) => (
            <li key={r.label}>
              <a href={r.href} className="flex min-h-12 items-center gap-3 px-4 active:bg-rinse">
                <span className={cx('grid size-8 shrink-0 place-items-center rounded-lg', r.tone)}>
                  <Icon name={r.icon} className="size-4" />
                </span>
                <span className="flex-1 text-sm font-semibold">{r.label}</span>
                <span className="text-sm font-semibold text-muted">{r.count}</span>
                <Icon name="arrowRight" className="size-4 text-muted" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Phone-only recent orders: number, customer and status in one tappable row. */
function RecentOrdersList({ orders }: { orders: Order[] }) {
  const { customerById } = useShopData()
  const { openOrder } = useShell()
  return (
    <div className="sm:hidden">
      <ul className="divide-y divide-line">
        {orders.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              onClick={() => openOrder(o.id)}
              className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2 text-left active:bg-rinse"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">{customerById.get(o.customer_id)?.customer_name ?? 'Unknown customer'}</span>
                <span className="ticket-number block text-xs text-brand">#{o.order_number}</span>
              </span>
              <StatusBadge status={o.order_status} />
            </button>
          </li>
        ))}
      </ul>
      <a
        href={viewHref('orders', { status: 'all' })}
        className="flex min-h-12 items-center justify-center gap-1.5 border-t border-line text-sm font-semibold text-brand"
      >
        View all orders <Icon name="arrowRight" className="size-4" />
      </a>
    </div>
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
