import { supabase } from './supabase'
import type { ClothingType, Order, OrderStatus } from './types'

export async function setOrderStatus(orderId: string, status: OrderStatus) {
  const { error } = await supabase.from('orders').update({ order_status: status }).eq('id', orderId)
  if (error) throw error
}

export function itemCount(order: Pick<Order, 'order_items'>) {
  return order.order_items.reduce((sum, item) => sum + item.quantity, 0)
}

/** "3 Shirt, 1 Duvet": garment counts grouped by type, most numerous first. */
export function garmentSummary(order: Pick<Order, 'order_items'>, clothingTypes: ClothingType[]) {
  const counts = new Map<string, number>()
  for (const item of order.order_items)
    counts.set(item.clothing_type_id, (counts.get(item.clothing_type_id) ?? 0) + item.quantity)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `${n} ${clothingTypes.find((t) => t.id === id)?.clothing_type_name ?? 'item'}`)
    .join(', ')
}

export const OPEN_STATUSES: OrderStatus[] = ['received', 'in_progress', 'ready']
