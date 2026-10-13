-- Inventory, operating expenses and equipment maintenance.
--
-- Why: the initial schema has no tables for supplies, expenses or equipment.
-- These follow the same conventions as the initial migration: shop-scoped
-- rows with composite foreign keys, owner-only RLS, SECURITY INVOKER
-- functions, and derived values in security_invoker views rather than
-- stored totals that could drift.

-- ---------------------------------------------------------------------------
-- Supplies and stock movements
-- ---------------------------------------------------------------------------

CREATE TABLE public.supplies (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops (id) ON DELETE CASCADE,
  supply_name text NOT NULL CHECK (pg_catalog.btrim(supply_name) <> ''),
  unit text NOT NULL DEFAULT 'units' CHECK (pg_catalog.btrim(unit) <> ''),
  minimum_quantity numeric(12, 2) NOT NULL DEFAULT 0 CHECK (minimum_quantity >= 0),
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT supplies_shop_name_key UNIQUE (shop_id, supply_name),
  CONSTRAINT supplies_shop_id_id_key UNIQUE (shop_id, id)
);

-- Stock on hand is the sum of movements. Movements are append-only: mistakes
-- are corrected with an adjustment, so the history stays auditable.
CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops (id) ON DELETE CASCADE,
  supply_id uuid NOT NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('purchase', 'usage', 'adjustment')),
  quantity_change numeric(12, 2) NOT NULL CHECK (quantity_change <> 0),
  total_cost numeric(12, 2) CHECK (total_cost >= 0),
  occurred_on date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT stock_movements_supply_same_shop_fk
    FOREIGN KEY (shop_id, supply_id)
    REFERENCES public.supplies (shop_id, id) ON DELETE RESTRICT,
  CONSTRAINT stock_movements_direction_check CHECK (
    (movement_type = 'purchase' AND quantity_change > 0)
    OR (movement_type = 'usage' AND quantity_change < 0)
    OR movement_type = 'adjustment'
  ),
  CONSTRAINT stock_movements_cost_only_on_purchase_check CHECK (
    total_cost IS NULL OR movement_type = 'purchase'
  )
);

CREATE FUNCTION public.validate_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_on_hand numeric;
BEGIN
  -- Lock the supply so concurrent movements cannot both pass the check.
  PERFORM 1
  FROM public.supplies AS s
  WHERE s.id = NEW.supply_id AND s.shop_id = NEW.shop_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock movement must belong to a supply in the same shop';
  END IF;

  SELECT COALESCE(pg_catalog.sum(m.quantity_change), 0::numeric)
  INTO v_on_hand
  FROM public.stock_movements AS m
  WHERE m.supply_id = NEW.supply_id;

  IF v_on_hand + NEW.quantity_change < 0 THEN
    RAISE EXCEPTION 'Not enough stock: % on hand', v_on_hand;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_stock_movement() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER stock_movements_validate
  BEFORE INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.validate_stock_movement();

CREATE TRIGGER supplies_set_updated_at
  BEFORE UPDATE ON public.supplies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX supplies_shop_active_idx ON public.supplies (shop_id, is_active);
CREATE INDEX stock_movements_supply_idx ON public.stock_movements (supply_id, occurred_on DESC);
CREATE INDEX stock_movements_shop_date_idx ON public.stock_movements (shop_id, occurred_on DESC);

CREATE VIEW public.supply_stock
WITH (security_invoker = true)
AS
SELECT
  s.id AS supply_id,
  s.shop_id,
  s.supply_name,
  s.unit,
  s.minimum_quantity,
  s.notes,
  s.is_active,
  COALESCE(m.on_hand, 0::numeric) AS quantity_on_hand,
  (s.is_active AND s.minimum_quantity > 0 AND COALESCE(m.on_hand, 0::numeric) <= s.minimum_quantity)
    AS is_low,
  m.last_purchase_on,
  s.created_at
