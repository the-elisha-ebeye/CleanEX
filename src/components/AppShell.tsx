import { useMemo, useState } from 'react'
import { cx } from '../lib/cx'
import { useShopData } from '../lib/shop-data'
import { ShellContext, useRoute, viewHref, type ShellActions, type ViewId } from '../lib/shell'
import { supabase } from '../lib/supabase'
import { Wordmark } from './Brand'
import { CustomerForm, CustomersView } from './CustomersView'
import { DashboardView } from './DashboardView'
import { ExpensesView } from './ExpensesView'
import { InventoryView } from './InventoryView'
import { NewOrderDialog } from './NewOrderDialog'
import { OrderDrawer } from './OrderDrawer'
import { OrdersView } from './OrdersView'
import { PaymentPicker } from './PaymentPicker'
import { ReceiptPage } from './ReceiptPage'
import { SettingsView } from './SettingsView'
import { Button, Dialog, Icon, Notice, type IconName } from './ui'

const NAV: { id: ViewId; label: string; icon: IconName }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'orders', label: 'Orders', icon: 'orders' },
  { id: 'customers', label: 'Customers', icon: 'people' },
  { id: 'inventory', label: 'Inventory', icon: 'box' },
  { id: 'expenses', label: 'Expenses', icon: 'wallet' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
]

export function AppShell({ email }: { email: string | undefined }) {
  const route = useRoute()
  const { error, reload } = useShopData()
  const [openOrderId, setOpenOrderId] = useState<string | null>(null)
  const [newOrderOpen, setNewOrderOpen] = useState(false)
  const [newOrderCustomer, setNewOrderCustomer] = useState<string | undefined>()
  const [paymentPickerOpen, setPaymentPickerOpen] = useState(false)
  const [addCustomerOpen, setAddCustomerOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const actions = useMemo<ShellActions>(
    () => ({
      openOrder: setOpenOrderId,
      newOrder: (customerId) => {
        setNewOrderCustomer(customerId)
        setNewOrderOpen(true)
      },
      recordPayment: () => setPaymentPickerOpen(true),
      addCustomer: () => setAddCustomerOpen(true),
    }),
    [],
  )

  if (route.kind === 'receipt') return <ReceiptPage orderId={route.orderId} />
  const view = route.view

  return (
    <ShellContext.Provider value={actions}>
      <div className="min-h-svh bg-taupe-50 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-paper px-4 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>

        <aside className="hidden flex-col px-4 py-5 lg:sticky lg:top-0 lg:flex lg:h-svh">
          <SidebarContent view={view} email={email} />
        </aside>

        <div className="flex min-h-svh min-w-0 flex-col bg-paper lg:my-2 lg:mr-2 lg:min-h-[calc(100svh-1rem)] lg:rounded-2xl lg:border lg:border-line lg:shadow-[var(--shadow-card)]">
          <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-taupe-50/95 px-3 py-2.5 backdrop-blur lg:hidden">
            <div className="flex items-center gap-1">
              <Button variant="quiet" size="sm" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
                <Icon name="menu" />
              </Button>
              <a href={viewHref('dashboard')} aria-label="CleanEX dashboard">
                <Wordmark compact />
              </a>
            </div>
            <Button size="sm" onClick={() => actions.newOrder()}>
              <Icon name="plus" />
              New order
            </Button>
          </header>

          <main id="main" tabIndex={-1} className="flex-1 px-4 py-6 sm:px-6 lg:px-9 lg:py-8">
            {error && (
              <div className="mb-6">
                <Notice>
                  The shop's records could not be loaded: {error}{' '}
                  <button type="button" className="font-semibold underline" onClick={() => void reload()}>
                    Try again
                  </button>
                </Notice>
              </div>
            )}
            {view === 'dashboard' && <DashboardView email={email} />}
            {view === 'orders' && <OrdersView key={route.params.toString()} params={route.params} />}
            {view === 'customers' && <CustomersView />}
            {view === 'inventory' && <InventoryView />}
            {view === 'expenses' && <ExpensesView params={route.params} />}
            {view === 'settings' && <SettingsView params={route.params} email={email} />}
          </main>
        </div>

        <Dialog open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu" variant="drawer-left">
          <div className="-mx-1 flex h-full flex-col" onClick={(e) => (e.target as HTMLElement).closest('a') && setMenuOpen(false)}>
            <SidebarContent view={view} email={email} hideBrand />
          </div>
        </Dialog>

        <OrderDrawer orderId={openOrderId} onClose={() => setOpenOrderId(null)} />
        <NewOrderDialog
          open={newOrderOpen}
          customerId={newOrderCustomer}
          onClose={() => setNewOrderOpen(false)}
          onOpenOrder={(id) => {
            setNewOrderOpen(false)
            setOpenOrderId(id)
          }}
        />
        <PaymentPicker
          open={paymentPickerOpen}
          onClose={() => setPaymentPickerOpen(false)}
          onPick={(id) => {
            setPaymentPickerOpen(false)
            setOpenOrderId(id)
          }}
        />
        <Dialog open={addCustomerOpen} onClose={() => setAddCustomerOpen(false)} title="Add customer">
          {addCustomerOpen && <CustomerForm customer={null} onDone={() => setAddCustomerOpen(false)} />}
        </Dialog>
      </div>
    </ShellContext.Provider>
  )
}

function SidebarContent({ view, email, hideBrand }: { view: ViewId; email: string | undefined; hideBrand?: boolean }) {
  const { shop } = useShopData()
  return (
    <>
      {!hideBrand && (
        <a href={viewHref('dashboard')} className="px-2 py-1" aria-label="CleanEX dashboard">
          <Wordmark />
        </a>
      )}
      <nav aria-label="Main" className={cx('flex flex-col gap-0.5', !hideBrand && 'mt-8')}>
        {NAV.map((item) => {
          const active = view === item.id
          return (
            <a
              key={item.id}
              href={viewHref(item.id)}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'flex min-h-10 items-center gap-3 rounded-lg px-3 text-[0.93rem] font-semibold transition-colors',
                active
                  ? 'bg-paper text-ink shadow-[0_1px_2px_rgb(20_33_61/0.08)] ring-1 ring-line'
                  : 'text-ink-soft hover:bg-taupe-100/70 hover:text-ink',
              )}
            >
              <Icon name={item.icon} className={active ? 'text-brand' : 'text-muted'} />
              {item.label}
            </a>
          )
        })}
      </nav>
      <ProfileCard shopName={shop.business_name} email={email} />
    </>
  )
}

function ProfileCard({ shopName, email }: { shopName: string; email: string | undefined }) {
  const initial = (shopName.trim()[0] ?? 'L').toUpperCase()
  return (
    <div className="mt-auto rounded-xl border border-taupe-100 bg-paper/60 p-3">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-taupe-700 text-sm font-semibold text-white"
        >
          {initial}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{shopName}</p>
          {email && <p className="truncate text-xs text-muted">{email}</p>}
        </div>
      </div>
      <Button
        variant="quiet"
        size="sm"
        className="mt-2 w-full justify-start"
        onClick={() => supabase.auth.signOut()}
      >
        <Icon name="logout" />
        Sign out
      </Button>
    </div>
  )
}
