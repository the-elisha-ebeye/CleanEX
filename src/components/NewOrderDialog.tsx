import { useMemo, useRef, useState, type FormEvent } from 'react'
import { addDaysISO, errorMessage, formatAmount, formatDate, todayISO, toAmount } from '../lib/format'
import { PAYMENT_METHODS, openReceipt } from '../lib/payments'
import { useShopData } from '../lib/shop-data'
import { supabase } from '../lib/supabase'
import { cx } from '../lib/cx'
import { Button, Dialog, Field, Icon, Input, Notice, Select, Textarea } from './ui'

type Line = {
  key: number
  clothingTypeId: string
  serviceId: string
  quantity: string
  color: string
  description: string
}

let lineKey = 0
const blankLine = (): Line => ({
  key: ++lineKey,
  clothingTypeId: '',
  serviceId: '',
  quantity: '1',
  color: '',
  description: '',
})

type Created = { orderId: string; orderNumber: string; total: number; deposit: number; customerName: string }

type Props = { open: boolean; onClose: () => void; onOpenOrder: (orderId: string) => void; customerId?: string }

export function NewOrderDialog({ open, onClose, onOpenOrder, customerId }: Props) {
  // Remount the form for each new order so nothing leaks between tickets.
  const [formKey, setFormKey] = useState(0)
  return (
    <Dialog open={open} onClose={onClose} title="New order" wide>
      {open && (
        <NewOrderForm
          key={formKey}
          initialCustomerId={formKey === 0 ? customerId : undefined}
          onCancel={onClose}
          onOpenOrder={onOpenOrder}
          onAnother={() => setFormKey((k) => k + 1)}
        />
      )}
    </Dialog>
  )
}

