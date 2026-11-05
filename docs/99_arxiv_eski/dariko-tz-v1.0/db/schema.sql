-- =====================================================================
-- Universal dostavka platformasi — PostgreSQL 15+ boshlang'ich sxemasi
-- TZ v1.0, 7-bo'lim. Migratsiyalar uchun asos; jamoa ORM migratsiyasiga
-- o'tkazadi. Barcha biznes jadvallarida tenant_id majburiy.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS postgis;    -- xizmat hududlari

-- ---------- Ro'yxatlar (enum) ----------
CREATE TYPE business_profile AS ENUM ('small_shop', 'supermarket', 'restaurant', 'non_food');
CREATE TYPE user_role       AS ENUM ('customer', 'tenant_owner', 'branch_manager', 'picker',
                                     'dispatcher', 'courier', 'support', 'finance', 'platform_admin');
CREATE TYPE order_status    AS ENUM ('created', 'pending_confirmation', 'accepted', 'preparing',
                                     'ready', 'in_delivery', 'completed', 'cancelled');
CREATE TYPE payment_status  AS ENUM ('pending', 'authorized', 'paid', 'refunding',
                                     'partially_refunded', 'refunded', 'failed');
CREATE TYPE shipment_status AS ENUM ('created', 'assigned', 'picked_up', 'on_the_way',
                                     'delivered', 'failed', 'returned');
CREATE TYPE substitution_rule AS ENUM ('suggest_similar', 'remove', 'call_me');
CREATE TYPE payment_method  AS ENUM ('online', 'cash_on_delivery', 'card_on_delivery');
CREATE TYPE pod_type        AS ENUM ('pin', 'photo', 'signature');

