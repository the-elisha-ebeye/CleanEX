-- Order intake in one transaction.
--
-- Why: order numbers were suggested in the browser, so two devices could pick
-- the same number; a new customer was saved in a separate request from the
-- order; and a deposit could only be recorded after the order existed.
--
-- create_order() generates the next number for the shop's local day under a
-- per-shop advisory lock, optionally creates the customer, delegates to the
-- existing create_order_with_items() (keeping its price snapshot and discount
-- validation), and records a deposit. Any failure rolls back everything.
-- No tables or columns change.

CREATE FUNCTION public.create_order(
  p_shop_id uuid,
  p_items jsonb,
  p_order_date date,
  p_customer_id uuid DEFAULT NULL,
  p_new_customer jsonb DEFAULT NULL,
  p_discount numeric DEFAULT 0,
  p_due_date date DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_deposit numeric DEFAULT 0,
  p_deposit_method text DEFAULT NULL,
  p_deposit_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_customer_id uuid;
  v_prefix text;
  v_seq integer;
  v_order_number text;
  v_order_id uuid;
BEGIN
  IF (p_customer_id IS NULL) = (p_new_customer IS NULL) THEN
    RAISE EXCEPTION 'Choose an existing customer or enter a new one';
  END IF;

  -- The browser sends its local date; allow one day either side of the
  -- database clock so shops in any time zone can take orders around midnight.
  IF p_order_date IS NULL
    OR p_order_date NOT BETWEEN CURRENT_DATE - 1 AND CURRENT_DATE + 1 THEN
    RAISE EXCEPTION 'The order date must be today';
  END IF;

  IF p_due_date IS NOT NULL AND p_due_date < p_order_date THEN
    RAISE EXCEPTION 'The due date cannot be before the order date';
  END IF;

  IF p_deposit IS NULL OR p_deposit < 0 THEN
    RAISE EXCEPTION 'The deposit must be zero or more';
  END IF;

  IF p_deposit > 0 AND pg_catalog.btrim(COALESCE(p_deposit_method, '')) = '' THEN
    RAISE EXCEPTION 'Choose how the deposit was paid';
  END IF;

  -- RLS hides shops the caller does not own, so this also checks ownership.
  IF NOT EXISTS (SELECT 1 FROM public.shops AS s WHERE s.id = p_shop_id) THEN
    RAISE EXCEPTION 'Shop not found';
  END IF;

  IF p_new_customer IS NOT NULL THEN
    INSERT INTO public.customers (shop_id, customer_name, phone, notes)
    VALUES (
      p_shop_id,
      pg_catalog.btrim(COALESCE(p_new_customer ->> 'customer_name', '')),
      pg_catalog.btrim(COALESCE(p_new_customer ->> 'phone', '')),
      NULLIF(pg_catalog.btrim(COALESCE(p_new_customer ->> 'notes', '')), '')
    )
    RETURNING id INTO v_customer_id;
  ELSE
    v_customer_id := p_customer_id;
  END IF;

  -- Serialize numbering per shop until this transaction ends.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('livingstone.order_number:' || p_shop_id::text, 0)
  );

  v_prefix := pg_catalog.to_char(p_order_date, 'YYMMDD');

  SELECT COALESCE(pg_catalog.max(pg_catalog.substr(o.order_number, 8)::integer), 0) + 1
  INTO v_seq
  FROM public.orders AS o
  WHERE o.shop_id = p_shop_id
    AND o.order_number ~ ('^' || v_prefix || '-[0-9]+$');

  v_order_number := v_prefix || '-' || CASE WHEN v_seq < 10 THEN '0' ELSE '' END || v_seq::text;

  v_order_id := public.create_order_with_items(
    p_shop_id,
    v_customer_id,
    v_order_number,
    p_items,
    COALESCE(p_discount, 0),
    p_due_date,
    NULLIF(pg_catalog.btrim(COALESCE(p_notes, '')), '')
  );

  IF p_deposit > 0 THEN
    -- validate_payment_total() rejects a deposit larger than the order total.
    INSERT INTO public.payments (order_id, amount, payment_method, reference)
    VALUES (
      v_order_id,
      p_deposit,
      pg_catalog.btrim(p_deposit_method),
      NULLIF(pg_catalog.btrim(COALESCE(p_deposit_reference, '')), '')
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'customer_id', v_customer_id
  );
END;
$function$;

COMMENT ON FUNCTION public.create_order(
  uuid, jsonb, date, uuid, jsonb, numeric, date, text, numeric, text, text
) IS
  'Creates an order atomically: server-generated YYMMDD-NN number, optional new customer, items with price snapshots (via create_order_with_items), discount and optional deposit. SECURITY INVOKER so RLS applies.';

REVOKE ALL ON FUNCTION public.create_order(
  uuid, jsonb, date, uuid, jsonb, numeric, date, text, numeric, text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_order(
  uuid, jsonb, date, uuid, jsonb, numeric, date, text, numeric, text, text
) TO authenticated;
