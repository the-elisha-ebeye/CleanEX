import { createContext, useContext, useEffect, useState } from 'react'

export const VIEW_IDS = ['dashboard', 'orders', 'customers', 'inventory', 'expenses', 'settings'] as const
export type ViewId = (typeof VIEW_IDS)[number]

// Older links from the first version of the app.
const ALIASES: Record<string, { view: ViewId; params?: Record<string, string> }> = {
  board: { view: 'orders', params: { layout: 'board' } },
  prices: { view: 'settings', params: { tab: 'prices' } },
}

export type Route =
  | { kind: 'view'; view: ViewId; params: URLSearchParams }
  | { kind: 'receipt'; orderId: string }

/** Routes live in the hash (#/orders?q=ada) so the static build needs no server rewrites. */
export function parseRoute(hash = window.location.hash): Route {
  const raw = hash.replace(/^#\/?/, '')
  const [path, query = ''] = raw.split('?')
  const [head, arg] = path.split('/')
  if (head === 'receipt' && arg) return { kind: 'receipt', orderId: arg }
  const params = new URLSearchParams(query)
  const alias = ALIASES[head]
  if (alias) {
    for (const [k, v] of Object.entries(alias.params ?? {})) params.set(k, v)
    return { kind: 'view', view: alias.view, params }
  }
  const view = (VIEW_IDS as readonly string[]).includes(head) ? (head as ViewId) : 'dashboard'
  return { kind: 'view', view, params }
}

export function viewHref(view: ViewId, params?: Record<string, string>) {
  const q = params ? new URLSearchParams(params).toString() : ''
  return `#/${view}${q ? `?${q}` : ''}`
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(() => parseRoute())
  useEffect(() => {
    const onChange = () => setRoute(parseRoute())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export type ShellActions = {
  openOrder: (orderId: string) => void
  newOrder: (customerId?: string) => void
  recordPayment: () => void
  addCustomer: () => void
}

export const ShellContext = createContext<ShellActions | null>(null)

export function useShell() {
  const ctx = useContext(ShellContext)
  if (!ctx) throw new Error('useShell must be used inside AppShell')
  return ctx
}
