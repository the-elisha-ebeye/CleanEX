// Row shapes mirroring supabase/migrations/202610120001_initial_schema.sql.
// Numeric columns arrive from PostgREST as numbers or strings; use toAmount().

export type Shop = {
  id: string
  business_name: string
  owner_user_id: string
  // Added by 202610130003_shop_details.sql; absent until that migration runs.
  business_phone?: string | null
  business_address?: string | null
  receipt_note?: string | null
  currency_code?: string | null
}

export type Customer = {
  id: string
  shop_id: string
  customer_name: string
  phone: string
  notes: string | null
  created_at: string
}

export type ClothingType = {
  id: string
  shop_id: string
  clothing_type_name: string
  is_active: boolean
}

export type Service = {
  id: string
  shop_id: string
  service_name: string
  description: string | null
  is_active: boolean
}

export type ServicePrice = {
  id: string
  shop_id: string
  clothing_type_id: string
  service_id: string
  unit_price: number | string
  is_active: boolean
}

export const ORDER_STATUSES = [
  'received',
  'in_progress',
  'ready',
  'picked_up',
  'cancelled',
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

export type Order = {
  id: string
  shop_id: string
  customer_id: string
  order_number: string
  order_status: OrderStatus
  due_date: string | null
  notes: string | null
  discount: number | string
  created_at: string
  order_items: { quantity: number; clothing_type_id: string }[]
}

export type OrderItem = {
  id: string
  order_id: string
  clothing_type_id: string
  service_id: string
  quantity: number
  clothing_description: string | null
  color: string | null
  unit_price_snapshot: number | string
  line_total_snapshot: number | string
}

export type Payment = {
  id: string
  order_id: string
  amount: number | string
  payment_method: string
  payment_date: string
  reference: string | null
}

export type PaymentStatus = 'unpaid' | 'partially_paid' | 'paid' | 'overpaid'

export type OrderPaymentStatus = {
  order_id: string
  shop_id: string
  item_subtotal: number | string
  order_total: number | string
  amount_paid: number | string
  balance_due: number | string
  payment_status: PaymentStatus
}

// Rows from supabase/migrations/202610130002_inventory_expenses.sql.

export type SupplyStock = {
  supply_id: string
  shop_id: string
  supply_name: string
  unit: string
  minimum_quantity: number | string
  notes: string | null
  is_active: boolean
  quantity_on_hand: number | string
  is_low: boolean
  last_purchase_on: string | null
  created_at: string
}

export type MovementType = 'purchase' | 'usage' | 'adjustment'

export type StockMovement = {
  id: string
  supply_id: string
  movement_type: MovementType
  quantity_change: number | string
  total_cost: number | string | null
  occurred_on: string
  note: string | null
  created_at: string
}

export type Expense = {
  id: string
  shop_id: string
  expense_date: string
  category: string
  description: string
  amount: number | string
  payment_method: string | null
  notes: string | null
}

export type EquipmentStatus = {
  equipment_id: string
  shop_id: string
  equipment_name: string
  notes: string | null
  is_active: boolean
  last_service_date: string | null
  next_service_date: string | null
  total_maintenance_cost: number | string
  record_count: number
}

export type MaintenanceRecord = {
  id: string
  equipment_id: string
  service_date: string
  description: string
  cost: number | string
  next_service_date: string | null
  performed_by: string | null
}
