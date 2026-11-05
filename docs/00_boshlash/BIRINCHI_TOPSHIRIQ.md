# Claude Code uchun birinchi topshiriq (S0)

Quyidagi matnni Claude Code'ga birinchi xabar sifatida bering. Bundan oldin arxivni repo ichidagi `docs/` papkasiga, `CLAUDE.md` ni esa repo ildiziga joylashtiring.

---

**Prompt:**

> `CLAUDE.md` va `docs/00_boshlash/QARORLAR.md` ni o'qi. Keyin `docs/01_prd/03_S0_spetsifikatsiya_va_hodisalar.md` va `docs/01_prd/02_Texnik_spetsifikatsiya.md` asosida S0 sprintini boshla.
>
> Avval reja tuz va menga ko'rsat: repo tuzilmasi, paketlar, birinchi migratsiyalar, OpenAPI fayllari, test ro'yxati (I-1…A-3, 21 ta qabul mezoni). Rejani tasdiqlaganimdan keyin quyidagi tartibda ishla:
>
> 1. Monorepo: pnpm + Turborepo, `apps/web`, `apps/api`, `packages/{ui,contracts,config,i18n}`, `infra/docker-compose.yml` (Postgres 16 + PostGIS, Redis), `.env.example`, GitHub Actions (typecheck, lint, test).
> 2. `packages/contracts`: S0 endpointlari uchun OpenAPI 3.1 (auth, tenants, branches, invites, members, features, admin/plans) va xato formati `{code, message_uz, message_ru, details}`.
> 3. DB migratsiyalari: tenants, branches, users, memberships, plans, plan_features, tenant_features, consents, events, audit_log — har jadvalda tenant_id va RLS. Seed: `docs/05_spetsifikatsiya_json/plans.json` va `feature_flags.json` dan.
> 4. Testlar avval (Vitest): 21 ta qabul mezoni, RLS izolyatsiya testi (2 do'kon), `can()` jadval testi (8 holat).
> 5. NestJS modullari: identity (SMS OTP mock, Telegram initData tekshiruvi, refresh rotation, 2FA egasi/buxgalter/admin uchun), tenancy (RBAC: `roles_permissions.json`), plans-flags (`can()` + Redis 60 s kesh + F-5 bog'liqlik qoidasi), audit-events (`events.json` sxemasi bilan tekshirish).
> 6. `apps/web`: kirish (telefon + SMS, Telegram), do'kon yaratish, xodim taklif qilish, "Paket va funksiyalar" ekrani — prototip: `docs/04_prototip/skrinshotlar/Owner-Plan.png`, `Onboard-Shop.png`, `Owner-Team.png`. uz/ru, 360/768/1024/1440.
> 7. Har qadamdan keyin testlarni ishga tushir. Oxirida qisqa hisobot ber: nima tayyor, qaysi mezon o'tdi, nima inson ko'rib chiqishini talab qiladi (identity va ruxsatlar — majburiy).
>
> Qoidalar: pul va vaqt qoidalari, RLS, idempotentlik, shaxsiy ma'lumotni loglamaslik — `CLAUDE.md` 3-bo'lim. Ziddiyat topsang — to'xta va so'ra.

---

## S0 tugaganini qanday tekshirasiz

- [ ] `pnpm test` — hammasi yashil, 21 ta qabul mezoni testi bor
- [ ] Ikki do'kon yaratib, biri ikkinchisining ma'lumotini ko'ra olmasligini tekshirish (404)
- [ ] Paketni Start → Biznes o'zgartirganda "Umumiy katalog" kaliti qulfdan chiqadi
- [ ] Naqdni yoqib, o'z kuryerlarini o'chirishga urinish — rad etiladi
- [ ] SMS kodni 5 marta xato kiritish → 15 daqiqa blok
- [ ] Ekranlar telefonda va Telegram ichida ochiladi, uz/ru almashadi
- [ ] Texnik mas'ul identity va ruxsat kodini ko'rib chiqdi

Keyingi: S1 — katalog, qoldiq, Excel import, MXIK. S1 spetsifikatsiya paketi S0 tugashi bilan tayyorlanadi.
