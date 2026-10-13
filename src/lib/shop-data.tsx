import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { errorMessage, setCurrency, startOfTodayISO } from './format'
import { supabase } from './supabase'
import type {
  ClothingType,
  Customer,
  EquipmentStatus,
  Order,
  OrderPaymentStatus,
  Payment,
  Service,
  ServicePrice,
  Shop,
  SupplyStock,
} from './types'

// The most recent orders the dashboard keeps in memory. Active orders older
// than this window are fetched separately so the board never loses one.
const RECENT_ORDER_LIMIT = 500

type ShopData = {
  shop: Shop
  loading: boolean
  error: string | null
  customers: Customer[]
  clothingTypes: ClothingType[]
  services: Service[]
  prices: ServicePrice[]
  orders: Order[]
  paymentStatus: Map<string, OrderPaymentStatus>
  /** Payments received since local midnight, from the payments table. */
  paymentsToday: Payment[]
  customerById: Map<string, Customer>
  /** Supplies and equipment; empty with opsError set until migration 202610130002 is applied. */
  supplies: SupplyStock[]
  equipment: EquipmentStatus[]
  opsError: string | null
  opsLoading: boolean
  reload: () => Promise<void>
  /** Replace the in-memory shop row after it has been saved. */
  setShop: (shop: Shop) => void
}

const ShopDataContext = createContext<ShopData | null>(null)

const ORDER_COLUMNS =
  'id, shop_id, customer_id, order_number, order_status, due_date, notes, discount, created_at, order_items(quantity, clothing_type_id)'

export function ShopDataProvider({ shop: initialShop, children }: { shop: Shop; children: ReactNode }) {
  const [shop, setShop] = useState(initialShop)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [clothingTypes, setClothingTypes] = useState<ClothingType[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [prices, setPrices] = useState<ServicePrice[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [statusRows, setStatusRows] = useState<OrderPaymentStatus[]>([])
  const [paymentsToday, setPaymentsToday] = useState<Payment[]>([])
  const [supplies, setSupplies] = useState<SupplyStock[]>([])
  const [equipment, setEquipment] = useState<EquipmentStatus[]>([])
  const [opsError, setOpsError] = useState<string | null>(null)
  const [opsLoading, setOpsLoading] = useState(true)

  const reload = useCallback(async () => {
    // Inventory and equipment load on their own so a missing migration for
    // them cannot take down orders and payments.
    void Promise.all([
      supabase.from('supply_stock').select('*').eq('shop_id', shop.id).order('supply_name'),
      supabase.from('equipment_status').select('*').eq('shop_id', shop.id).order('equipment_name'),
    ]).then(([sup, eq]) => {
      const failed = sup.error ?? eq.error
      setOpsError(failed ? errorMessage(failed) : null)
      setSupplies((sup.data ?? []) as SupplyStock[])
      setEquipment((eq.data ?? []) as EquipmentStatus[])
      setOpsLoading(false)
    })
    const [c, ct, s, p, recent, active, ps, pt] = await Promise.all([
      supabase.from('customers').select('*').eq('shop_id', shop.id).order('customer_name'),
      supabase.from('clothing_types').select('*').eq('shop_id', shop.id).order('clothing_type_name'),
      supabase.from('services').select('*').eq('shop_id', shop.id).order('service_name'),
      supabase.from('service_prices').select('*').eq('shop_id', shop.id),
      supabase
        .from('orders')
        .select(ORDER_COLUMNS)
        .eq('shop_id', shop.id)
        .order('created_at', { ascending: false })
        .limit(RECENT_ORDER_LIMIT),
      supabase
        .from('orders')
        .select(ORDER_COLUMNS)
        .eq('shop_id', shop.id)
        .in('order_status', ['received', 'in_progress', 'ready']),
      supabase.from('order_payment_status').select('*').eq('shop_id', shop.id),
      supabase
        .from('payments')
        .select('id, order_id, amount, payment_method, payment_date, reference, orders!inner(shop_id)')
        .eq('orders.shop_id', shop.id)
        .gte('payment_date', startOfTodayISO())
        .order('payment_date', { ascending: false }),
    ])
    const failed = [c, ct, s, p, recent, active, ps, pt].find((r) => r.error)
    if (failed?.error) {
      setError(failed.error.message)
      setLoading(false)
      return
    }
    const merged = new Map<string, Order>()
    for (const o of [...(recent.data ?? []), ...(active.data ?? [])] as Order[]) merged.set(o.id, o)
    setCustomers((c.data ?? []) as Customer[])
    setClothingTypes((ct.data ?? []) as ClothingType[])
    setServices((s.data ?? []) as Service[])
    setPrices((p.data ?? []) as ServicePrice[])
    setOrders(
      [...merged.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    )
    setStatusRows((ps.data ?? []) as OrderPaymentStatus[])
    setPaymentsToday((pt.data ?? []) as unknown as Payment[])
    setError(null)
    setLoading(false)
  }, [shop.id])

  useEffect(() => {
    // Initial fetch; state updates land after the network round trip.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload()
  }, [reload])

  // Set before children render so every amount on this pass uses the shop's currency.
  setCurrency(shop.currency_code)

  const value = useMemo<ShopData>(
    () => ({
      shop,
      loading,
      error,
      customers,
      clothingTypes,
      services,
      prices,
      orders,
      paymentStatus: new Map(statusRows.map((r) => [r.order_id, r])),
      paymentsToday,
      supplies,
      equipment,
      opsError,
      opsLoading,
      customerById: new Map(customers.map((r) => [r.id, r])),
      reload,
      setShop,
    }),
    [shop, loading, error, customers, clothingTypes, services, prices, orders, statusRows, paymentsToday, supplies, equipment, opsError, opsLoading, reload],
  )

  return <ShopDataContext.Provider value={value}>{children}</ShopDataContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useShopData() {
  const ctx = useContext(ShopDataContext)
  if (!ctx) throw new Error('useShopData must be used inside ShopDataProvider')
  return ctx
}
