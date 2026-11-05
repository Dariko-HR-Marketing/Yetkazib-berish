-- 0005: rozilik, hodisa (outbox), audit — o'zgarmas (faqat qo'shiladi). tenant_id NULL bo'lishi mumkin (Z15).
-- Qaytarish: drop table audit_log, events, consents cascade.
create table consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  tenant_id uuid references tenants(id) on delete set null,
  document text not null,                    -- customer_offer | privacy_policy | marketing
  version text not null,
  action text not null check (action in ('accepted', 'revoked')),
  channel text not null,                     -- sms | telegram | panel
  ip inet,
  text_hash text not null,
  created_at timestamptz not null default now()
);
create index consents_user_idx on consents (user_id, document, created_at desc);

create table events (
  id uuid primary key default gen_random_uuid(),   -- event_id
  name text not null,
  ts timestamptz not null default now(),
  tenant_id uuid references tenants(id) on delete set null,
  actor_id uuid,
  source text not null check (source in ('vitrina', 'katalog', 'telegram', 'agent', 'panel', 'kuryer')),
  properties jsonb not null default '{}',    -- PII yo'q: faqat ID va xeshlar (A-3)
  published_at timestamptz                   -- outbox: navbatga yuborilgan vaqt
);
create index events_unpublished_idx on events (ts) where published_at is null;
create index events_tenant_idx on events (tenant_id, name, ts desc);

create table audit_log (
  id bigserial primary key,
  tenant_id uuid references tenants(id) on delete set null,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text not null,
  before jsonb,
  after jsonb,
  ip inet,
  request_id text,
  created_at timestamptz not null default now()
);
create index audit_tenant_idx on audit_log (tenant_id, created_at desc);

create or replace function forbid_mutation() returns trigger language plpgsql as $$
begin
  raise exception '% jadvali o''zgarmas (faqat qo''shiladi)', tg_table_name using errcode = 'insufficient_privilege';
end $$;

create trigger consents_immutable before update or delete on consents for each row execute function forbid_mutation();
create trigger audit_log_immutable before update or delete on audit_log for each row execute function forbid_mutation();
create trigger audit_log_no_truncate before truncate on audit_log for each statement execute function forbid_mutation();

-- events: faqat published_at belgilanishi mumkin
create or replace function events_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'events jadvali o''zgarmas' using errcode = 'insufficient_privilege';
  end if;
  if (new.id, new.name, new.ts, new.tenant_id, new.actor_id, new.source, new.properties)
     is distinct from (old.id, old.name, old.ts, old.tenant_id, old.actor_id, old.source, old.properties) then
    raise exception 'events jadvali o''zgarmas (faqat published_at)' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger events_guard_trg before update or delete on events for each row execute function events_guard();
