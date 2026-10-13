import { addDaysISO, formatDate, todayISO } from './format'
import type { EquipmentStatus } from './types'

/** How urgent a machine's next service is; "soon" means within 14 days. */
export function serviceState(e: EquipmentStatus, today = todayISO()) {
  if (!e.next_service_date) return { label: 'No service scheduled', tone: 'quiet' as const }
  if (e.next_service_date < today) return { label: `Service overdue since ${formatDate(e.next_service_date)}`, tone: 'late' as const }
  if (e.next_service_date <= addDaysISO(today, 14)) return { label: `Service due ${formatDate(e.next_service_date)}`, tone: 'soon' as const }
  return { label: `Next service ${formatDate(e.next_service_date)}`, tone: 'quiet' as const }
}
