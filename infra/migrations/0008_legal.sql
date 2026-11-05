-- 0008_legal: hujjat versiyalari (oferta, maxfiylik siyosati, DPA, kuryer shartnomasi). Global jadval (RLS yo'q — Z15).
-- Matn (body_md, text_hash) yozilgach o'zgarmaydi: o'zgarish = yangi versiya. Holat: draft -> effective -> retired.
-- Qaytarish: drop table legal_documents cascade.
create table legal_documents (
  id uuid primary key default gen_random_uuid(),
  key text not null check (key in ('customer_offer', 'privacy_policy', 'shop_saas_offer', 'shop_dpa', 'courier_agreement')),
  locale text not null check (locale in ('uz', 'ru')),
  version integer not null check (version > 0),
  title text not null,
  audience text not null check (audience in ('customer', 'shop', 'courier')),
  body_md text not null,
  text_hash text not null check (text_hash ~ '^[0-9a-f]{64}$'),   -- sha256(body_md); consents.text_hash shuni saqlaydi
  status text not null default 'draft' check (status in ('draft', 'effective', 'retired')),
  effective_from timestamptz,
  published_by uuid,                       -- FK yo'q: audit_log ham actor_id ni shunday saqlaydi (foydalanuvchi o'chsa ham tarix qoladi)
  created_at timestamptz not null default now(),
  unique (key, locale, version),
  check ((status = 'draft') = (effective_from is null))
);
create index legal_documents_lookup on legal_documents (key, locale, status, version desc);
-- Bir hujjat/tilning faqat bitta amaldagi (effective) versiyasi bo'lishi mumkin
create unique index legal_one_effective on legal_documents (key, locale) where status = 'effective';

create or replace function legal_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'legal_documents o''chirilmaydi' using errcode = 'insufficient_privilege';
  end if;
  if (new.key, new.locale, new.version, new.title, new.audience, new.body_md, new.text_hash)
     is distinct from (old.key, old.locale, old.version, old.title, old.audience, old.body_md, old.text_hash) then
    raise exception 'hujjat matni o''zgarmas: yangi versiya yarating' using errcode = 'insufficient_privilege';
  end if;
  if old.status = 'retired' and new.status <> 'retired' then
    raise exception 'eskirgan versiya qayta tiklanmaydi' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger legal_documents_guard before update or delete on legal_documents for each row execute function legal_guard();

grant select, insert, update on legal_documents to dostavka_app;
