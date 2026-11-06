-- 0014_cash: kuryer naqdi topshirish (kassa). Balans = yetkazilgan buyurtmalardan olingan naqd − topshirilgan.
-- Qaytarish: drop table cash_handovers.
create table cash_handovers (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  courier_user_id uuid not null references users(id),
  amount_tiyin bigint not null check (amount_tiyin > 0),
  received_by uuid references users(id),
  note text check (note is null or length(note) <= 200),
  created_at timestamptz not null default now()
);
create index cash_handovers_idx on cash_handovers (tenant_id, courier_user_id, created_at desc);
create trigger cash_handovers_immutable before update or delete on cash_handovers for each row execute function forbid_mutation();
alter table cash_handovers enable row level security;  alter table cash_handovers force row level security;
create policy cash_handovers_select on cash_handovers for select to dostavka_app using (tenant_id = app_tenant_id());
create policy cash_handovers_insert on cash_handovers for insert to dostavka_app with check (tenant_id = app_tenant_id());
grant select, insert on cash_handovers to dostavka_app;
grant usage, select on sequence cash_handovers_id_seq to dostavka_app;
