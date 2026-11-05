-- 0002_identity: foydalanuvchi, SMS kod, sessiya, idempotentlik. Global jadvallar (RLS yo'q — Z15).
-- Qaytarish: drop table idempotency_keys, refresh_tokens, otp_locks, otp_codes, users cascade.
create table users (
  id uuid primary key default gen_random_uuid(),
  phone text unique,                         -- +998XXXXXXXXX (PII: loglarda maskalanadi)
  telegram_id bigint unique,
  locale text not null default 'uz' check (locale in ('uz', 'ru')),
  is_platform_admin boolean not null default false,
  totp_secret_enc text,                      -- AES-256-GCM bilan shifrlangan
  totp_enabled boolean not null default false,
  totp_last_step bigint,                     -- qayta ishlatishdan himoya
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  constraint users_has_identity check (phone is not null or telegram_id is not null)
);

create table otp_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  failed_count integer not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index otp_codes_phone_idx on otp_codes (phone, created_at desc);

create table otp_locks (
  phone text primary key,
  locked_until timestamptz not null
);

create table refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  family_id uuid not null,
  token_hash text not null unique,
  amr text[] not null default '{}',          -- {otp} yoki {otp,totp}
  expires_at timestamptz not null,           -- 30 kun faolsizlikdan keyin; har aylanishda uzayadi
  rotated_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index refresh_tokens_family_idx on refresh_tokens (family_id);
create index refresh_tokens_user_idx on refresh_tokens (user_id);

create table idempotency_keys (
  key uuid not null,
  actor_id uuid not null,
  method text not null,
  path text not null,
  request_hash text not null,
  response_status integer,
  response_body jsonb,
  created_at timestamptz not null default now(),
  primary key (key, actor_id)
);
