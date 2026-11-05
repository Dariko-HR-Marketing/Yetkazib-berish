# S0 sprint rejasi (tasdiq uchun) — 2026-11-05

Manba: `CLAUDE.md`, `QARORLAR.md`, `01_prd/03_S0_spetsifikatsiya_va_hodisalar.md`, `01_prd/02_Texnik_spetsifikatsiya.md`, `05_spetsifikatsiya_json/*`.
**Holat:** reja. Kod yozilmagan. Avval `ZIDDIYATLAR_VA_OCHIQ_SAVOLLAR.md` §C (Z13–Z21) ga javob kerak.

## 1. Repo tuzilmasi

```
apps/web  apps/api            (apps/courier — S4 dan, S0 da yo'q)
packages/{ui,contracts,config,i18n}
infra/{docker-compose.yml, migrations/, seed/{plans.json,feature_flags.json}}
docs/  .env.example  .github/workflows/ci.yml  turbo.json  pnpm-workspace.yaml
```
Eski Django kodi — Z13 qaroriga ko'ra (tavsiya: `docs/99_arxiv_eski/django-mvp-2026-11-04/`).

## 2. Paketlar
| Paket | S0 mazmuni |
| --- | --- |
| `packages/config` | tsconfig, eslint (flat), prettier |
| `packages/contracts` | OpenAPI 3.1 (`auth`, `tenancy`, `plans-flags`, `admin`), umumiy xato sxemasi `{code,message_uz,message_ru,details}`, `openapi-typescript` bilan turlar + kichik fetch klient; sxema lint (spectral) |
| `packages/i18n` | uz/ru ICU xabarlar (xato kodlari + S0 ekranlari), kalit-paritet testi (uz va ru kalitlari teng) |
| `packages/ui` | `design_tokens.json` dan Tailwind preset/CSS o'zgaruvchilar; Button, Input, Field, Card, Badge, LockBadge, Modal, Toast, EmptyState, Skeleton (≥44 px, matn ≥14 px) |
| `apps/api` (NestJS) | modullar: `identity`, `tenancy`, `plans-flags`, `audit-events`; umumiy: idempotentlik interceptor, xato filtri, so'rov ID, PII-maskalovchi logger, tenant konteksti (`SET LOCAL app.tenant_id`) |
| `apps/web` (Next.js App Router) | kirish (telefon+SMS, Telegram initData), do'kon yaratish, xodim taklifi, «Paket va funksiyalar»; uz/ru; 360/768/1024/1440 |

## 3. Migratsiyalar (faqat oldinga; har biri uchun qaytarish rejasi izohda)
`0001_extensions` (pgcrypto, citext; PostGIS — Z16) · `0002_identity` (`users`, `otp_requests`, `sessions`/`refresh_tokens`, `totp_secrets`) · `0003_tenancy` (`tenants`, `branches`, `memberships`, `invites`) · `0004_plans_flags` (`plans`, `plan_features`, `tenant_features`) · `0005_consents_events_audit` (`consents`, `events`, `audit_log` — o'zgarmas: UPDATE/DELETE trigger bilan taqiqlanadi) · `0006_rls` (siyosatlar — Z15) · seed: `plans.json`, `feature_flags.json` dan (narxlar tiyinda, kodda emas).

## 4. OpenAPI fayllari
`auth.yaml` (otp/request, otp/verify, telegram, refresh, logout, me) · `tenancy.yaml` (tenants, branches, invites, invites/{token}/accept, members) · `features.yaml` (GET/PATCH features, admin/plans, publish) · `common.yaml` (Error, Idempotency-Key, pagination).

## 5. Testlar (avval yoziladi — Vitest, haqiqiy PostgreSQL + Redis; SMS/Telegram — mock)
**21 ta qabul mezoni (1 mezon = ≥1 test):**
- identity: I-1 (kod 6 xona/5 daq/60 s limit), I-2 (5 xato → 15 daq blok + `auth.otp_locked`), I-3 (initData imzo + 24 soat), I-4 (rozilik → `consents`), I-5 (egasi/buxgalter/admin → 2FA), I-6 (access 15 daq, refresh rotation, 30 kun faolsizlik)
- tenancy: T-1 (tenant qoralama, egasi, Start), T-2 (STIR 9 raqam, `validation.tin_invalid` uz/ru), T-3 (taklif 72 soat), T-4 (B ma'lumoti → 404), T-5 (`plan.limit_reached`), T-6 (rol o'zgarishi darhol + audit)
- plans-flags: F-1 … F-6
- audit-events: A-1 (audit o'zgarmas), A-2 (hodisa sxemasi `events.json` bilan; mos kelmasa rad), A-3 (PII hodisada yo'q)

**Qo'shimcha:** RLS izolyatsiya (2 do'kon × har tenant jadvali: o'qish/yozish/o'chirish → rad); `can()` jadval testi 3 qatlam × yoq/o'chiq = 8 holat + bog'liqlik (`requires`); `roles_permissions.json` ↔ RBAC mosligi (8 rol × 12 soha); Idempotency-Key takrori; xato formati; i18n paritet; PII loglarda yo'q; shartnoma testlari (har endpoint OpenAPI bo'yicha); Playwright: kirish → do'kon → taklif → paket ekrani (4 kenglik, uz/ru).

## 6. Ish tartibi
1. Monorepo, CI (typecheck, lint, test, audit zaifliklar), `infra/docker-compose.yml`, `.env.example`
2. `contracts` (OpenAPI) → xato formati
3. Migratsiyalar + RLS + seed → RLS va `can()` testlari (qizil)
4. Testlar (21 + qo'shimcha) qizil holatda
5. Modullar: audit-events → identity → tenancy → plans-flags (testlar yashil bo'lguncha)
6. `web` ekranlari (prototiplar: `Owner-Plan.png`, `Onboard-Shop.png`, `Owner-Team.png`)
7. Hisobot: qaysi mezon o'tdi; **inson ko'rib chiqishi shart: identity, ruxsatlar (RBAC/RLS)**

## 7. Cheklovlar (halol)
- Ish muhitimda Docker yo'q: DB/Redis'ni mahalliy jarayon sifatida ishga tushiraman (PostgreSQL 16 — bor, Redis — bor, PostGIS — yo'q → Z16). `infra/docker-compose.yml` va CI service container'lari bu yerda ishga tushirilmaydi, faqat CI'da tekshiriladi.
- Telegram initData va SMS — mock; haqiqiy provayder bilan tutun testi staging'da (O10, O12 kerak).
- Lighthouse/LCP, JS ≤ 170 KB byudjeti — CI'da bundle-size tekshiruvi S0'da; LCP o'lchovi — staging.
- Xavfsizlik skaneri: `pnpm audit` va `gitleaks`-turi tekshiruv CI'da; tashqi pentest — pilotdan oldin.
