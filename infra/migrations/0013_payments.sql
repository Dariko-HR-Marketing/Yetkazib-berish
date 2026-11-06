-- 0013_payments: onlayn to'lov holati (pul do'konning merchant hisobiga to'g'ridan-to'g'ri tushadi; platforma faqat webhook orqali holatni ko'radi).
-- Qaytarish: drop table payment_webhook_events, payments, tenant_payment_settings cascade; orders.payment_type cheklovini qaytarish.
alter table orders drop constraint orders_payment_type_check;
alter table orders add constraint orders_payment_type_check check (payment_type in ('cash', 'online'));

create table tenant_payment_settings (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  provider text not null check (provider in ('mock', 'payme', 'click', 'uzum')),
  merchant_id text check (merchant_id is null or length(merchant_id) <= 100),
  secret_enc text,                                   -- webhook imzo kaliti, AES-256-GCM (API'dan qaytmaydi)
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  order_id uuid not null,
  provider text not null check (provider in ('mock', 'payme', 'click', 'uzum')),
  status text not null default 'pending' check (status in ('pending', 'authorized', 'captured', 'failed', 'cancelled')),
  amount_tiyin bigint not null check (amount_tiyin > 0),
  refunded_tiyin bigint not null default 0 check (refunded_tiyin >= 0 and refunded_tiyin <= amount_tiyin),
  failure_reason text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (order_id, tenant_id) references orders (id, tenant_id) on delete cascade
);
create unique index payments_order_active_uk on payments (tenant_id, order_id) where status in ('pending', 'authorized', 'captured');
create index payments_expiry_idx on payments (status, expires_at);

-- Kiruvchi webhooklar jurnali: (provider, event_id) bo'yicha takror ishlov berilmaydi.
create table payment_webhook_events (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider text not null,
  event_id text not null check (length(event_id) <= 100),
  payment_id uuid,
  type text not null,
  payload_sha256 text not null,
  outcome text not null,
  received_at timestamptz not null default now(),
  unique (tenant_id, provider, event_id)
);

alter table tenant_payment_settings enable row level security;  alter table tenant_payment_settings force row level security;
alter table payments enable row level security;                 alter table payments force row level security;
alter table payment_webhook_events enable row level security;   alter table payment_webhook_events force row level security;
create policy tps_all on tenant_payment_settings for all to dostavka_app using (tenant_id = app_tenant_id() or app_is_platform()) with check (tenant_id = app_tenant_id());
create policy payments_all on payments for all to dostavka_app using (tenant_id = app_tenant_id() or app_is_platform()) with check (tenant_id = app_tenant_id());
create policy pwe_all on payment_webhook_events for all to dostavka_app using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update on tenant_payment_settings, payments to dostavka_app;
grant select, insert on payment_webhook_events to dostavka_app;
grant update (outcome) on payment_webhook_events to dostavka_app;
grant usage, select on sequence payment_webhook_events_id_seq to dostavka_app;