function NewOrderForm({
  initialCustomerId,
  onCancel,
  onOpenOrder,
  onAnother,
}: {
  initialCustomerId?: string
  onCancel: () => void
  onOpenOrder: (id: string) => void
  onAnother: () => void
}) {
  const { shop, customers, clothingTypes, services, prices, reload } = useShopData()

  const [customerMode, setCustomerMode] = useState<'existing' | 'new'>(customers.length ? 'existing' : 'new')
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerId, setCustomerId] = useState(initialCustomerId ?? '')
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')

  const [lines, setLines] = useState<Line[]>(() => [blankLine()])
  const [dueDate, setDueDate] = useState('')
  const [discount, setDiscount] = useState('')
  const [deposit, setDeposit] = useState('')
  const [depositMethod, setDepositMethod] = useState('')
  const [depositReference, setDepositReference] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<Created | null>(null)
  // A ref closes the gap between a double click and the busy state re-rendering.
  const submitting = useRef(false)

  const activeTypes = clothingTypes.filter((t) => t.is_active)
  const activeServices = services.filter((s) => s.is_active)
  const priceFor = (typeId: string, serviceId: string) =>
    prices.find((p) => p.is_active && p.clothing_type_id === typeId && p.service_id === serviceId)

  const matches = useMemo(() => {
    const q = customerQuery.trim().toLowerCase()
    if (!q) return customers.slice(0, 5)
    return customers
      .filter(
        (c) =>
          c.customer_name.toLowerCase().includes(q) ||
          c.phone.replace(/\s/g, '').includes(q.replace(/\s/g, '')),
      )
      .slice(0, 5)
  }, [customers, customerQuery])

  const lineTotal = (line: Line) => {
    const price = priceFor(line.clothingTypeId, line.serviceId)
    const qty = Number.parseInt(line.quantity, 10)
    return price && qty > 0 ? qty * toAmount(price.unit_price) : 0
  }
  const subtotal = lines.reduce((sum, line) => sum + lineTotal(line), 0)
  const pieceCount = lines.reduce(
    (n, l) => n + (l.clothingTypeId && l.serviceId ? Math.max(Number.parseInt(l.quantity, 10) || 0, 0) : 0),
    0,
  )
  const discountValue = toAmount(discount)
  const total = Math.max(subtotal - discountValue, 0)
  const depositValue = toAmount(deposit)
  const balance = Math.max(total - depositValue, 0)

  function updateLine(key: number, patch: Partial<Line>) {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function validate(): string | null {
    if (customerMode === 'existing' && !customerId) return 'Choose a customer, or add a new one.'
    if (customerMode === 'new' && (!newName.trim() || !newPhone.trim()))
      return "Enter the new customer's name and phone number."
    const complete = lines.filter((l) => l.clothingTypeId && l.serviceId)
    if (complete.length === 0) return 'Add at least one item with a garment type and service.'
    if (lines.some((l) => (l.clothingTypeId || l.serviceId) && !(l.clothingTypeId && l.serviceId)))
      return 'Each item needs both a garment type and a service, or remove the unfinished item.'
    if (complete.some((l) => !priceFor(l.clothingTypeId, l.serviceId)))
      return 'One of the items has no active price. Set it in Settings first.'
    if (complete.some((l) => !/^\d+$/.test(l.quantity.trim()) || Number.parseInt(l.quantity, 10) < 1))
      return 'Each item needs a whole-number quantity of at least 1.'
    if (discount.trim() && !(Number(discount) >= 0)) return 'The discount must be zero or more.'
    if (discountValue > subtotal) return 'The discount cannot be more than the subtotal.'
    if (deposit.trim() && !(Number(deposit) >= 0)) return 'The deposit must be zero or more.'
    if (depositValue > total + 0.0001) return 'The deposit cannot be more than the order total.'
    if (depositValue > 0 && !depositMethod.trim()) return 'Choose how the deposit was paid.'
    if (dueDate && dueDate < todayISO()) return 'The due date cannot be in the past.'
    return null
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting.current) return
    const problem = validate()
    if (problem) return setError(problem)
    setError(null)
    submitting.current = true
    setBusy(true)

    const complete = lines.filter((l) => l.clothingTypeId && l.serviceId)
    const { data, error } = await supabase.rpc('create_order', {
      p_shop_id: shop.id,
      p_order_date: todayISO(),
      p_customer_id: customerMode === 'existing' ? customerId : null,
      p_new_customer:
        customerMode === 'new' ? { customer_name: newName.trim(), phone: newPhone.trim() } : null,
      p_items: complete.map((l) => ({
        clothing_type_id: l.clothingTypeId,
        service_id: l.serviceId,
        quantity: Number.parseInt(l.quantity, 10),
        color: l.color.trim() || null,
        clothing_description: l.description.trim() || null,
      })),
      p_discount: discountValue,
      p_due_date: dueDate || null,
      p_notes: notes.trim() || null,
      p_deposit: depositValue,
      p_deposit_method: depositValue > 0 ? depositMethod.trim() : null,
      p_deposit_reference: depositValue > 0 ? depositReference.trim() || null : null,
    })

    if (error) {
      submitting.current = false
      setBusy(false)
      return setError(errorMessage(error))
    }
    const result = data as { order_id: string; order_number: string }
    await reload()
    setBusy(false)
    setCreated({
      orderId: result.order_id,
      orderNumber: result.order_number,
      total,
      deposit: depositValue,
      customerName:
        customerMode === 'new' ? newName.trim() : (customers.find((c) => c.id === customerId)?.customer_name ?? ''),
    })
  }

  if (activeTypes.length === 0 || activeServices.length === 0 || prices.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="max-w-[52ch]">
          Orders are priced from your price list, which is still empty. Add at least one garment type,
          one service and a price for the pair, then come back here.
        </p>
        <a
          href="#/settings?tab=prices"
          onClick={onCancel}
          className="inline-flex min-h-10 items-center rounded-lg bg-brand px-4 font-semibold text-white hover:bg-brand-deep"
        >
          Open Services &amp; prices
        </a>
      </div>
    )
  }

  if (created) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-6 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-settled-wash text-settled">
          <Icon name="check" className="size-7" />
        </span>
        <div>
          <p className="text-sm font-semibold text-muted">Order saved</p>
          <p className="display mt-1 text-3xl">#{created.orderNumber}</p>
          <p className="mt-2 text-ink-soft">
            {created.customerName} · total {formatAmount(created.total)}
            {created.deposit > 0 && `, ${formatAmount(created.deposit)} paid`}
          </p>
        </div>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Button onClick={() => openReceipt(created.orderId)}>
            <Icon name="printer" />
            Print receipt
          </Button>
          <Button variant="secondary" onClick={() => onOpenOrder(created.orderId)}>
            Open order
          </Button>
          <Button variant="quiet" onClick={onAnother}>
            <Icon name="plus" />
            Another order
          </Button>
        </div>
      </div>
    )
  }

  const selectedCustomer = customers.find((c) => c.id === customerId)
  const today = todayISO()

  return (
    <form onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="flex min-w-0 flex-col gap-7">
        <section aria-labelledby="new-order-customer" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 id="new-order-customer" className="font-semibold">
              <span className="mr-2 inline-grid size-6 place-items-center rounded-full bg-brand-wash text-xs text-brand">1</span>
              Customer
            </h3>
            {customers.length > 0 && (
              <Button
                size="sm"
                variant="quiet"
                onClick={() => setCustomerMode(customerMode === 'new' ? 'existing' : 'new')}
              >
                {customerMode === 'new' ? 'Choose an existing customer' : (<><Icon name="userPlus" className="size-4" />New customer</>)}
              </Button>
            )}
          </div>

          {customerMode === 'new' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                {(id) => <Input id={id} required autoComplete="off" value={newName} onChange={(e) => setNewName(e.target.value)} />}
              </Field>
              <Field label="Phone">
                {(id) => (
                  <Input id={id} type="tel" required autoComplete="off" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
                )}
              </Field>
            </div>
          ) : selectedCustomer ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-brand/30 bg-brand-wash px-4 py-3">
              <div>
                <p className="font-semibold">{selectedCustomer.customer_name}</p>
                <p className="text-sm text-ink-soft">{selectedCustomer.phone}</p>
              </div>
              <Button size="sm" variant="quiet" onClick={() => setCustomerId('')}>
                Change
              </Button>
            </div>
          ) : (
            <div>
              <Field label="Search customers">
                {(id) => (
                  <Input
                    id={id}
                    type="search"
                    placeholder="Name or phone"
                    autoComplete="off"
                    value={customerQuery}
                    onChange={(e) => setCustomerQuery(e.target.value)}
                  />
                )}
              </Field>
              <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
                {matches.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setCustomerId(c.id)}
                      className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-rinse"
                    >
                      <span className="font-semibold">{c.customer_name}</span>
                      <span className="text-sm text-muted">{c.phone}</span>
                    </button>
                  </li>
                ))}
                {matches.length === 0 && (
                  <li className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm text-muted">
                    No customer matches.
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setCustomerMode('new')
                        if (/\d/.test(customerQuery)) setNewPhone(customerQuery.trim())
                        else setNewName(customerQuery.trim())
                      }}
                    >
                      Add “{customerQuery.trim()}”
                    </Button>
                  </li>
                )}
              </ul>
            </div>
          )}
        </section>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 font-semibold">
            <span className="mr-2 inline-grid size-6 place-items-center rounded-full bg-brand-wash text-xs text-brand">2</span>
            Garments and services
          </legend>
          <ol className="flex flex-col gap-3">
            {lines.map((line, index) => {
              const pricedServices = activeServices.filter((s) => priceFor(line.clothingTypeId, s.id))
              const price = priceFor(line.clothingTypeId, line.serviceId)
              const qty = Number.parseInt(line.quantity, 10)
              return (
                <li key={line.key} className="rounded-xl border border-line bg-rinse/40 p-3 sm:p-4">
                  <div className="grid gap-3 sm:grid-cols-[1.2fr_1.2fr_5.5rem]">
                    <Field label="Garment type">
                      {(id) => (
                        <Select
                          id={id}
                          value={line.clothingTypeId}
                          onChange={(e) => updateLine(line.key, { clothingTypeId: e.target.value, serviceId: '' })}
                        >
                          <option value="">Choose…</option>
                          {activeTypes.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.clothing_type_name}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                    <Field label="Service">
                      {(id) => (
                        <Select
                          id={id}
                          value={line.serviceId}
                          disabled={!line.clothingTypeId}
                          onChange={(e) => updateLine(line.key, { serviceId: e.target.value })}
                        >
                          <option value="">
                            {line.clothingTypeId && pricedServices.length === 0 ? 'No priced services' : 'Choose…'}
                          </option>
                          {pricedServices.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.service_name} ({formatAmount(priceFor(line.clothingTypeId, s.id)?.unit_price)})
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                    <Field label="Qty">
                      {(id) => (
                        <Input
                          id={id}
                          type="number"
                          inputMode="numeric"
                          min="1"
                          step="1"
                          value={line.quantity}
                          onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                        />
                      )}
                    </Field>
                    <Field label="Colour (optional)">
                      {(id) => (
                        <Input id={id} value={line.color} onChange={(e) => updateLine(line.key, { color: e.target.value })} />
                      )}
                    </Field>
                    <Field label="Description (optional)" className="sm:col-span-2">
                      {(id) => (
                        <Input
                          id={id}
                          placeholder="Brand, stains, missing buttons"
                          value={line.description}
                          onChange={(e) => updateLine(line.key, { description: e.target.value })}
                        />
                      )}
                    </Field>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className={cx('text-sm', price ? 'font-semibold' : 'text-muted')}>
                      {price && qty > 0
                        ? `${qty} × ${formatAmount(price.unit_price)} = ${formatAmount(qty * toAmount(price.unit_price))}`
                        : 'Choose a garment type and service to price this item.'}
                    </span>
                    {lines.length > 1 && (
                      <Button
                        size="sm"
                        variant="quiet"
                        aria-label={`Remove item ${index + 1}`}
                        onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
                      >
                        <Icon name="trash" />
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
          <Button variant="secondary" className="self-start" onClick={() => setLines((c) => [...c, blankLine()])}>
            <Icon name="plus" />
            Add another item
          </Button>
          <p className="text-xs text-muted">Garment photos are not stored yet; note any damage in the description.</p>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 font-semibold">
            <span className="mr-2 inline-grid size-6 place-items-center rounded-full bg-brand-wash text-xs text-brand">3</span>
            Collection
          </legend>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Due date" className="w-48">
              {(id) => (
                <Input id={id} type="date" min={today} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              )}
            </Field>
            <div role="group" aria-label="Quick due dates" className="flex gap-1.5 pb-0.5">
              {[1, 2, 3, 7].map((d) => (
                <Button key={d} size="sm" variant="secondary" onClick={() => setDueDate(addDaysISO(today, d))}>
                  {d === 1 ? 'Tomorrow' : `+${d} days`}
                </Button>
              ))}
            </div>
          </div>
          <Field label="Notes (optional)">
            {(id) => <Textarea id={id} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}
          </Field>
        </fieldset>
      </div>

      <aside className="lg:sticky lg:top-0 lg:self-start">
        <div className="rounded-2xl border border-line bg-taupe-50/60 p-4">
          <h3 className="font-semibold">Summary</h3>
          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted">Pieces</dt>
            <dd>{pieceCount}</dd>
            <dt className="text-muted">Subtotal</dt>
            <dd>{formatAmount(subtotal)}</dd>
          </dl>
          <div className="mt-3 grid gap-3">
            <Field label="Discount">
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="bg-paper text-right"
                />
              )}
            </Field>
          </div>
          <div className="mt-3 flex items-baseline justify-between border-t border-line-strong/60 pt-3">
            <span className="font-semibold">Total</span>
            <span className="text-2xl font-semibold">{formatAmount(total)}</span>
          </div>
          <div className="mt-3 grid gap-3">
            <Field label="Deposit paid now">
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={deposit}
                  onChange={(e) => setDeposit(e.target.value)}
                  className="bg-paper text-right"
                />
              )}
            </Field>
            {depositValue > 0 && (
              <>
                <Field label="Paid by">
                  {(id) => (
                    <Select id={id} value={depositMethod} onChange={(e) => setDepositMethod(e.target.value)} className="bg-paper">
                      <option value="">Choose…</option>
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Reference (optional)">
                  {(id) => (
                    <Input id={id} value={depositReference} onChange={(e) => setDepositReference(e.target.value)} className="bg-paper" />
                  )}
                </Field>
              </>
            )}
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold">Balance at collection</span>
              <span className={cx('font-semibold', balance > 0 ? 'text-owed' : 'text-settled')}>{formatAmount(balance)}</span>
            </div>
            {dueDate && <p className="text-xs text-muted">Due {formatDate(dueDate)}. The order number is assigned when you save.</p>}
          </div>
          {error && (
            <div className="mt-3">
              <Notice>{error}</Notice>
            </div>
          )}
          <div className="mt-4 flex flex-col gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Create order'}
            </Button>
            <Button variant="quiet" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      </aside>
    </form>
  )
}
