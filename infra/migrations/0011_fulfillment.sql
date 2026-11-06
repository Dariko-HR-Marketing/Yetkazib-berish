-- 0011_fulfillment: yig'ish, kuryerga biriktirish, yetkazish, kuryer joylashuvi.
-- Qaytarish: drop table courier_locations, deliveries cascade; order_items/orders ustun va cheklovlarini qaytarish.
alter table orders drop constraint orders_status_check;
alter table orders add constraint orders_status_check check (status in ('placed', 'accepted', 'picking', 'ready', 'delivering', 'completed', 'cancelled', 'failed'));
alter table orders add column picked_at timestamptz;
alter table orders add column delivered_at timestamptz;

alter table order_items add column pick_status text not null default 'pending' check (pick_status in ('pending', 'picked', 'missing'));
alter table order_items add column picked_milli bigint check (picked_milli is null or picked_milli >= 0);
-- hozir band qilingan miqdor (buyurtmada = quantity; yig'ishdan keyin = yig'ilgani). Bajarilganda qoldiqdan shu ayriladi.
alter table order_items add column reserved_milli bigint;
update order_items set reserved_milli = quantity_milli where reserved_milli is null;
alter table order_items alter column reserved_milli set not null;
alter table order_items alter column reserved_milli set default 0;
alter table order_items add constraint order_items_id_tenant_uk unique (id, tenant_id);
grant update on order_items to dostavka_app;

create table deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  order_id uuid not null,
  courier_user_id uuid not null references users(id),
  status text not null default 'assigned' check (status in ('assigned', 'picked_up', 'delivered', 'failed')),
  assigned_by uuid references users(id),
  assigned_at timestamptz not null default now(),
  picked_up_at timestamptz,
  delivered_at timestamptz,
  failed_reason text,
  cash_collected_tiyin bigint check (cash_collected_tiyin is null or cash_collected_tiyin >= 0),
  updated_at timestamptz not null default now(),
  foreign key (order_id, tenant_id) references orders (id, tenant_id) on delete cascade,
  unique (order_id)
);
create index deliveries_courier_idx on deliveries (tenant_id, courier_user_id, status);

create table courier_locations (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  courier_user_id uuid not null references users(id),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy_m integer check (accuracy_m is null or accuracy_m >= 0),
  at timestamptz not null default now()
);
create index courier_locations_idx on courier_locations (tenant_id, courier_user_id, at desc);

alter table deliveries enable row level security;          alter table deliveries force row level security;
alter table courier_locations enable row level security;   alter table courier_locations force row level security;
create policy deliveries_all on deliveries for all to dostavka_app using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
create policy courier_locations_all on courier_locations for all to dostavka_app using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update on deliveries to dostavka_app;
grant select, insert on courier_locations to dostavka_app;
grant usage, select on sequence courier_locations_id_seq to dostavka_app;
