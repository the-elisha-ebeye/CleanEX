import { useMemo, useState } from 'react'
import { formatAmount, toAmount } from '../lib/format'
import { useShopData } from '../lib/shop-data'
import { Dialog, EmptyState, SearchInput, StatusBadge } from './ui'

/** Choose which order a payment is for; the order drawer then takes the payment. */
export function PaymentPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (orderId: string) => void
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Record a payment">
      {open && <PickerBody onPick={onPick} />}
    </Dialog>
  )
}

function PickerBody({ onPick }: { onPick: (orderId: string) => void }) {
  const { orders, customerById, paymentStatus } = useShopData()
  const [query, setQuery] = useState('')

  const owing = useMemo(() => {
    const q = query.trim().toLowerCase()
    return orders.filter((o) => {
      if (o.order_status === 'cancelled') return false
      if (!(toAmount(paymentStatus.get(o.id)?.balance_due) > 0)) return false
      if (!q) return true
      const c = customerById.get(o.customer_id)
      return (
        o.order_number.toLowerCase().includes(q) ||
        c?.customer_name.toLowerCase().includes(q) ||
        c?.phone.replace(/\s/g, '').includes(q.replace(/\s/g, ''))
      )
    })
  }, [orders, paymentStatus, customerById, query])

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">Orders with a balance still to collect.</p>
      <SearchInput
        label="Search orders with a balance"
        placeholder="Order number, name or phone"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {owing.length === 0 ? (
        <EmptyState title={query ? 'No matching order owes money' : 'Nothing to collect'}>
          {query ? 'Try another name, phone or order number.' : 'Every open order is fully paid.'}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {owing.map((o) => {
            const c = customerById.get(o.customer_id)
            return (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => onPick(o.id)}
                  className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-rinse"
                >
                  <span className="min-w-0">
                    <span className="block font-semibold">
                      #{o.order_number} · {c?.customer_name ?? 'Unknown customer'}
                    </span>
                    <span className="mt-0.5 block">
                      <StatusBadge status={o.order_status} />
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-xs text-muted">Balance</span>
                    <span className="font-semibold text-owed">
                      {formatAmount(paymentStatus.get(o.id)?.balance_due)}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
