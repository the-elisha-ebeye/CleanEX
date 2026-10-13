-- Initial schema for LivingStone Laundry.
-- All amounts use a two-decimal currency precision; currency selection is not
-- modeled yet and should be established by the application before production use.

CREATE TABLE public.shops (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  business_name text NOT NULL CHECK (pg_catalog.btrim(business_name) <> ''),
  owner_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops (id) ON DELETE CASCADE,
  customer_name text NOT NULL CHECK (pg_catalog.btrim(customer_name) <> ''),
  phone text NOT NULL CHECK (pg_catalog.btrim(phone) <> ''),
  notes text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT customers_shop_id_id_key UNIQUE (shop_id, id)
);

CREATE TABLE public.clothing_types (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops (id) ON DELETE CASCADE,
  clothing_type_name text NOT NULL CHECK (pg_catalog.btrim(clothing_type_name) <> ''),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT clothing_types_shop_name_key UNIQUE (shop_id, clothing_type_name),
  CONSTRAINT clothing_types_shop_id_id_key UNIQUE (shop_id, id)
);

CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops (id) ON DELETE CASCADE,
  service_name text NOT NULL CHECK (pg_catalog.btrim(service_name) <> ''),
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT services_shop_name_key UNIQUE (shop_id, service_name),
  CONSTRAINT services_shop_id_id_key UNIQUE (shop_id, id)
);

