import type { OrderStatus, PaymentStatus } from './types'

// Amounts use the shop's currency_code (Settings → Business) when set, and
// plain two-decimal figures otherwise.
function makeFormat(currency: string | null) {
  try {
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      ...(currency ? { style: 'currency', currency } : {}),
    })
  } catch {
    return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
}

let amountFormat = makeFormat(null)
let activeCurrency: string | null = null

export function setCurrency(currency: string | null | undefined) {
  const next = currency || null
  if (next === activeCurrency) return
  activeCurrency = next
  amountFormat = makeFormat(next)
}

export function toAmount(value: number | string | null | undefined): number {
  const n = typeof value === 'string' ? Number.parseFloat(value) : (value ?? 0)
  return Number.isFinite(n) ? n : 0
}

export function formatAmount(value: number | string | null | undefined) {
  return amountFormat.format(toAmount(value))
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  received: 'Received',
  in_progress: 'Processing',
  ready: 'Ready',
  picked_up: 'Collected',
  cancelled: 'Cancelled',
}

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid',
  partially_paid: 'Part paid',
  paid: 'Paid',
  overpaid: 'Overpaid',
}

/** The next step in the shop's workflow, if the order has one. */
export const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  received: 'in_progress',
  in_progress: 'ready',
  ready: 'picked_up',
}

export const NEXT_ACTION: Partial<Record<OrderStatus, string>> = {
  received: 'Start processing',
  in_progress: 'Mark ready',
  ready: 'Mark collected',
}

/** Local calendar date as YYYY-MM-DD, matching Postgres `date` values. */
export function todayISO(now = new Date()) {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Start of the local day as an ISO timestamp, for comparing timestamptz values. */
export function startOfTodayISO(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
}

/** First day of the month containing a YYYY-MM-DD date. */
export function monthStartISO(iso = todayISO()) {
  return `${iso.slice(0, 7)}-01`
}

/** First day of the following month, for half-open month ranges. */
export function nextMonthStartISO(iso = todayISO()) {
  const [y, m] = iso.split('-').map(Number)
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
}

/** Adds days to a YYYY-MM-DD date. */
export function addDaysISO(iso: string, days: number) {
  const d = parseDateOnly(iso)
  d.setDate(d.getDate() + days)
  return todayISO(d)
}

export function greeting(now = new Date()) {
  const h = now.getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function parseDateOnly(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatDate(iso: string | null) {
  if (!iso) return '—'
  const date = iso.length === 10 ? parseDateOnly(iso) : new Date(iso)
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  })
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Describes a due date relative to today: "Due today", "2 days late". */
export function describeDue(due: string | null, today = todayISO()) {
  if (!due) return { text: 'No due date', tone: 'quiet' as const }
  const days = Math.round(
    (parseDateOnly(due).getTime() - parseDateOnly(today).getTime()) / 86_400_000,
  )
  if (days < 0) {
    const late = -days
    return { text: late === 1 ? '1 day late' : `${late} days late`, tone: 'late' as const }
  }
  if (days === 0) return { text: 'Due today', tone: 'today' as const }
  if (days === 1) return { text: 'Due tomorrow', tone: 'quiet' as const }
  return { text: `Due ${formatDate(due)}`, tone: 'quiet' as const }
}

export function pieces(count: number) {
  return count === 1 ? '1 piece' : `${count} pieces`
}

/** Turns a Supabase/Postgres error into a sentence the counter can act on. */
export function errorMessage(error: unknown): string {
  if (!error) return 'Something went wrong. Try again.'
  if (typeof error === 'object' && error && 'message' in error) {
    const message = String((error as { message: unknown }).message)
    if (/duplicate key.*order_number/i.test(message))
      return 'That order number is already in use. Choose another.'
    if (/duplicate key.*clothing_type_name/i.test(message))
      return 'That clothing type is already on the list.'
    if (/duplicate key.*service_name/i.test(message))
      return 'That service is already on the list.'
    if (/Payment would exceed/i.test(message))
      return 'That is more than the balance still owed on this order.'
    if (/Could not find the function public\.create_order\b/i.test(message))
      return 'The database needs an update before orders can be created here. Apply migration 202610130001_order_intake.sql.'
    if (/Could not find the table|relation .* does not exist/i.test(message))
      return 'The database needs an update for this feature. Apply the latest migrations in supabase/migrations.'
    if (/duplicate key.*payments_pkey/i.test(message))
      return 'This payment was already recorded.'
    if (/Failed to fetch/i.test(message))
      return 'Cannot reach the database. Check your connection and try again.'
    return message
  }
  return String(error)
}
