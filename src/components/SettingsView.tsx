import { useState, type FormEvent } from 'react'
import { errorMessage } from '../lib/format'
import { useShopData } from '../lib/shop-data'
import { viewHref } from '../lib/shell'
import { supabase } from '../lib/supabase'
import type { Shop } from '../lib/types'
import { PricesView } from './PricesView'
import { Button, Field, Icon, Input, Notice, PageHeader, Panel, Segmented, Select, Textarea } from './ui'

const TABS = [
  { id: 'business', label: 'Business' },
  { id: 'prices', label: 'Services & prices' },
  { id: 'account', label: 'Account' },
] as const
type Tab = (typeof TABS)[number]['id']

export function SettingsView({ params, email }: { params: URLSearchParams; email: string | undefined }) {
  const requested = params.get('tab')
  const tab: Tab = TABS.some((t) => t.id === requested) ? (requested as Tab) : 'business'

  return (
    <>
      <PageHeader title="Settings" description="Business details, the services you offer and what they cost." />
      <div className="mb-6 overflow-x-auto">
        <Segmented
          label="Settings section"
          options={TABS.map((t) => ({ id: t.id, label: t.label }))}
          value={tab}
          onChange={(id) => {
            window.location.hash = viewHref('settings', { tab: id })
          }}
        />
      </div>
      {tab === 'business' && <BusinessForm />}
      {tab === 'prices' && <PricesView />}
      {tab === 'account' && <AccountPanel email={email} />}
    </>
  )
}

const CURRENCIES = ['NGN', 'GHS', 'KES', 'UGX', 'TZS', 'ZAR', 'ZMW', 'RWF', 'XOF', 'XAF', 'EGP', 'USD', 'GBP', 'EUR']

function BusinessForm() {
  const { shop, setShop } = useShopData()
  const [name, setName] = useState(shop.business_name)
  const [phone, setPhone] = useState(shop.business_phone ?? '')
  const [address, setAddress] = useState(shop.business_address ?? '')
  const [note, setNote] = useState(shop.receipt_note ?? '')
  const [currency, setCurrencyCode] = useState(shop.currency_code ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  // These columns arrive with migration 202610130003; until then only the name can be saved.
  const hasDetails = 'business_phone' in shop

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    setSaved(false)
    const values = hasDetails
      ? {
          business_name: name.trim(),
          business_phone: phone.trim() || null,
          business_address: address.trim() || null,
          receipt_note: note.trim() || null,
          currency_code: currency || null,
        }
      : { business_name: name.trim() }
    const { data, error } = await supabase.from('shops').update(values).eq('id', shop.id).select('*').single()
    setBusy(false)
    if (error) return setError(errorMessage(error))
    setShop(data as Shop)
    setSaved(true)
  }

  return (
    <Panel title="Business details" description="Shown in the sidebar and on printed receipts." className="max-w-3xl">
      <form onSubmit={submit} className="flex flex-col gap-4 p-5">
        {error && <Notice>{error}</Notice>}
        {saved && <Notice tone="success">Business details saved.</Notice>}
        {!hasDetails && (
          <Notice tone="warning">
            Phone, address, receipt note and currency need database migration 202610130003_shop_details.sql.
          </Notice>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name">
            {(id) => <Input id={id} required value={name} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <Field label="Phone">
            {(id) => <Input id={id} type="tel" disabled={!hasDetails} value={phone} onChange={(e) => setPhone(e.target.value)} />}
          </Field>
          <Field label="Address" className="sm:col-span-2">
            {(id) => <Textarea id={id} rows={2} disabled={!hasDetails} value={address} onChange={(e) => setAddress(e.target.value)} />}
          </Field>
          <Field label="Receipt note" hint="Printed at the bottom of every receipt, such as opening hours or a collection policy." className="sm:col-span-2">
            {(id, d) => (
              <Textarea id={id} aria-describedby={d} rows={2} disabled={!hasDetails} value={note} onChange={(e) => setNote(e.target.value)} />
            )}
          </Field>
          <Field label="Currency" hint="Used to display every amount in the app.">
            {(id, d) => (
              <Select id={id} aria-describedby={d} disabled={!hasDetails} value={currency} onChange={(e) => setCurrencyCode(e.target.value)}>
                <option value="">No currency symbol</option>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div>
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Panel>
  )
}

function AccountPanel({ email }: { email: string | undefined }) {
  return (
    <Panel title="Account" className="max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="text-sm text-muted">Signed in as</p>
          <p className="font-semibold">{email ?? 'Unknown email'}</p>
          <p className="mt-1 text-sm text-muted">
            Only this account can see this shop's records; access is enforced by the database.
          </p>
        </div>
        <Button variant="secondary" onClick={() => supabase.auth.signOut()}>
          <Icon name="logout" />
          Sign out
        </Button>
      </div>
    </Panel>
  )
}
