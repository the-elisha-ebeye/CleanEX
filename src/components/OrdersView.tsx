import { useMemo, useState } from 'react'
import { OPEN_STATUSES } from '../lib/actions'
import { STATUS_LABEL, toAmount, todayISO } from '../lib/format'
import { useShopData } from '../lib/shop-data'
import { useShell, viewHref } from '../lib/shell'
import { ORDER_STATUSES, type OrderStatus } from '../lib/types'
import { BoardView } from './BoardView'
import { OrdersTable } from './OrdersTable'
import { Button, Chips, EmptyState, Icon, Loading, PageHeader, Panel, SearchInput, Segmented, Select } from './ui'

type StatusFilter = 'open' | 'all' | 'overdue' | OrderStatus
type PaymentFilter = 'any' | 'owing' | 'unpaid' | 'partially_paid' | 'paid'
type Layout = 'list' | 'board'

const STATUS_FILTERS: StatusFilter[] = ['open', 'overdue', ...ORDER_STATUSES, 'all']
const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  open: 'In the shop',
  overdue: 'Overdue',
  all: 'All',
  ...STATUS_LABEL,
}

const PAYMENT_FILTERS: { id: PaymentFilter; label: string }[] = [
  { id: 'any', label: 'Any payment status' },
  { id: 'owing', label: 'Balance owing' },
  { id: 'unpaid', label: 'Unpaid' },
  { id: 'partially_paid', label: 'Part paid' },
  { id: 'paid', label: 'Paid' },
]

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

export function OrdersView({ params }: { params: URLSearchParams }) {
  const { orders, customerById, paymentStatus, loading } = useShopData()
  const { newOrder } = useShell()
  const [status, setStatus] = useState<StatusFilter>(pick(params.get('status'), STATUS_FILTERS, 'open'))
  const [payment, setPayment] = useState<PaymentFilter>(
    pick(params.get('payment'), PAYMENT_FILTERS.map((p) => p.id), 'any'),
  )
  const [layout, setLayout] = useState<Layout>(pick<Layout>(params.get('layout'), ['list', 'board'], 'list'))
  const [query, setQuery] = useState(params.get('q') ?? '')
  const today = todayISO()

  const matchesStatus = (s: StatusFilter, o: (typeof orders)[number]) => {
    if (s === 'all') return true
    if (s === 'open') return OPEN_STATUSES.includes(o.order_status)
    if (s === 'overdue')
      return (o.order_status === 'received' || o.order_status === 'in_progress') && !!o.due_date && o.due_date < today
    return o.order_status === s
  }

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase()
    const digits = q.replace(/[\s#]/g, '')
    return orders.filter((o) => {
      const p = paymentStatus.get(o.id)
      if (payment === 'owing' && !(toAmount(p?.balance_due) > 0 && o.order_status !== 'cancelled')) return false
      if (payment !== 'any' && payment !== 'owing' && p?.payment_status !== payment) return false
      if (!q) return true
      const c = customerById.get(o.customer_id)
      return (
        o.order_number.toLowerCase().includes(digits) ||
        c?.customer_name.toLowerCase().includes(q) ||
        c?.phone.replace(/\s/g, '').includes(q.replace(/\s/g, ''))
      )
    })
  }, [orders, query, payment, customerById, paymentStatus])

  const rows = searched.filter((o) => matchesStatus(status, o))

  return (
    <>
      <PageHeader
        title="Orders"
        description="Find an order by number, customer name or phone, and move it through the shop."
        action={
          <Button onClick={() => newOrder()} className="max-lg:hidden">
            <Icon name="plus" />
            New order
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <SearchInput
          label="Search orders"
          placeholder="Order number, name or phone"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="md:max-w-sm"
        />
        <Select
          aria-label="Payment status"
          value={payment}
          onChange={(e) => setPayment(e.target.value as PaymentFilter)}
          className="md:w-56"
        >
          {PAYMENT_FILTERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
        <div className="md:ml-auto">
          <Segmented
            label="Layout"
            value={layout}
            onChange={(l) => {
              setLayout(l)
              history.replaceState(null, '', viewHref('orders', l === 'board' ? { layout: 'board' } : {}))
            }}
            options={[
              { id: 'list', label: <><Icon name="list" className="size-4" />List</> },
              { id: 'board', label: <><Icon name="board" className="size-4" />Board</> },
            ]}
          />
        </div>
      </div>

      {layout === 'board' ? (
        <BoardView orders={searched} />
      ) : (
        <>
          <div className="mb-4">
            <Chips
              label="Filter by order status"
              value={status}
              onChange={setStatus}
              options={STATUS_FILTERS.map((s) => ({
                id: s,
                label: STATUS_FILTER_LABEL[s],
                count: searched.filter((o) => matchesStatus(s, o)).length,
              }))}
            />
          </div>
          {loading ? (
            <Loading label="Loading orders…" />
          ) : rows.length === 0 ? (
            <EmptyState title={orders.length === 0 ? 'No orders yet' : 'No orders match'}>
              {orders.length === 0 ? 'Orders you take in will be listed here.' : 'Try another search or filter.'}
            </EmptyState>
          ) : (
            <Panel>
              <OrdersTable orders={rows} caption="Orders" />
            </Panel>
          )}
        </>
      )}
    </>
  )
}
