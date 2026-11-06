-- 0010_storefront_orders: vitrina havolasi (slug), buyurtmalar, buyurtma qatorlari, holat tarixi (o'zgarmas).
-- Qaytarish: drop table order_status_history, order_items, orders cascade; alter table tenants drop column slug.
alter table tenants add column slug text;
update tenants set slug = 'd-' || substr(replace(id::text, '-', ''), 1, 8) where slug is null;
alter table tenants alter column slug set not null;
alter table tenants add constraint tenants_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$');
create unique index tenants_slug_uk on tenants (slug);

create sequence orders_number_seq start 1000;

create table orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  number bigint not null default nextval('orders_number_seq'),
  branch_id uuid not null,
  customer_id uuid not null references users(id),
  status text not null default 'placed' check (status in ('placed', 'accepted', 'completed', 'cancelled')),
  fulfillment text not null check (fulfillment in ('delivery', 'pickup')),
  payment_type text not null default 'cash' check (payment_type in ('cash')),   -- S3'da onlayn to'lovlar qo'shiladi
  channel text not null default 'vitrina' check (channel in ('vitrina', 'telegram')),
  subtotal_tiyin bigint not null check (subtotal_tiyin >= 0),
  delivery_fee_tiyin bigint not null default 0 check (delivery_fee_tiyin >= 0),
  total_tiyin bigint not null check (total_tiyin >= 0),
  delivery_address text check (delivery_address is null or length(delivery_address) <= 300),
  customer_phone text,                       -- PII: loglarda va hodisalarda yo'q; panelda maskalanadi
  note text check (note is null or length(note) <= 300),
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (branch_id, tenant_id) references branches (id, tenant_id),
  check ((fulfillment = 'delivery' and delivery_address is not null) or fulfillment = 'pickup'),
  check (total_tiyin = subtotal_tiyin + delivery_fee_tiyin)
);
alter table orders add constraint orders_id_tenant_uk unique (id, tenant_id);
create index orders_tenant_idx on orders (tenant_id, created_at desc, id);
create index orders_customer_idx on orders (tenant_id, customer_id, created_at desc);
create index orders_status_idx on orders (tenant_id, status);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  tenant_id uuid not null,
  product_id uuid not null,
  name_uz text not null,
  name_ru text,
  unit text not null,
  quantity_milli bigint not null check (quantity_milli > 0),
  price_tiyin bigint not null check (price_tiyin >= 0),
  line_total_tiyin bigint not null check (line_total_tiyin >= 0),
  foreign key (order_id, tenant_id) references orders (id, tenant_id) on delete cascade,
  foreign key (product_id, tenant_id) references products (id, tenant_id)
);
create index order_items_order_idx on order_items (order_id);

create table order_status_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  order_id uuid not null,
  from_status text,
  to_status text not null,
  actor_id uuid,
  created_at timestamptz not null default now(),
  foreign key (order_id, tenant_id) references orders (id, tenant_id) on delete cascade
);
create index order_status_history_idx on order_status_history (order_id, created_at);
create trigger order_status_history_immutable before update or delete on order_status_history for each row execute function forbid_mutation();

alter table orders enable row level security;                 alter table orders force row level security;
alter table order_items enable row level security;            alter table order_items force row level security;
alter table order_status_history enable row level security;   alter table order_status_history force row level security;
create policy orders_all on orders for all to dostavka_app using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
create policy order_items_all on order_items for all to dostavka_app using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
create policy order_status_history_select on order_status_history for select to dostavka_app using (tenant_id = app_tenant_id());
create policy order_status_history_insert on order_status_history for insert to dostavka_app with check (tenant_id = app_tenant_id());
grant select, insert, update on orders to dostavka_app;
grant select, insert on order_items, order_status_history to dostavka_app;
grant usage on sequence orders_number_seq to dostavka_app;
