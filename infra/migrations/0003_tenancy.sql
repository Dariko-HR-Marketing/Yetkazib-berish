-- 0003_tenancy: do'kon, filial, a'zolik, takliflar.
-- Z16: PostGIS S0'da yo'q; filial joylashuvi lat/lng, zona — zone_geojson (PostGIS S4'da).
-- Qaytarish: drop table invites, memberships, branches, tenants cascade.
create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tin text not null check (tin ~ '^[0-9]{9}$'),
  status text not null default 'draft' check (status in ('draft', 'active', 'suspended')),
  plan_code text not null default 'start' check (plan_code in ('start', 'biznes', 'pro', 'tarmoq')),
  plan_version integer not null default 1,
  plan_migrate_at timestamptz,               -- F-4: shu sanagacha eski paket shartlari amal qiladi
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table branches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  address text not null,
  lat double precision,
  lng double precision,
  zone_geojson jsonb,
  work_hours jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index branches_tenant_idx on branches (tenant_id);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'picker', 'cashier', 'dispatcher', 'accountant', 'marketer', 'courier')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  branch_id uuid references branches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create index memberships_user_idx on memberships (user_id);

create table invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  phone text not null,
  role text not null check (role in ('manager', 'picker', 'cashier', 'dispatcher', 'accountant', 'marketer', 'courier')),
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired')),
  invited_by uuid references users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index invites_tenant_idx on invites (tenant_id, status);