-- ---------- Hamkor va filial ----------
CREATE TABLE tenants (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,
    slug            text NOT NULL UNIQUE,                 -- subdomen / yo'l
    profile         business_profile NOT NULL,
    package         text NOT NULL DEFAULT 'start',        -- start | pro | delivery
    brand           jsonb NOT NULL DEFAULT '{}',          -- logo, ranglar
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE branches (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenants(id),
    name            text NOT NULL,
    address         text NOT NULL,
    location        geography(Point, 4326) NOT NULL,
    phone           text,
    working_hours   jsonb NOT NULL DEFAULT '{}',          -- {"mon":[["09:00","22:00"]],...}
    manual_confirm  boolean NOT NULL DEFAULT false,       -- kichik do'kon: qo'lda tasdiq
    confirm_sla_sec integer NOT NULL DEFAULT 300,
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON branches (tenant_id);

-- ---------- Foydalanuvchilar ----------
CREATE TABLE users (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    phone           text NOT NULL UNIQUE,                 -- +998XXXXXXXXX
    full_name       text,
    password_hash   text,                                 -- faqat xodimlar uchun
    mfa_secret      text,                                 -- shifrlangan holda
    locale          text NOT NULL DEFAULT 'uz',
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_roles (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES users(id),
    role            user_role NOT NULL,
    tenant_id       uuid REFERENCES tenants(id),          -- platform_admin uchun NULL
    branch_id       uuid REFERENCES branches(id),         -- filialga bog'langan rollar
    CONSTRAINT user_roles_uniq UNIQUE NULLS NOT DISTINCT (user_id, role, tenant_id, branch_id)
);

CREATE TABLE customer_addresses (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES users(id),
    label           text,
    address_text    text NOT NULL,
    landmark        text,                                 -- mo'ljal
    entrance        text, floor text, apartment text,
    location        geography(Point, 4326) NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------- Katalog ----------
CREATE TABLE categories (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenants(id),
    parent_id       uuid REFERENCES categories(id),
    name            jsonb NOT NULL,                       -- {"uz":"...","ru":"..."}
    sort_order      integer NOT NULL DEFAULT 0
);

CREATE TABLE products (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenants(id),
    category_id     uuid REFERENCES categories(id),
    name            jsonb NOT NULL,
    description     jsonb,
    unit            text NOT NULL DEFAULT 'pcs',          -- pcs | kg | l
    is_weighted     boolean NOT NULL DEFAULT false,       -- tarozili
    is_fragile      boolean NOT NULL DEFAULT false,
    requires_serial boolean NOT NULL DEFAULT false,
    images          jsonb NOT NULL DEFAULT '[]',
    is_active       boolean NOT NULL DEFAULT true
);
CREATE INDEX ON products (tenant_id, category_id);

CREATE TABLE product_variants (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenants(id),
    product_id      uuid NOT NULL REFERENCES products(id),
    sku             text NOT NULL,
    barcode         text,
    attributes      jsonb NOT NULL DEFAULT '{}',          -- rang, o'lcham, porsiya
    weight_g        integer,
    volume_cm3      integer,
    UNIQUE (tenant_id, sku)
);

CREATE TABLE modifiers (                                  -- restoran qo'shimchalari
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenants(id),
    product_id      uuid NOT NULL REFERENCES products(id),
    name            jsonb NOT NULL,
    price           bigint NOT NULL DEFAULT 0,            -- tiyinda
    max_qty         integer NOT NULL DEFAULT 1
);

-- ---------- Filial narxi va qoldig'i ----------
CREATE TABLE branch_stock (
    tenant_id       uuid NOT NULL REFERENCES tenants(id),
    branch_id       uuid NOT NULL REFERENCES branches(id),
    variant_id      uuid NOT NULL REFERENCES product_variants(id),
    price           bigint NOT NULL,                      -- tiyinda (1 so'm = 100)
    available_qty   numeric(12,3) NOT NULL DEFAULT 0,
    reserved_qty    numeric(12,3) NOT NULL DEFAULT 0,
    online_quota    numeric(12,3),                        -- POS rezervni qo'llamasa
    is_stopped      boolean NOT NULL DEFAULT false,       -- stop-list
    source          text NOT NULL DEFAULT 'manual',       -- manual | csv | pos
    synced_at       timestamptz NOT NULL DEFAULT now(),   -- eskirganlik nazorati
    PRIMARY KEY (branch_id, variant_id),
    CHECK (reserved_qty >= 0 AND reserved_qty <= available_qty)
);

-- ---------- Hudud va slot ----------
CREATE TABLE delivery_zones (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenants(id),
    branch_id       uuid NOT NULL REFERENCES branches(id),
    name            text NOT NULL,
    area            geography(Polygon, 4326) NOT NULL,
    delivery_fee    bigint NOT NULL,
    free_from       bigint,                               -- shu summadan bepul
    min_order       bigint NOT NULL DEFAULT 0,
    priority        integer NOT NULL DEFAULT 0
);
CREATE INDEX ON delivery_zones USING gist (area);

CREATE TABLE time_slots (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenants(id),
    branch_id       uuid NOT NULL REFERENCES branches(id),
    starts_at       timestamptz NOT NULL,
    ends_at         timestamptz NOT NULL,
    capacity        integer NOT NULL,
    booked          integer NOT NULL DEFAULT 0,
    CHECK (booked >= 0 AND booked <= capacity),
    UNIQUE (branch_id, starts_at)
);

-- ---------- Buyurtma ----------
CREATE TABLE orders (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    number              text NOT NULL UNIQUE,             -- inson o'qiydigan raqam
    tenant_id           uuid NOT NULL REFERENCES tenants(id),
    branch_id           uuid NOT NULL REFERENCES branches(id),
    customer_id         uuid REFERENCES users(id),        -- mehmon uchun NULL
    customer_phone      text NOT NULL,
    address             jsonb NOT NULL,                   -- buyurtma vaqtidagi nusxa
    slot_id             uuid REFERENCES time_slots(id),
    status              order_status NOT NULL DEFAULT 'created',
    version             integer NOT NULL DEFAULT 1,       -- optimistik versiyalash
    channel             text NOT NULL DEFAULT 'web',      -- web | telegram | qr | instagram
    utm                 jsonb,
    payment_method      payment_method NOT NULL,
    substitution_rule   substitution_rule NOT NULL DEFAULT 'suggest_similar',
    consent_increase_pct numeric(5,2) NOT NULL DEFAULT 10, -- rozilik chegarasi
    subtotal            bigint NOT NULL,
    delivery_fee        bigint NOT NULL DEFAULT 0,
    discount            bigint NOT NULL DEFAULT 0,
    total               bigint NOT NULL,
    final_total         bigint,                           -- yig'ishdan keyin
    reserve_expires_at  timestamptz,
    cancel_reason       text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON orders (tenant_id, branch_id, status, created_at DESC);

CREATE TABLE order_items (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id),
    order_id            uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    variant_id          uuid NOT NULL REFERENCES product_variants(id),
    name_snapshot       jsonb NOT NULL,
    unit_price          bigint NOT NULL,
    requested_qty       numeric(12,3) NOT NULL,
    actual_qty          numeric(12,3),                    -- tarozili: haqiqiy vazn
    modifiers           jsonb NOT NULL DEFAULT '[]',
    substitution_rule   substitution_rule,                -- qator darajasida
    substituted_by      uuid REFERENCES product_variants(id),
    serial_number       text,
    status              text NOT NULL DEFAULT 'pending'   -- pending | picked | substituted | removed
);

CREATE TABLE order_versions (                            -- yakuniy summa tarixi
    order_id            uuid NOT NULL REFERENCES orders(id),
    version             integer NOT NULL,
    snapshot            jsonb NOT NULL,
    reason              text NOT NULL,
    customer_approved   boolean,
    created_at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (order_id, version)
);

CREATE TABLE order_status_history (
    id                  bigserial PRIMARY KEY,
    order_id            uuid NOT NULL REFERENCES orders(id),
    from_status         order_status,
    to_status           order_status NOT NULL,
    actor_id            uuid REFERENCES users(id),
    reason              text,
    created_at          timestamptz NOT NULL DEFAULT now()
);

-- ---------- To'lov ----------
CREATE TABLE payments (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id),
    order_id            uuid NOT NULL REFERENCES orders(id),
    provider            text NOT NULL,                    -- payme | click | cash
    external_txn_id     text,
    amount              bigint NOT NULL,
    status              payment_status NOT NULL DEFAULT 'pending',
    idempotency_key     uuid NOT NULL UNIQUE,
    fiscal_receipt      jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider, external_txn_id)
);

CREATE TABLE refunds (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id),
    payment_id          uuid NOT NULL REFERENCES payments(id),
    amount              bigint NOT NULL,
    reason              text NOT NULL,
    status              payment_status NOT NULL DEFAULT 'refunding',
    approved_by         uuid REFERENCES users(id),
    idempotency_key     uuid NOT NULL UNIQUE,
    created_at          timestamptz NOT NULL DEFAULT now()
);

-- ---------- Yetkazish ----------
CREATE TABLE shipments (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id),
    order_id            uuid NOT NULL REFERENCES orders(id),
    courier_id          uuid REFERENCES users(id),
    provider            text NOT NULL DEFAULT 'own',      -- own | yandex_delivery ...
    external_id         text,
    vehicle_type        text,                             -- foot | bike | car | van
    status              shipment_status NOT NULL DEFAULT 'created',
    pin_code_hash       text,                             -- 4 xonali PIN xeshi
    pod_type            pod_type,
    pod_url             text,
    failure_reason      text,
    contact_attempts    integer NOT NULL DEFAULT 0,
    tracking_token      text UNIQUE,
    tracking_expires_at timestamptz,
    eta                 timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON shipments (courier_id, status);

-- ---------- Murojaat ----------
CREATE TABLE tickets (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id),
    order_id            uuid NOT NULL REFERENCES orders(id),
    order_item_id       uuid REFERENCES order_items(id),
    type                text NOT NULL,                    -- damaged | missing | late | other
    message             text,
    attachments         jsonb NOT NULL DEFAULT '[]',
    status              text NOT NULL DEFAULT 'open',     -- open | in_progress | resolved
    assignee_id         uuid REFERENCES users(id),
    first_response_at   timestamptz,
    resolved_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now()
);

-- ---------- Ishonchlilik: idempotentlik, outbox, webhook ----------
CREATE TABLE idempotency_keys (
    key                 uuid PRIMARY KEY,
    scope               text NOT NULL,                    -- create_order | create_payment ...
    request_hash        text NOT NULL,
    response_code       integer,
    response_body       jsonb,
    created_at          timestamptz NOT NULL DEFAULT now()  -- 24 soatdan keyin tozalanadi
);

CREATE TABLE outbox_events (
    id                  bigserial PRIMARY KEY,
    tenant_id           uuid,
    aggregate_type      text NOT NULL,                    -- order | payment | shipment
    aggregate_id        uuid NOT NULL,
    event_type          text NOT NULL,                    -- order.accepted ...
    payload             jsonb NOT NULL,
    attempts            integer NOT NULL DEFAULT 0,
    next_attempt_at     timestamptz NOT NULL DEFAULT now(),
    sent_at             timestamptz,
    dead_lettered_at    timestamptz,
    last_error          text,
    created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON outbox_events (next_attempt_at) WHERE sent_at IS NULL AND dead_lettered_at IS NULL;

CREATE TABLE inbound_webhooks (
    id                  bigserial PRIMARY KEY,
    provider            text NOT NULL,
    external_event_id   text NOT NULL,
    payload             jsonb NOT NULL,
    processed_at        timestamptz,
    received_at         timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider, external_event_id)
);

-- ---------- Audit (faqat qo'shish) ----------
CREATE TABLE audit_log (
    id                  bigserial PRIMARY KEY,
    tenant_id           uuid,
    actor_id            uuid,
    entity              text NOT NULL,
    entity_id           text NOT NULL,
    action              text NOT NULL,
    old_value           jsonb,
    new_value           jsonb,
    ip                  inet,
    request_id          text,
    created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE RULE audit_log_no_update AS ON UPDATE TO audit_log DO INSTEAD NOTHING;
CREATE RULE audit_log_no_delete AS ON DELETE TO audit_log DO INSTEAD NOTHING;

-- ---------- Rezerv: atomar band qilish namunasi ----------
-- Oxirgi SKU uchun raqobatda faqat bittasi muvaffaqiyatli bo'ladi (AC-02).
-- Qaytgan qatorlar soni 0 bo'lsa — qoldiq yetarli emas, tranzaksiya bekor qilinadi.
CREATE OR REPLACE FUNCTION reserve_stock(p_branch uuid, p_variant uuid, p_qty numeric)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
    UPDATE branch_stock
       SET reserved_qty = reserved_qty + p_qty
     WHERE branch_id = p_branch
       AND variant_id = p_variant
       AND is_stopped = false
       AND available_qty - reserved_qty >= p_qty
       AND (online_quota IS NULL OR reserved_qty + p_qty <= online_quota);
    RETURN FOUND;
END;
$$;

-- ---------- Row-Level Security (qo'shimcha himoya qatlami) ----------
-- Ilova har bir so'rovda: SET app.tenant_id = '<uuid>';
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON orders
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
-- Xuddi shu siyosat boshqa tenant jadvallariga migratsiyada qo'llanadi.
