-- 0006_rls: satr darajasidagi himoya va ilova roli huquqlari.
-- Qoida (Z15): tenantga tegishli jadvallar — qat'iy RLS. Global jadvallar (users, otp_*, refresh_tokens, idempotency_keys,
-- plans, plan_features, feature_flags) RLS'siz; ularga faqat server kodi murojaat qiladi. Test har yangi jadval
-- uchun RLS yoki global ro'yxatda bo'lishini talab qiladi.
-- Qaytarish: alter table ... disable row level security; drop policy ...

alter table tenants enable row level security;          alter table tenants force row level security;
alter table branches enable row level security;         alter table branches force row level security;
alter table memberships enable row level security;      alter table memberships force row level security;
alter table invites enable row level security;          alter table invites force row level security;
alter table tenant_features enable row level security;  alter table tenant_features force row level security;
alter table consents enable row level security;         alter table consents force row level security;
alter table events enable row level security;           alter table events force row level security;
alter table audit_log enable row level security;        alter table audit_log force row level security;

-- tenants: o'z do'koni yoki a'zo bo'lgan do'konlari
create policy tenants_select on tenants for select to dostavka_app using (
  id = app_tenant_id() or app_is_platform()
  or exists (select 1 from memberships m where m.tenant_id = tenants.id and m.user_id = app_user_id()));
create policy tenants_insert on tenants for insert to dostavka_app with check (id = app_tenant_id());
create policy tenants_update on tenants for update to dostavka_app
  using (id = app_tenant_id() or app_is_platform()) with check (id = app_tenant_id() or app_is_platform());

create policy branches_all on branches for all to dostavka_app
  using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());

create policy memberships_select on memberships for select to dostavka_app
  using (tenant_id = app_tenant_id() or user_id = app_user_id() or app_is_platform());
create policy memberships_insert on memberships for insert to dostavka_app with check (tenant_id = app_tenant_id());
create policy memberships_update on memberships for update to dostavka_app
  using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());

-- invites: tenant kontekstida yoki token xeshi bo'yicha (qabul qilish)
create policy invites_select on invites for select to dostavka_app
  using (tenant_id = app_tenant_id() or token_hash = app_invite_hash());
create policy invites_insert on invites for insert to dostavka_app with check (tenant_id = app_tenant_id());
create policy invites_update on invites for update to dostavka_app
  using (tenant_id = app_tenant_id() or token_hash = app_invite_hash()) with check (tenant_id = app_tenant_id());

create policy tenant_features_all on tenant_features for all to dostavka_app
  using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());

create policy consents_select on consents for select to dostavka_app
  using (user_id = app_user_id() or tenant_id = app_tenant_id() or app_is_platform());
create policy consents_insert on consents for insert to dostavka_app
  with check ((user_id = app_user_id() or app_is_platform()) and (tenant_id is null or tenant_id = app_tenant_id() or app_is_platform()));

create policy events_select on events for select to dostavka_app
  using (tenant_id = app_tenant_id() or app_is_platform());
create policy events_insert on events for insert to dostavka_app
  with check (tenant_id is null or tenant_id = app_tenant_id() or app_is_platform());
create policy events_update on events for update to dostavka_app using (app_is_platform()) with check (app_is_platform());

create policy audit_select on audit_log for select to dostavka_app
  using (tenant_id = app_tenant_id() or app_is_platform());
create policy audit_insert on audit_log for insert to dostavka_app
  with check (tenant_id is null or tenant_id = app_tenant_id() or app_is_platform());

-- Huquqlar (minimal). O'chirish: faqat zarur jadvallarda; o'zgarmas jadvallarda UPDATE/DELETE yo'q.
grant usage on schema public to dostavka_app;
grant select, insert, update, delete on users, otp_codes, otp_locks, refresh_tokens, idempotency_keys to dostavka_app;
grant select, insert, update on tenants, branches, memberships, invites, tenant_features to dostavka_app;
grant delete on tenant_features to dostavka_app;
grant select, insert, update on plans, feature_flags to dostavka_app;
grant select, insert, delete on plan_features to dostavka_app;
grant select, insert on consents, audit_log to dostavka_app;
grant select, insert on events to dostavka_app;
grant update (published_at) on events to dostavka_app;
grant usage, select on sequence audit_log_id_seq to dostavka_app;
