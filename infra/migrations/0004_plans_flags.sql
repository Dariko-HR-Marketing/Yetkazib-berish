-- 0004_plans_flags: paketlar (versiyali), funksiya kalitlari, do'kon darajasidagi holat. plans/plan_features/feature_flags — global.
-- Qaytarish: drop table tenant_features, plan_features, feature_flags, plans cascade.
create table plans (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code in ('start', 'biznes', 'pro', 'tarmoq')),
  version integer not null,
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  price_tiyin bigint check (price_tiyin is null or price_tiyin >= 0),   -- NULL = kelishuv; narx konfiguratsiyadan (plans.json)
  limits jsonb not null default '{}',        -- {orders_month, branches, staff, integrations}; null = cheksiz
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (code, version)
);

create table feature_flags (
  key text primary key,
  description text not null,
  min_plan text not null,                    -- start|biznes|pro|tarmoq|v2
  default_on_for_shop boolean not null default true,
  toggled_by text not null default 'owner',
  requires text[] not null default '{}',
  platform_enabled boolean not null default true,   -- F-1: avariya o'chirgichi
  updated_at timestamptz not null default now()
);

create table plan_features (
  plan_id uuid not null references plans(id) on delete cascade,
  feature_key text not null references feature_flags(key) on delete cascade,
  primary key (plan_id, feature_key)
);

create table tenant_features (
  tenant_id uuid not null references tenants(id) on delete cascade,
  feature_key text not null references feature_flags(key) on delete cascade,
  enabled boolean not null,
  changed_by uuid references users(id) on delete set null,
  changed_at timestamptz not null default now(),
  primary key (tenant_id, feature_key)
);