FROM public.supplies AS s
LEFT JOIN LATERAL (
  SELECT
    pg_catalog.sum(sm.quantity_change) AS on_hand,
    pg_catalog.max(sm.occurred_on) FILTER (WHERE sm.movement_type = 'purchase') AS last_purchase_on
  FROM public.stock_movements AS sm
  WHERE sm.supply_id = s.id
) AS m ON true;

COMMENT ON VIEW public.supply_stock IS
  'Supplies with stock on hand derived from stock_movements; is_low when at or below the minimum.';

-- Create a supply and its opening stock in one transaction.
CREATE FUNCTION public.create_supply(
  p_shop_id uuid,
  p_supply_name text,
  p_unit text,
  p_minimum_quantity numeric DEFAULT 0,
  p_opening_quantity numeric DEFAULT 0,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_supply_id uuid;
BEGIN
  IF p_opening_quantity IS NULL OR p_opening_quantity < 0 THEN
    RAISE EXCEPTION 'Opening stock must be zero or more';
  END IF;

  INSERT INTO public.supplies (shop_id, supply_name, unit, minimum_quantity, notes)
  VALUES (
    p_shop_id,
    pg_catalog.btrim(COALESCE(p_supply_name, '')),
    pg_catalog.btrim(COALESCE(NULLIF(p_unit, ''), 'units')),
    COALESCE(p_minimum_quantity, 0),
    NULLIF(pg_catalog.btrim(COALESCE(p_notes, '')), '')
  )
  RETURNING id INTO v_supply_id;

  IF p_opening_quantity > 0 THEN
    INSERT INTO public.stock_movements (shop_id, supply_id, movement_type, quantity_change, note)
    VALUES (p_shop_id, v_supply_id, 'adjustment', p_opening_quantity, 'Opening stock');
  END IF;

  RETURN v_supply_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Operating expenses
-- ---------------------------------------------------------------------------

CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops (id) ON DELETE CASCADE,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  category text NOT NULL CHECK (pg_catalog.btrim(category) <> ''),
  description text NOT NULL CHECK (pg_catalog.btrim(description) <> ''),
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  payment_method text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE TRIGGER expenses_set_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX expenses_shop_date_idx ON public.expenses (shop_id, expense_date DESC);

-- ---------------------------------------------------------------------------
-- Equipment and maintenance
-- ---------------------------------------------------------------------------

CREATE TABLE public.equipment (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops (id) ON DELETE CASCADE,
  equipment_name text NOT NULL CHECK (pg_catalog.btrim(equipment_name) <> ''),
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT equipment_shop_name_key UNIQUE (shop_id, equipment_name),
  CONSTRAINT equipment_shop_id_id_key UNIQUE (shop_id, id)
);

CREATE TABLE public.maintenance_records (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops (id) ON DELETE CASCADE,
  equipment_id uuid NOT NULL,
  service_date date NOT NULL,
  description text NOT NULL CHECK (pg_catalog.btrim(description) <> ''),
  cost numeric(12, 2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
  next_service_date date,
  performed_by text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT maintenance_equipment_same_shop_fk
    FOREIGN KEY (shop_id, equipment_id)
    REFERENCES public.equipment (shop_id, id) ON DELETE RESTRICT,
  CONSTRAINT maintenance_next_after_service_check
    CHECK (next_service_date IS NULL OR next_service_date >= service_date)
);

CREATE TRIGGER equipment_set_updated_at
  BEFORE UPDATE ON public.equipment
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER maintenance_records_set_updated_at
  BEFORE UPDATE ON public.maintenance_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX equipment_shop_active_idx ON public.equipment (shop_id, is_active);
CREATE INDEX maintenance_equipment_date_idx ON public.maintenance_records (equipment_id, service_date DESC);
CREATE INDEX maintenance_shop_date_idx ON public.maintenance_records (shop_id, service_date DESC);

-- The latest record decides the next service date.
CREATE VIEW public.equipment_status
WITH (security_invoker = true)
AS
SELECT
  e.id AS equipment_id,
  e.shop_id,
  e.equipment_name,
  e.notes,
  e.is_active,
  latest.service_date AS last_service_date,
  latest.next_service_date,
  COALESCE(totals.total_cost, 0::numeric) AS total_maintenance_cost,
  COALESCE(totals.record_count, 0) AS record_count
FROM public.equipment AS e
LEFT JOIN LATERAL (
  SELECT mr.service_date, mr.next_service_date
  FROM public.maintenance_records AS mr
  WHERE mr.equipment_id = e.id
  ORDER BY mr.service_date DESC, mr.created_at DESC
  LIMIT 1
) AS latest ON true
LEFT JOIN LATERAL (
  SELECT pg_catalog.sum(mr.cost) AS total_cost, pg_catalog.count(*)::integer AS record_count
  FROM public.maintenance_records AS mr
  WHERE mr.equipment_id = e.id
) AS totals ON true;

COMMENT ON VIEW public.equipment_status IS
  'Equipment with the latest service date, next service date from the latest record, and total maintenance cost.';

-- ---------------------------------------------------------------------------
-- Row level security: owner of the shop only
-- ---------------------------------------------------------------------------

ALTER TABLE public.supplies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY supplies_shop_owner_all ON public.supplies
  FOR ALL TO authenticated
  USING (shop_id IN (SELECT s.id FROM public.shops AS s WHERE s.owner_user_id = (SELECT auth.uid())))
  WITH CHECK (shop_id IN (SELECT s.id FROM public.shops AS s WHERE s.owner_user_id = (SELECT auth.uid())));

CREATE POLICY stock_movements_shop_owner_all ON public.stock_movements
  FOR ALL TO authenticated
  USING (shop_id IN (SELECT s.id FROM public.shops AS s WHERE s.owner_user_id = (SELECT auth.uid())))
  WITH CHECK (shop_id IN (SELECT s.id FROM public.shops AS s WHERE s.owner_user_id = (SELECT auth.uid())));

CREATE POLICY expenses_shop_owner_all ON public.expenses
  FOR ALL TO authenticated
  USING (shop_id IN (SELECT s.id FROM public.shops AS s WHERE s.owner_user_id = (SELECT auth.uid())))
  WITH CHECK (shop_id IN (SELECT s.id FROM public.shops AS s WHERE s.owner_user_id = (SELECT auth.uid())));

CREATE POLICY equipment_shop_owner_all ON public.equipment
  FOR ALL TO authenticated
  USING (shop_id IN (SELECT s.id FROM public.shops AS s WHERE s.owner_user_id = (SELECT auth.uid())))
  WITH CHECK (shop_id IN (SELECT s.id FROM public.shops AS s WHERE s.owner_user_id = (SELECT auth.uid())));

CREATE POLICY maintenance_records_shop_owner_all ON public.maintenance_records
  FOR ALL TO authenticated
  USING (shop_id IN (SELECT s.id FROM public.shops AS s WHERE s.owner_user_id = (SELECT auth.uid())))
  WITH CHECK (shop_id IN (SELECT s.id FROM public.shops AS s WHERE s.owner_user_id = (SELECT auth.uid())));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE
  public.supplies, public.stock_movements, public.expenses,
  public.equipment, public.maintenance_records,
  public.supply_stock, public.equipment_status
FROM PUBLIC, anon, authenticated;

-- Supplies and equipment can be deleted only while nothing references them
-- (RESTRICT foreign keys); otherwise they are archived with is_active.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.supplies, public.expenses, public.equipment, public.maintenance_records
TO authenticated;

-- Append-only history.
GRANT SELECT, INSERT ON TABLE public.stock_movements TO authenticated;

GRANT SELECT ON TABLE public.supply_stock, public.equipment_status TO authenticated;

REVOKE ALL ON FUNCTION public.create_supply(uuid, text, text, numeric, numeric, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_supply(uuid, text, text, numeric, numeric, text)
  TO authenticated;
