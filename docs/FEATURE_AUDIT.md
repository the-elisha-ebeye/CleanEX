# CleanEX (formerly LivingStone Laundry): feature audit (2026-10-13)

Audited before the redesign. Each status is backed by code inspection, and where marked **tested**,
the feature was driven in a real browser against a local Postgres 18 + PostgREST stack that runs the
project's own migration (same RLS and triggers as the hosted Supabase project).

## Functional at audit time

| Area | Feature | Evidence |
| --- | --- | --- |
| Auth | Email/password sign in, sign up, sign out; session survives refresh | tested |
| Shop | First-run "name your shop" setup; one shop per owner | tested |
| Security | RLS on every table, owner-only; anon role has no table access | tested (anon gets `42501`, also on the hosted project) |
| Prices | Garment types, services, per-pair price grid, pause/resume | tested |
| Orders | Create order with existing or new customer, multiple lines, colour, description, discount, due date, notes | tested |
| Orders | Atomic creation through `create_order_with_items` RPC | tested |
| Orders | Unit price snapshot preserved on each item (DB-enforced, immutable) | tested (5.00 x 3 = 15.00 stored) |
| Orders | Board grouped by stage; one-click advance | tested |
| Orders | Order list with search and status filter | code |
| Payments | Multiple partial payments, method + reference; DB rejects overpayment and amounts <= 0 | tested (13.00 total, 5.00 paid, 8.00 due, `partially_paid`) |
| Payments | Payment status derived from records (view), separate from order status | tested |
| Customers | Add, edit, search; order count and amount owed | code |

## Incomplete

| Feature | Gap |
| --- | --- |
| Order number | Suggested in the browser from loaded orders; two devices can pick the same number (DB unique constraint catches it, but the user must retry) |
| New customer + order | Two separate calls; a customer can be saved even when the order fails |
| Deposit at intake | Not supported; a payment can only be added after the order exists |
| Receipt | No printable receipt |
| Photo per garment | No column or storage bucket; not supported by the schema |
| Customer profile | No detail view, order history, or lifetime spending |
| Payment double-submit | Guarded only by a disabled button; a retried request could insert twice |
| Status changes | Dropdown allows marking an order collected while money is owed, with no warning |
| Business details | Only the business name exists; there's no phone, address, receipt note, or currency |

## Missing entirely (no tables, no UI)

- Inventory: supplies, purchases, stock adjustments, minimum levels, low-stock alerts
- Expenses: operating expenses
- Equipment maintenance: service dates, costs, next service dates
- Dashboard with business metrics (the old home page was the board)

## Visual-only

None. Every screen in the original app was wired to Supabase.

## Schema changes made after the audit

Each one exists because a requirement couldn't be met with the existing schema. The original
migration is unchanged.

1. `202610130001_order_intake.sql` (Phase 1): `create_order` RPC that generates the order number
   on the server under a per-shop lock, optionally creates the customer, creates the order through the
   existing `create_order_with_items`, and records a deposit, all in one transaction.
2. `202610130002_inventory_expenses.sql` (Phase 4): supplies, stock movements (derived stock view),
   expenses, equipment, and maintenance records, all with the same owner-only RLS pattern.
3. `202610130003_shop_details.sql` (Phase 5): nullable business contact and receipt columns on `shops`.

## Result after implementation (2026-10-13)

Tested end-to-end in headless Chrome against Postgres 18 + PostgREST 16.4, with all four migrations
applied from scratch, using the real `supabase-js` client and RLS. These were local test records only;
nothing was written to the hosted project.

| Phase | Delivered | Checks |
| --- | --- | --- |
| Redesign | Cream sidebar, white workspace, dashboard (5 metrics, quick actions, attention, low stock, recent orders), mobile menu | Screens reviewed at 1440px and 390px; no page-level horizontal overflow on any page |
| 1 Orders | Customer search/create, multi-line items, colour/description, live totals, discount, deposit, due date, server-generated number, receipt | 14 browser checks + SQL tests (rollback, 12 concurrent orders got unique numbers, cross-tenant denied) |
| 2 Management | Search by number/name/phone, status + payment filters, list/board, status workflow with confirmations, multiple payments, idempotent payment ids | 15 browser checks + REST checks (duplicate id, negative, overpay, cross-tenant) |
| 3 Customers | Table, search, add/edit, profile with exact lifetime spend, paid, outstanding, full history, new order for customer | 10 checks; totals match SQL |
| 4 Inventory & expenses | Supplies with opening stock, purchases with cost, usage, adjustments, low-stock alerts, archive; expenses CRUD by month; equipment service records and due dates | 16 checks + SQL tests (negative stock blocked, including under concurrency; history append-only) |
| 5 Settings & reliability | Business details, currency, price list in Settings; persistence across refresh and re-login; empty, error and missing-migration states | 31 checks; full RLS sweep with a second account and anon |

### Known limits

- Garment photos aren't supported: there's no storage bucket or column. Staff note damage in the description.
- The dashboard and lists load the 500 most recent orders plus every open order. The customer profile reads its totals directly from the database.
- Hosted Supabase returns at most 1,000 rows per request by default. A shop with more customers than that would need pagination.
- The JS bundle is 562 kB (154 kB gzipped). Vite suggests code-splitting, which is optional.