CREATE TABLE public.service_prices (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops (id) ON DELETE CASCADE,
  clothing_type_id uuid NOT NULL,
  service_id uuid NOT NULL,
  unit_price numeric(12, 2) NOT NULL CHECK (unit_price >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT service_prices_clothing_type_fk
    FOREIGN KEY (shop_id, clothing_type_id)
    REFERENCES public.clothing_types (shop_id, id) ON DELETE CASCADE,
  CONSTRAINT service_prices_service_fk
    FOREIGN KEY (shop_id, service_id)
    REFERENCES public.services (shop_id, id) ON DELETE CASCADE,
  CONSTRAINT service_prices_shop_clothing_service_key
    UNIQUE (shop_id, clothing_type_id, service_id)
);

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops (id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  order_number text NOT NULL CHECK (pg_catalog.btrim(order_number) <> ''),
  order_status text NOT NULL DEFAULT 'received'
    CHECK (order_status IN ('received', 'in_progress', 'ready', 'picked_up', 'cancelled')),
  due_date date,
  notes text,
  discount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT orders_customer_same_shop_fk
    FOREIGN KEY (shop_id, customer_id)
    REFERENCES public.customers (shop_id, id) ON DELETE NO ACTION,
  CONSTRAINT orders_shop_order_number_key UNIQUE (shop_id, order_number),
  CONSTRAINT orders_shop_id_id_key UNIQUE (shop_id, id)
);

CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops (id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  clothing_type_id uuid NOT NULL,
  service_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  clothing_description text,
  color text,
  unit_price_snapshot numeric(12, 2) NOT NULL CHECK (unit_price_snapshot >= 0),
  line_total_snapshot numeric(22, 2)
    GENERATED ALWAYS AS (quantity * unit_price_snapshot) STORED,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT order_items_order_same_shop_fk
    FOREIGN KEY (shop_id, order_id)
    REFERENCES public.orders (shop_id, id) ON DELETE CASCADE,
  CONSTRAINT order_items_clothing_type_same_shop_fk
    FOREIGN KEY (shop_id, clothing_type_id)
    REFERENCES public.clothing_types (shop_id, id) ON DELETE NO ACTION,
  CONSTRAINT order_items_service_same_shop_fk
    FOREIGN KEY (shop_id, service_id)
    REFERENCES public.services (shop_id, id) ON DELETE NO ACTION,
  CONSTRAINT order_items_service_price_pair_fk
    FOREIGN KEY (shop_id, clothing_type_id, service_id)
    REFERENCES public.service_prices (shop_id, clothing_type_id, service_id)
    ON DELETE NO ACTION
);

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL CHECK (pg_catalog.btrim(payment_method) <> ''),
  payment_date timestamptz NOT NULL DEFAULT pg_catalog.now(),
  reference text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

-- Keep updated_at useful without a SECURITY DEFINER function.
CREATE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER shops_set_updated_at
  BEFORE UPDATE ON public.shops
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER customers_set_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER clothing_types_set_updated_at
  BEFORE UPDATE ON public.clothing_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER services_set_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER service_prices_set_updated_at
  BEFORE UPDATE ON public.service_prices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER orders_set_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER order_items_set_updated_at
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER payments_set_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Serialize changes to order items, discounts, and payments on the parent order
-- so concurrent writes cannot create a negative balance or an excessive discount.
CREATE FUNCTION public.validate_order_discount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_subtotal numeric;
  v_amount_paid numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.discount <> 0 THEN
      RAISE EXCEPTION 'Create the order with no discount, add its items, then apply the discount; use create_order_with_items for an atomic order';
    END IF;
    RETURN NEW;
  END IF;

  SELECT COALESCE(pg_catalog.sum(oi.line_total_snapshot), 0::numeric)
  INTO v_subtotal
  FROM public.order_items AS oi
  WHERE oi.order_id = NEW.id;

  SELECT COALESCE(pg_catalog.sum(p.amount), 0::numeric)
  INTO v_amount_paid
  FROM public.payments AS p
  WHERE p.order_id = NEW.id;

  IF NEW.discount > v_subtotal THEN
    RAISE EXCEPTION 'Discount cannot exceed the order subtotal';
  END IF;

  IF v_amount_paid > v_subtotal - NEW.discount THEN
    RAISE EXCEPTION 'Discount cannot reduce the order total below payments already recorded';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.validate_order_item_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_order_id uuid;
  v_shop_id uuid;
  v_discount numeric;
  v_subtotal numeric;
  v_amount_paid numeric;
  v_exclude_item_id uuid;
  v_current_unit_price numeric;
  v_price_is_active boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.order_id <> OLD.order_id
    OR NEW.shop_id <> OLD.shop_id
    OR NEW.clothing_type_id <> OLD.clothing_type_id
    OR NEW.service_id <> OLD.service_id
    OR NEW.unit_price_snapshot <> OLD.unit_price_snapshot
  ) THEN
    RAISE EXCEPTION 'An order item cannot be moved, repriced, or changed to another clothing type or service';
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_order_id := OLD.order_id;
    v_shop_id := OLD.shop_id;
    v_exclude_item_id := OLD.id;
  ELSE
    v_order_id := NEW.order_id;
    v_shop_id := NEW.shop_id;
    IF TG_OP = 'UPDATE' THEN
      v_exclude_item_id := OLD.id;
    END IF;
  END IF;

  SELECT o.discount
  INTO v_discount
  FROM public.orders AS o
  WHERE o.id = v_order_id AND o.shop_id = v_shop_id
  FOR UPDATE;

  -- A cascading order deletion has already removed the parent row.
  IF NOT FOUND AND TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSIF NOT FOUND THEN
    RAISE EXCEPTION 'Order item must belong to an existing order in the same shop';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT sp.unit_price, sp.is_active
    INTO v_current_unit_price, v_price_is_active
    FROM public.service_prices AS sp
    JOIN public.clothing_types AS ct
      ON ct.shop_id = sp.shop_id AND ct.id = sp.clothing_type_id
    JOIN public.services AS s
      ON s.shop_id = sp.shop_id AND s.id = sp.service_id
    WHERE sp.shop_id = v_shop_id
      AND sp.clothing_type_id = NEW.clothing_type_id
      AND sp.service_id = NEW.service_id
      AND ct.is_active
      AND s.is_active
    FOR SHARE OF sp;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'An active clothing type and service with an active price are required to add an item to an order';
    END IF;

    IF NOT v_price_is_active THEN
      RAISE EXCEPTION 'A clothing type and service must have an active price before they can be added to an order';
    END IF;

    NEW.unit_price_snapshot := v_current_unit_price;
  END IF;

  SELECT COALESCE(pg_catalog.sum(oi.line_total_snapshot), 0::numeric)
  INTO v_subtotal
  FROM public.order_items AS oi
  WHERE oi.order_id = v_order_id
    AND (v_exclude_item_id IS NULL OR oi.id <> v_exclude_item_id);

  IF TG_OP <> 'DELETE' THEN
    v_subtotal := v_subtotal + (NEW.quantity * NEW.unit_price_snapshot);
  END IF;

  SELECT COALESCE(pg_catalog.sum(p.amount), 0::numeric)
  INTO v_amount_paid
  FROM public.payments AS p
  WHERE p.order_id = v_order_id;

  IF v_discount > v_subtotal THEN
    RAISE EXCEPTION 'Order items cannot reduce the subtotal below its discount';
  END IF;

  IF v_amount_paid > v_subtotal - v_discount THEN
    RAISE EXCEPTION 'Order items cannot reduce the order total below payments already recorded';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.validate_payment_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_discount numeric;
  v_subtotal numeric;
  v_amount_paid numeric;
  v_exclude_payment_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.order_id <> OLD.order_id THEN
    RAISE EXCEPTION 'A payment cannot be moved to another order';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_exclude_payment_id := OLD.id;
  END IF;

  SELECT o.discount
  INTO v_discount
  FROM public.orders AS o
  WHERE o.id = NEW.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment must belong to an existing order';
  END IF;

  SELECT COALESCE(pg_catalog.sum(oi.line_total_snapshot), 0::numeric)
  INTO v_subtotal
  FROM public.order_items AS oi
  WHERE oi.order_id = NEW.order_id;

  SELECT COALESCE(pg_catalog.sum(p.amount), 0::numeric)
  INTO v_amount_paid
  FROM public.payments AS p
  WHERE p.order_id = NEW.order_id
    AND (v_exclude_payment_id IS NULL OR p.id <> v_exclude_payment_id);

  IF v_amount_paid + NEW.amount > v_subtotal - v_discount THEN
    RAISE EXCEPTION 'Payment would exceed the remaining order balance';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.require_order_items_before_commit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_order_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'orders' THEN
    v_order_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    v_order_id := OLD.order_id;
  ELSE
    v_order_id := NEW.order_id;
  END IF;

  -- Deleting an order also deletes its items; that must not block the cascade.
  IF NOT EXISTS (
    SELECT 1 FROM public.orders AS o WHERE o.id = v_order_id
  ) THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.order_items AS oi WHERE oi.order_id = v_order_id
  ) THEN
    RAISE EXCEPTION 'An order must have at least one item before the transaction commits';
  END IF;

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_order_discount() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_order_item_total() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_payment_total() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.require_order_items_before_commit() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER orders_validate_discount_insert
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.validate_order_discount();
CREATE TRIGGER orders_validate_discount_update
  BEFORE UPDATE OF discount ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.validate_order_discount();
