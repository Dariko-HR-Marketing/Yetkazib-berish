"""Ma'lumotlar sxemasi (TZ 7.4-band) va migratsiya.

DDL ikkala dialekt uchun bitta manbadan hosil qilinadi. Tipga oid farqlar `_TYPES` jadvalida.
Pilot hajmida xizmat hududlari GeoJSON ko'rinishida saqlanadi (ADR-004); PostGIS keyin qo'shiladi.
"""
from __future__ import annotations

from .db import Database

_TYPES = {
    "sqlite": {
        "ID": "TEXT", "JSON": "TEXT", "TS": "TEXT", "BOOL": "INTEGER", "MONEY": "INTEGER",
        "QTY": "INTEGER", "SERIAL": "INTEGER PRIMARY KEY AUTOINCREMENT",
    },
    "postgres": {
        "ID": "TEXT", "JSON": "JSONB", "TS": "TIMESTAMPTZ", "BOOL": "BOOLEAN", "MONEY": "BIGINT",
        "QTY": "BIGINT", "SERIAL": "BIGSERIAL PRIMARY KEY",
    },
}

# QTY — miqdor "milli" birlikda: 1 dona = 1000, 1,08 kg = 1080. MONEY — tiyinda (1 so'm = 100).
DDL = """
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at {TS} NOT NULL);

CREATE TABLE IF NOT EXISTS tenants (
    id {ID} PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
    profile TEXT NOT NULL CHECK (profile IN ('small_shop','supermarket','restaurant','non_food')),
    package TEXT NOT NULL DEFAULT 'start', brand {JSON} NOT NULL, is_active {BOOL} NOT NULL,
    created_at {TS} NOT NULL
);

CREATE TABLE IF NOT EXISTS branches (
    id {ID} PRIMARY KEY, tenant_id {ID} NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL, address TEXT NOT NULL, lat DOUBLE PRECISION NOT NULL, lon DOUBLE PRECISION NOT NULL,
    phone TEXT, working_hours {JSON} NOT NULL, manual_confirm {BOOL} NOT NULL,
    confirm_sla_sec INTEGER NOT NULL DEFAULT 300, prep_minutes INTEGER NOT NULL DEFAULT 30,
    is_active {BOOL} NOT NULL, created_at {TS} NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_branches_tenant ON branches (tenant_id);

CREATE TABLE IF NOT EXISTS users (
    id {ID} PRIMARY KEY, phone TEXT NOT NULL UNIQUE, full_name TEXT,
    password_hash TEXT, locale TEXT NOT NULL DEFAULT 'uz', created_at {TS} NOT NULL
);

CREATE TABLE IF NOT EXISTS user_roles (
    id {ID} PRIMARY KEY, user_id {ID} NOT NULL REFERENCES users(id),
    role TEXT NOT NULL CHECK (role IN ('customer','tenant_owner','branch_manager','picker',
        'dispatcher','courier','support','finance','platform_admin')),
    tenant_id {ID} REFERENCES tenants(id), branch_id {ID} REFERENCES branches(id)
);
CREATE INDEX IF NOT EXISTS ix_user_roles_user ON user_roles (user_id);

CREATE TABLE IF NOT EXISTS otp_codes (
    phone TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires_at {TS} NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS categories (
    id {ID} PRIMARY KEY, tenant_id {ID} NOT NULL REFERENCES tenants(id),
    name {JSON} NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
    id {ID} PRIMARY KEY, tenant_id {ID} NOT NULL REFERENCES tenants(id),
    category_id {ID} REFERENCES categories(id), name {JSON} NOT NULL, description {JSON},
    unit TEXT NOT NULL DEFAULT 'pcs' CHECK (unit IN ('pcs','kg','l')),
    is_weighted {BOOL} NOT NULL, is_fragile {BOOL} NOT NULL, image_url TEXT, is_active {BOOL} NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_products_tenant ON products (tenant_id, category_id);

CREATE TABLE IF NOT EXISTS product_variants (
    id {ID} PRIMARY KEY, tenant_id {ID} NOT NULL REFERENCES tenants(id),
    product_id {ID} NOT NULL REFERENCES products(id), sku TEXT NOT NULL, barcode TEXT,
    attributes {JSON} NOT NULL, weight_g INTEGER, UNIQUE (tenant_id, sku)
);

CREATE TABLE IF NOT EXISTS branch_stock (
    tenant_id {ID} NOT NULL REFERENCES tenants(id), branch_id {ID} NOT NULL REFERENCES branches(id),
    variant_id {ID} NOT NULL REFERENCES product_variants(id),
    price {MONEY} NOT NULL, available_qty {QTY} NOT NULL DEFAULT 0, reserved_qty {QTY} NOT NULL DEFAULT 0,
    is_stopped {BOOL} NOT NULL, source TEXT NOT NULL DEFAULT 'manual', synced_at {TS} NOT NULL,
    PRIMARY KEY (branch_id, variant_id),
    CHECK (reserved_qty >= 0 AND reserved_qty <= available_qty)
);

CREATE TABLE IF NOT EXISTS delivery_zones (
    id {ID} PRIMARY KEY, tenant_id {ID} NOT NULL REFERENCES tenants(id),
    branch_id {ID} NOT NULL REFERENCES branches(id), name TEXT NOT NULL,
    polygon {JSON} NOT NULL, delivery_fee {MONEY} NOT NULL, free_from {MONEY},
    min_order {MONEY} NOT NULL DEFAULT 0, priority INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS time_slots (
    id {ID} PRIMARY KEY, tenant_id {ID} NOT NULL REFERENCES tenants(id),
    branch_id {ID} NOT NULL REFERENCES branches(id), starts_at {TS} NOT NULL, ends_at {TS} NOT NULL,
    capacity INTEGER NOT NULL, booked INTEGER NOT NULL DEFAULT 0,
    CHECK (booked >= 0 AND booked <= capacity), UNIQUE (branch_id, starts_at)
);

CREATE TABLE IF NOT EXISTS orders (
    id {ID} PRIMARY KEY, number TEXT NOT NULL UNIQUE, tenant_id {ID} NOT NULL REFERENCES tenants(id),
    branch_id {ID} NOT NULL REFERENCES branches(id), customer_id {ID} REFERENCES users(id),
    customer_phone TEXT NOT NULL, address {JSON} NOT NULL, slot_id {ID} REFERENCES time_slots(id),
    status TEXT NOT NULL, payment_status TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
    channel TEXT NOT NULL DEFAULT 'web', utm {JSON},
    payment_method TEXT NOT NULL CHECK (payment_method IN ('online','cash_on_delivery','card_on_delivery')),
    substitution_rule TEXT NOT NULL, consent_increase_pct INTEGER NOT NULL,
    subtotal {MONEY} NOT NULL, delivery_fee {MONEY} NOT NULL, discount {MONEY} NOT NULL DEFAULT 0,
    total {MONEY} NOT NULL, final_total {MONEY}, approval_requested_at {TS},
    reserve_expires_at {TS}, comment TEXT, cancel_reason TEXT,
    tracking_token TEXT NOT NULL UNIQUE, tracking_expires_at {TS} NOT NULL,
    rating INTEGER, created_at {TS} NOT NULL, updated_at {TS} NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_orders_branch ON orders (tenant_id, branch_id, status, created_at);

CREATE TABLE IF NOT EXISTS order_items (
    id {ID} PRIMARY KEY, tenant_id {ID} NOT NULL REFERENCES tenants(id),
    order_id {ID} NOT NULL REFERENCES orders(id), line_no INTEGER NOT NULL,
    variant_id {ID} NOT NULL REFERENCES product_variants(id),
    name {JSON} NOT NULL, unit TEXT NOT NULL, is_weighted {BOOL} NOT NULL,
    unit_price {MONEY} NOT NULL, requested_qty {QTY} NOT NULL, actual_qty {QTY},
    substitution_rule TEXT, substituted_by {ID}, status TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS ix_order_items_order ON order_items (order_id);

CREATE TABLE IF NOT EXISTS order_status_history (
    id {SERIAL}, order_id {ID} NOT NULL REFERENCES orders(id), from_status TEXT, to_status TEXT NOT NULL,
    actor_id {ID}, reason TEXT, created_at {TS} NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
    id {ID} PRIMARY KEY, tenant_id {ID} NOT NULL REFERENCES tenants(id),
    order_id {ID} NOT NULL REFERENCES orders(id), provider TEXT NOT NULL, external_txn_id TEXT,
    amount {MONEY} NOT NULL, status TEXT NOT NULL, created_at {TS} NOT NULL, paid_at {TS},
    UNIQUE (provider, external_txn_id)
);

CREATE TABLE IF NOT EXISTS refunds (
    id {ID} PRIMARY KEY, tenant_id {ID} NOT NULL REFERENCES tenants(id),
    order_id {ID} NOT NULL REFERENCES orders(id), payment_id {ID} REFERENCES payments(id),
    amount {MONEY} NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL,
    requested_by {ID}, approved_by {ID}, created_at {TS} NOT NULL
);

CREATE TABLE IF NOT EXISTS shipments (
    id {ID} PRIMARY KEY, tenant_id {ID} NOT NULL REFERENCES tenants(id),
    order_id {ID} NOT NULL UNIQUE REFERENCES orders(id), courier_id {ID} REFERENCES users(id),
    provider TEXT NOT NULL DEFAULT 'own', vehicle_type TEXT, status TEXT NOT NULL,
    pod_type TEXT, pod_url TEXT, failure_reason TEXT,
    contact_attempts INTEGER NOT NULL DEFAULT 0, eta {TS}, created_at {TS} NOT NULL, updated_at {TS} NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_shipments_courier ON shipments (courier_id, status);

CREATE TABLE IF NOT EXISTS tickets (
    id {ID} PRIMARY KEY, tenant_id {ID} NOT NULL REFERENCES tenants(id),
    order_id {ID} NOT NULL REFERENCES orders(id), order_item_id {ID} REFERENCES order_items(id),
    type TEXT NOT NULL, message TEXT, attachments {JSON} NOT NULL, status TEXT NOT NULL DEFAULT 'open',
    assignee_id {ID}, first_response_at {TS}, resolved_at {TS}, created_at {TS} NOT NULL
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
    key TEXT NOT NULL, scope TEXT NOT NULL, request_hash TEXT NOT NULL,
    response_code INTEGER NOT NULL, response_body {JSON} NOT NULL, created_at {TS} NOT NULL,
    PRIMARY KEY (scope, key)
);

CREATE TABLE IF NOT EXISTS outbox_events (
    id {SERIAL}, tenant_id {ID}, aggregate_type TEXT NOT NULL, aggregate_id {ID} NOT NULL,
    event_type TEXT NOT NULL, payload {JSON} NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at {TS} NOT NULL, sent_at {TS}, dead_lettered_at {TS}, last_error TEXT, created_at {TS} NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_outbox_pending ON outbox_events (next_attempt_at);

CREATE TABLE IF NOT EXISTS inbound_webhooks (
    id {SERIAL}, provider TEXT NOT NULL, external_event_id TEXT NOT NULL, payload {JSON} NOT NULL,
    received_at {TS} NOT NULL, UNIQUE (provider, external_event_id)
);

CREATE TABLE IF NOT EXISTS message_log (
    id {SERIAL}, channel TEXT NOT NULL, recipient TEXT NOT NULL, template TEXT NOT NULL,
    body TEXT NOT NULL, created_at {TS} NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
    id {SERIAL}, tenant_id {ID}, actor_id {ID}, entity TEXT NOT NULL, entity_id TEXT NOT NULL,
    action TEXT NOT NULL, old_value {JSON}, new_value {JSON}, request_id TEXT, created_at {TS} NOT NULL
);
"""

SCHEMA_VERSION = 1


def render(dialect: str) -> str:
    return DDL.format(**_TYPES[dialect])


def migrate(database: Database) -> None:
    statements = [s.strip() for s in render(database.dialect).split(";") if s.strip()]
    with database.tx() as c:
        for stmt in statements:
            c.execute(stmt)
        if not c.scalar("SELECT version FROM schema_version WHERE version = :v", {"v": SCHEMA_VERSION}):
            from .db import iso

            c.execute("INSERT INTO schema_version (version, applied_at) VALUES (:v, :t)",
                      {"v": SCHEMA_VERSION, "t": iso()})
