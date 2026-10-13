# CleanEX

Orders, payments, customers, supplies and running costs for a laundry shop.
React 19 + TypeScript + Vite + Tailwind CSS v4, with Supabase (Postgres, Auth, RLS) as the backend.

## Run locally

```sh
npm install
# .env.local needs VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (publishable key only)
npm run dev
npm run build   # type-check + production bundle in dist/
```

## Database

Migrations live in `supabase/migrations` and must be applied in filename order:

| File | Adds |
| --- | --- |
| `202610120001_initial_schema.sql` | Shops, customers, price list, orders, items, payments, RLS |
| `202610130001_order_intake.sql` | `create_order` RPC: server-side order numbers, new customer + order + deposit in one transaction |
| `202610130002_inventory_expenses.sql` | Supplies, stock movements, expenses, equipment, maintenance (+ views, RLS) |
| `202610130003_shop_details.sql` | Business phone, address, receipt note, currency on `shops` |

Apply them with the Supabase CLI (`supabase db push`) or paste each file, in order, into the
Supabase dashboard SQL editor. Until a migration is applied, the app shows a notice on the
feature that needs it; orders and payments keep working without the inventory migration.

## Where things are

- `src/components/AppShell.tsx` – sidebar, mobile menu, hash routes (`#/dashboard`, `#/orders`, …)
- `src/lib/shop-data.tsx` – loads the shop's records; `reload()` after every write
- `src/components/NewOrderDialog.tsx`, `OrderDrawer.tsx`, `ReceiptPage.tsx` – order intake, payments, receipts
- `docs/FEATURE_AUDIT.md` – what existed, what was added, and how it was tested
