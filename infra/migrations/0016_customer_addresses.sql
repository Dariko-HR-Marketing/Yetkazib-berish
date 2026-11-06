-- 0016_customer_addresses: xaridorning shu do'kondagi saqlangan yetkazish manzillari (shaxsiy ma'lumot).
-- RLS: do'kon + faqat egasi (app_user_id): do'kon xodimlari ham bu jadvalni o'qiy olmaydi. Qaytarish: drop table customer_addresses.
create table customer_addresses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  label text not null check (length(label) between 1 and 40),
  address text not null check (length(address) between 5 and 300),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index customer_addresses_user_idx on customer_addresses (tenant_id, user_id, created_at);
create unique index customer_addresses_default_uq on customer_addresses (tenant_id, user_id) where is_default;
alter table customer_addresses enable row level security;  alter table customer_addresses force row level security;
create policy customer_addresses_own on customer_addresses for all to dostavka_app
  using (tenant_id = app_tenant_id() and user_id = app_user_id())
  with check (tenant_id = app_tenant_id() and user_id = app_user_id());
grant select, insert, update, delete on customer_addresses to dostavka_app;