CREATE TRIGGER order_items_validate_total
  BEFORE INSERT OR UPDATE OR DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_order_item_total();
CREATE TRIGGER payments_validate_total
  BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.validate_payment_total();
CREATE CONSTRAINT TRIGGER orders_require_items_before_commit
  AFTER INSERT ON public.orders
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.require_order_items_before_commit();
CREATE CONSTRAINT TRIGGER order_items_require_order_item_before_commit
  AFTER INSERT OR UPDATE OR DELETE ON public.order_items
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.require_order_items_before_commit();

CREATE INDEX shops_owner_user_id_idx ON public.shops (owner_user_id);
CREATE INDEX customers_shop_name_idx ON public.customers (shop_id, customer_name);
CREATE INDEX clothing_types_shop_active_idx ON public.clothing_types (shop_id, is_active);
CREATE INDEX services_shop_active_idx ON public.services (shop_id, is_active);
CREATE INDEX service_prices_shop_service_idx ON public.service_prices (shop_id, service_id);
CREATE INDEX orders_shop_created_at_idx ON public.orders (shop_id, created_at DESC);
CREATE INDEX orders_shop_customer_idx ON public.orders (shop_id, customer_id);
CREATE INDEX orders_shop_due_date_idx ON public.orders (shop_id, due_date);
CREATE INDEX order_items_shop_order_idx ON public.order_items (shop_id, order_id);
CREATE INDEX order_items_shop_clothing_type_idx
  ON public.order_items (shop_id, clothing_type_id);
CREATE INDEX order_items_shop_service_idx ON public.order_items (shop_id, service_id);
CREATE INDEX payments_order_id_payment_date_idx
  ON public.payments (order_id, payment_date DESC);

