-- Business contact details for receipts, and the currency used to display amounts.
--
-- Why: the shops table stores only business_name, so receipts could not show
-- how to reach the shop, and amounts were shown without a currency (the
-- initial migration notes that currency was not modeled yet).
-- All columns are nullable; existing rows are unaffected and the existing
-- shops_owner_all policy already covers them.

ALTER TABLE public.shops
  ADD COLUMN business_phone text,
  ADD COLUMN business_address text,
  ADD COLUMN receipt_note text,
  ADD COLUMN currency_code text
    CONSTRAINT shops_currency_code_check CHECK (currency_code ~ '^[A-Z]{3}$');

COMMENT ON COLUMN public.shops.currency_code IS
  'ISO 4217 code such as NGN, KES or USD used to display amounts. NULL shows plain two-decimal amounts.';
