-- 0015_notifications: xaridorga xabarnomalar navbati (Telegram, bo'lmasa SMS). Matnda shaxsiy ma'lumot yo'q: faqat buyurtma raqami va do'kon nomi.
-- Qaytarish: drop table notifications.
create table notifications (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id),
  template text not null check (length(template) <= 60),
  params jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  channel text check (channel in ('telegram', 'sms')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text check (last_error is null or length(last_error) <= 200),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index notifications_due_idx on notifications (status, next_attempt_at) where status = 'pending';
create index notifications_user_idx on notifications (tenant_id, user_id, created_at desc);
alter table notifications enable row level security;  alter table notifications force row level security;
create policy notifications_all on notifications for all to dostavka_app using (tenant_id = app_tenant_id() or app_is_platform()) with check (tenant_id = app_tenant_id() or app_is_platform());
grant select, insert, update on notifications to dostavka_app;
grant usage, select on sequence notifications_id_seq to dostavka_app;
