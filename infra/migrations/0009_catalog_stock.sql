-- 0009_catalog_stock: kategoriya, mahsulot, qoldiq, qoldiq harakati (o'zgarmas), import ishlari.
-- Miqdor: butun son, mingdan bir birlikda (D2). Narx: tiyin.
-- Qaytarish: drop table import_jobs, stock_movements, stock, products, categories cascade.
create table categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name_uz text not null check (length(name_uz) between 1 and 120),
  name_ru text check (name_ru is null or length(name_ru) between 1 and 120),
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index categories_name_uk on categories (tenant_id, lower(name_uz));

create table products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,
  name_uz text not null check (length(name_uz) between 1 and 200),
  name_ru text check (name_ru is null or length(name_ru) between 1 and 200),
  sku text check (sku is null or length(sku) between 1 and 64),
  barcode text check (barcode is null or barcode ~ '^[0-9]{6,14}$'),
  mxik text check (mxik is null or mxik ~ '^[0-9]{17}$'),
  unit text not null default 'piece' check (unit in ('piece', 'kg', 'l')),
  price_tiyin bigint not null check (price_tiyin >= 0 and price_tiyin <= 100000000000),
  status text not null default 'active' check (status in ('active', 'hidden', 'archived')),
  image_url text check (image_url is null or length(image_url) <= 500),
  description_uz text check (description_uz is null or length(description_uz) <= 2000),
  description_ru text check (description_ru is null or length(description_ru) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index products_barcode_uk on products (tenant_id, barcode) where barcode is not null and status <> 'archived';
create unique index products_sku_uk on products (tenant_id, lower(sku)) where sku is not null and status <> 'archived';
create index products_list_idx on products (tenant_id, created_at, id);
create index products_category_idx on products (tenant_id, category_id);
create index products_name_idx on products (tenant_id, lower(name_uz) text_pattern_ops);

-- Tenantlararo havola bo'lmasligi uchun (FK RLS'ni chetlab o'tadi): (id, tenant_id) bo'yicha murakkab tashqi kalit.
alter table products add constraint products_id_tenant_uk unique (id, tenant_id);
alter table branches add constraint branches_id_tenant_uk unique (id, tenant_id);

create table stock (
  product_id uuid not null,
  branch_id uuid not null,
  tenant_id uuid not null references tenants(id) on delete cascade,
  foreign key (product_id, tenant_id) references products (id, tenant_id) on delete cascade,
  foreign key (branch_id, tenant_id) references branches (id, tenant_id) on delete cascade,
  quantity_milli bigint not null default 0 check (quantity_milli >= 0),
  reserved_milli bigint not null default 0 check (reserved_milli >= 0),
  out_marked boolean not null default false,       -- stop-list: «Tugadi deb belgilash»
  source text not null default 'manual' check (source in ('manual', 'import', 'pos', 'system')),
  updated_at timestamptz not null default now(),
  primary key (product_id, branch_id)
);
create index stock_tenant_idx on stock (tenant_id, branch_id);

create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  product_id uuid not null,
  branch_id uuid not null,
  foreign key (product_id, tenant_id) references products (id, tenant_id) on delete cascade,
  foreign key (branch_id, tenant_id) references branches (id, tenant_id) on delete cascade,
  delta_milli bigint not null,
  quantity_after_milli bigint not null check (quantity_after_milli >= 0),
  reason text not null check (reason in ('set', 'adjust', 'import', 'sale', 'out_marked', 'back_on_sale')),
  source text not null default 'manual',
  actor_id uuid,
  note text check (note is null or length(note) <= 200),
  created_at timestamptz not null default now()
);
create index stock_movements_idx on stock_movements (tenant_id, product_id, created_at desc);
create trigger stock_movements_immutable before update or delete on stock_movements for each row execute function forbid_mutation();

create table import_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  created_by uuid,
  format text not null check (format in ('csv', 'xlsx')),
  status text not null default 'applied' check (status in ('applied', 'failed')),
  total_rows integer not null,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  error_count integer not null default 0,
  skipped_price_jumps integer not null default 0,
  errors jsonb not null default '[]',
  duration_ms integer,
  created_at timestamptz not null default now()
);
create index import_jobs_idx on import_jobs (tenant_id, created_at desc);

-- RLS
alter table categories enable row level security;       alter table categories force row level security;
alter table products enable row level security;         alter table products force row level security;
alter table stock enable row level security;            alter table stock force row level security;
alter table stock_movements enable row level security;  alter table stock_movements force row level security;
alter table import_jobs enable row level security;      alter table import_jobs force row level security;

create policy categories_all on categories for all to dostavka_app using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
create policy products_all on products for all to dostavka_app using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
create policy stock_all on stock for all to dostavka_app using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
create policy stock_movements_select on stock_movements for select to dostavka_app using (tenant_id = app_tenant_id());
create policy stock_movements_insert on stock_movements for insert to dostavka_app with check (tenant_id = app_tenant_id());
create policy import_jobs_all on import_jobs for all to dostavka_app using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());

grant select, insert, update, delete on categories, products, stock, import_jobs to dostavka_app;
grant select, insert on stock_movements to dostavka_app;