-- Create an order in one call: insert at zero discount, snapshot each current
-- price, then validate and apply the requested discount. Any error rolls back
-- the entire function statement; the deferred item check runs at transaction end.
CREATE FUNCTION public.create_order_with_items(
  p_shop_id uuid,
  p_customer_id uuid,
  p_order_number text,
  p_items jsonb,
  p_discount numeric DEFAULT 0,
  p_due_date date DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_order_id uuid;
BEGIN
  IF p_items IS NULL OR pg_catalog.jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Order items must be provided as a JSON array';
  END IF;

  IF pg_catalog.jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'An order must include at least one item';
  END IF;

  IF p_discount IS NULL OR p_discount < 0 THEN
    RAISE EXCEPTION 'Discount must be zero or greater';
  END IF;

  INSERT INTO public.orders (
    shop_id,
    customer_id,
    order_number,
    due_date,
    notes,
    discount
  )
  VALUES (
    p_shop_id,
    p_customer_id,
    p_order_number,
    p_due_date,
    p_notes,
    0
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (
    shop_id,
    order_id,
    clothing_type_id,
    service_id,
    quantity,
    clothing_description,
    color
  )
  SELECT
    p_shop_id,
    v_order_id,
    (item ->> 'clothing_type_id')::uuid,
    (item ->> 'service_id')::uuid,
    (item ->> 'quantity')::integer,
    item ->> 'clothing_description',
    item ->> 'color'
  FROM pg_catalog.jsonb_array_elements(p_items) AS entries(item);

  UPDATE public.orders
  SET discount = p_discount
  WHERE id = v_order_id;

  RETURN v_order_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_order_with_items(
  uuid, uuid, text, jsonb, numeric, date, text
) FROM PUBLIC, anon, authenticated;

-- RLS policies authorize a shop owner and only records belonging to that owner's
-- shop. Composite foreign keys also prevent linking records across shops.
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clothing_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY shops_owner_all
  ON public.shops
  FOR ALL TO authenticated
  USING (owner_user_id = (SELECT auth.uid()))
  WITH CHECK (owner_user_id = (SELECT auth.uid()));

CREATE POLICY customers_shop_owner_all
  ON public.customers
  FOR ALL TO authenticated
  USING (
    shop_id IN (
      SELECT s.id FROM public.shops AS s
      WHERE s.owner_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    shop_id IN (
      SELECT s.id FROM public.shops AS s
      WHERE s.owner_user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY clothing_types_shop_owner_all
  ON public.clothing_types
  FOR ALL TO authenticated
  USING (
    shop_id IN (
      SELECT s.id FROM public.shops AS s
      WHERE s.owner_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    shop_id IN (
      SELECT s.id FROM public.shops AS s
      WHERE s.owner_user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY services_shop_owner_all
  ON public.services
  FOR ALL TO authenticated
  USING (
    shop_id IN (
      SELECT s.id FROM public.shops AS s
      WHERE s.owner_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    shop_id IN (
      SELECT s.id FROM public.shops AS s
      WHERE s.owner_user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY service_prices_shop_owner_all
  ON public.service_prices
  FOR ALL TO authenticated
  USING (
    shop_id IN (
      SELECT s.id FROM public.shops AS s
      WHERE s.owner_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    shop_id IN (
      SELECT s.id FROM public.shops AS s
      WHERE s.owner_user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY orders_shop_owner_all
  ON public.orders
  FOR ALL TO authenticated
  USING (
    shop_id IN (
      SELECT s.id FROM public.shops AS s
      WHERE s.owner_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    shop_id IN (
      SELECT s.id FROM public.shops AS s
      WHERE s.owner_user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY order_items_shop_owner_all
  ON public.order_items
  FOR ALL TO authenticated
  USING (
    shop_id IN (
      SELECT s.id FROM public.shops AS s
      WHERE s.owner_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    shop_id IN (
      SELECT s.id FROM public.shops AS s
      WHERE s.owner_user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY payments_shop_owner_all
  ON public.payments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders AS o
      JOIN public.shops AS s ON s.id = o.shop_id
      WHERE o.id = payments.order_id
        AND s.owner_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.orders AS o
      JOIN public.shops AS s ON s.id = o.shop_id
      WHERE o.id = payments.order_id
        AND s.owner_user_id = (SELECT auth.uid())
    )
  );

-- Payment status is derived, not stored, so it always reflects current order
-- items and payments. The invoker setting preserves underlying table RLS.
CREATE VIEW public.order_payment_status
WITH (security_invoker = true)
AS
SELECT
  o.id AS order_id,
  o.shop_id,
  COALESCE(items.subtotal, 0::numeric) AS item_subtotal,
  GREATEST(COALESCE(items.subtotal, 0::numeric) - o.discount, 0::numeric)
    AS order_total,
  COALESCE(payment_totals.amount_paid, 0::numeric) AS amount_paid,
  GREATEST(
    GREATEST(COALESCE(items.subtotal, 0::numeric) - o.discount, 0::numeric)
      - COALESCE(payment_totals.amount_paid, 0::numeric),
    0::numeric
  ) AS balance_due,
  CASE
    WHEN COALESCE(payment_totals.amount_paid, 0::numeric)
      < GREATEST(COALESCE(items.subtotal, 0::numeric) - o.discount, 0::numeric)
      AND COALESCE(payment_totals.amount_paid, 0::numeric) = 0
      THEN 'unpaid'
    WHEN COALESCE(payment_totals.amount_paid, 0::numeric)
      < GREATEST(COALESCE(items.subtotal, 0::numeric) - o.discount, 0::numeric)
      THEN 'partially_paid'
    WHEN COALESCE(payment_totals.amount_paid, 0::numeric)
      = GREATEST(COALESCE(items.subtotal, 0::numeric) - o.discount, 0::numeric)
      THEN 'paid'
    ELSE 'overpaid'
  END AS payment_status
FROM public.orders AS o
LEFT JOIN LATERAL (
  SELECT pg_catalog.sum(oi.line_total_snapshot) AS subtotal
  FROM public.order_items AS oi
  WHERE oi.shop_id = o.shop_id AND oi.order_id = o.id
) AS items ON true
LEFT JOIN LATERAL (
  SELECT pg_catalog.sum(p.amount) AS amount_paid
  FROM public.payments AS p
  WHERE p.order_id = o.id
) AS payment_totals ON true;

COMMENT ON TABLE public.service_prices IS
  'Current prices by clothing type and service. Order items retain their own price snapshots.';
COMMENT ON TABLE public.orders IS
  'Orders must contain at least one item at transaction commit. Use create_order_with_items to create an order, its items, and optional discount atomically; itemless orders may exist only temporarily within that transaction.';
COMMENT ON COLUMN public.order_items.unit_price_snapshot IS
  'Copied from the active service price when inserted and immutable afterward; later price-list changes do not alter it.';
COMMENT ON COLUMN public.order_items.line_total_snapshot IS
  'Stored generated snapshot calculated from quantity and unit_price_snapshot.';
COMMENT ON VIEW public.order_payment_status IS
  'Calculates totals and payment status from current order items and payments; payment status is not independently editable. Zero-total orders are paid with no balance due; overpayments are rejected by write-time validation.';
COMMENT ON FUNCTION public.create_order_with_items(
  uuid, uuid, text, jsonb, numeric, date, text
) IS
  'Atomically creates an order and its items for the authenticated owner. Runs as SECURITY INVOKER so table grants and RLS policies are enforced.';
COMMENT ON FUNCTION public.require_order_items_before_commit() IS
  'Allows an order to be temporarily itemless within a transaction, but prevents committing an order with no items.';

-- Supabase grants are explicit: the anonymous and PUBLIC roles receive no table
-- access; authenticated users still need an owner-matching RLS policy.
REVOKE ALL ON TABLE
  public.shops,
  public.customers,
  public.clothing_types,
  public.services,
  public.service_prices,
  public.orders,
  public.order_items,
  public.payments
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.shops,
  public.customers,
  public.clothing_types,
  public.services,
  public.service_prices,
  public.orders,
  public.order_items,
  public.payments
TO authenticated;

REVOKE ALL ON TABLE public.order_payment_status FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.order_payment_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_with_items(
  uuid, uuid, text, jsonb, numeric, date, text
) TO authenticated;
