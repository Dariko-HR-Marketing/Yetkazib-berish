-- 0012_delivery_loyalty: yetkazish sozlamalari (narx, bepul chegara, minimal buyurtma) va ball ledgeri (o'zgarmas).
-- Qaytarish: drop table loyalty_balances, ledger_entries, delivery_settings; orders ustunlarini olib tashlash.
create table delivery_settings (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  fee_tiyin bigint not null default 0 check (fee_tiyin >= 0 and fee_tiyin <= 100000000),
  free_from_tiyin bigint check (free_from_tiyin is null or free_from_tiyin >= 0),
  min_order_tiyin bigint not null default 0 check (min_order_tiyin >= 0),
  updated_at timestamptz not null default now()
);

alter table orders add column discount_tiyin bigint not null default 0 check (discount_tiyin >= 0);
alter table orders add column points_spent bigint not null default 0 check (points_spent >= 0);
alter table orders drop constraint orders_check1;
alter table orders add constraint orders_total_check check (total_tiyin = subtotal_tiyin + delivery_fee_tiyin - discount_tiyin and discount_tiyin <= subtotal_tiyin);

-- Ball ledgeri: faqat qo'shiladi. points > 0 — hisoblash/qaytarish, < 0 — sarflash/muddati o'tishi.
create table ledger_entries (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id),
  kind text not null check (kind in ('accrual', 'spend', 'reversal', 'expire')),
  points bigint not null check (points <> 0),
  order_id uuid,
  available_at timestamptz not null default now(),   -- accrual: ushlab turish (24 soat) tugagach sarflash mumkin
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (order_id, tenant_id) references orders (id, tenant_id)
);
create index ledger_user_idx on ledger_entries (tenant_id, user_id, id);
create unique index ledger_accrual_once on ledger_entries (tenant_id, order_id) where kind = 'accrual';
create trigger ledger_entries_immutable before update or delete on ledger_entries for each row execute function forbid_mutation();
create trigger ledger_entries_no_truncate before truncate on ledger_entries for each statement execute function forbid_mutation();

-- Tez o'qish uchun balans (har yozuv bilan bitta tranzaksiyada yangilanadi); har kuni ledger bilan solishtiriladi.
create table loyalty_balances (
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id),
  balance_points bigint not null default 0 check (balance_points >= 0),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

alter table delivery_settings enable row level security;  alter table delivery_settings force row level security;
alter table ledger_entries enable row level security;     alter table ledger_entries force row level security;
alter table loyalty_balances enable row level security;   alter table loyalty_balances force row level security;
create policy delivery_settings_all on delivery_settings for all to dostavka_app using (tenant_id = app_tenant_id() or app_is_platform()) with check (tenant_id = app_tenant_id());
create policy ledger_entries_select on ledger_entries for select to dostavka_app using (tenant_id = app_tenant_id() or app_is_platform());
create policy ledger_entries_insert on ledger_entries for insert to dostavka_app with check (tenant_id = app_tenant_id());
create policy loyalty_balances_all on loyalty_balances for all to dostavka_app using (tenant_id = app_tenant_id() or app_is_platform()) with check (tenant_id = app_tenant_id());
grant select, insert, update on delivery_settings to dostavka_app;
grant select, insert on ledger_entries to dostavka_app;
grant select, insert, update on loyalty_balances to dostavka_app;
grant usage, select on sequence ledger_entries_id_seq to dostavka_app;
