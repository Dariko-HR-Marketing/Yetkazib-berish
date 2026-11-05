-- 0001_base: kengaytmalar, ilova roli, kontekst funksiyalari
-- Qaytarish rejasi: faqat bo'sh bazada (drop extension/role). Production'da oldinga yangi migratsiya bilan tuzatiladi.
create extension if not exists pgcrypto;
create extension if not exists citext;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'dostavka_app') then
    -- LOGIN va parol migratsiya CLI'sida APP_DB_PASSWORD bilan o'rnatiladi. BYPASSRLS yo'q — RLS ilovaga ham amal qiladi.
    create role dostavka_app nologin noinherit nosuperuser nobypassrls;
  end if;
end $$;

-- So'rov konteksti: ilova har tranzaksiyada SET LOCAL qiladi (set_config(..., true)).
create or replace function app_tenant_id() returns uuid language sql stable as
  $$ select nullif(current_setting('app.tenant_id', true), '')::uuid $$;
create or replace function app_user_id() returns uuid language sql stable as
  $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;
-- Platforma konteksti faqat server kodi (admin guard, worker) tomonidan o'rnatiladi; foydalanuvchi SQL yubora olmaydi.
create or replace function app_is_platform() returns boolean language sql stable as
  $$ select coalesce(nullif(current_setting('app.platform', true), ''), 'off') = 'on' $$;
create or replace function app_invite_hash() returns text language sql stable as
  $$ select nullif(current_setting('app.invite_token_hash', true), '') $$;

grant execute on function app_tenant_id(), app_user_id(), app_is_platform(), app_invite_hash() to dostavka_app;
