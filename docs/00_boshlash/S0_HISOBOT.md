# S0 hisoboti (2026-11-05)

Ish tartibi: `CLAUDE.md` §5 va `BIRINCHI_TOPSHIRIQ.md`. Qarorlar: Z13–Z21 (ZIDDIYATLAR §C) — hammasi tavsiya bo'yicha tasdiqlangan.

## 1. Natija

| Nima | Holat |
| --- | --- |
| Monorepo (pnpm + Turborepo): `apps/{api,web}`, `packages/{ui,contracts,config,i18n}`, `infra/` | ✅ |
| OpenAPI 3.1 (`packages/contracts/openapi/openapi.yaml`, 27 operatsiya), xato formati `{code, message_uz, message_ru, details}` | ✅ |
| Migratsiyalar (7 ta, faqat oldinga, checksum nazorati) + RLS + seed (`plans.json`, `feature_flags.json`) | ✅ |
| NestJS: `identity`, `tenancy`, `plans-flags`, `audit-events` | ✅ |
| `apps/web`: kirish (SMS + Telegram), do'kon yaratish, TOTP, jamoa/taklif, «Paket va funksiyalar» — uz/ru | ✅ |
| CI (GitHub Actions): typecheck, lint, test, build + JS byudjeti, E2E, `pnpm audit`, gitleaks | ✅ yozilgan; **GitHub'da hali ishga tushmagan** (lokal ishga tushirilgan) |
| Staging muhiti | ⛔ hosting (O6) tanlanmagan |

## 2. Testlar (lokal, haqiqiy PostgreSQL 16 + Redis)

| To'plam | Soni | Qamrov |
| --- | --- | --- |
| API (Vitest) | **168** | 21 qabul mezoni, RLS, `can()`, RBAC, OpenAPI shartnomasi, seed/migratsiya, config |
| i18n | 6 | uz/ru paritet, ICU o'zgaruvchilar, kirill/lotin aralashmasligi, ko'plik shakllari |
| contracts | 5 | OpenAPI qoidalari (Idempotency-Key, X-Tenant-Id, xato sxemasi) |
| web (birlik) | 9 | API klient: kalit, qayta yangilash (single-flight), xato xaritasi |
| E2E (Playwright, Chromium) | **35** | to'liq oqim; 360/768/1024/1440 × uz/ru; axe (WCAG 2.2 AA) + qorong'i rejim; Telegram (soxta WebApp); oflayn |

### 21 qabul mezoni → test

| Mezon | Asosiy testlar (`apps/api/test/`) |
| --- | --- |
| I-1 | `identity.test.ts` › «I-1» (6 xona, 5 daq, 60 s, kod xesh) |
| I-2 | › «I-2» (5 xato → 6-urinishda 15 daq blok, `auth.otp_locked` xesh bilan) |
| I-3 | › «I-3» (imzo, 24 soat, qat'iy hex, boshqa bot, kelajak sanasi) |
| I-4 | › «I-4» (`consents`, versiya, matn xeshi, marketing alohida, o'zgarmas) |
| I-5 | › «I-5» (TOTP majburiy, replay, 5 xato blok, shifrlangan kalit) |
| I-6 | › «I-6» (15 daq, aylanish, qayta ishlatish → oila bekor, 30 kun, logout) |
| T-1…T-6 | `tenancy.test.ts` › «T-1»…«T-6» (T-4: 404 va mavjud/mavjud emas javoblari bir xil) |
| F-1…F-6 | `features.test.ts` (+ `can()` jadvali: 8 holat `it.each`, kesh TTL, F-4 sanalar) |
| A-1…A-3 | `audit-events.test.ts` (o'zgarmaslik, lug'at ↔ `events.json`, PII aniqlash, log maskalash) |
| RLS izolyatsiyasi | `rls.test.ts` (har tenant jadvali; o'qish/yozish/o'chirish; global jadvallar ro'yxati; BYPASSRLS yo'q) |

## 3. Tekshiruv ro'yxati («S0 tugaganini qanday tekshirasiz»)

- [x] `pnpm test` yashil, 21 mezon testi bor
- [x] Ikki do'kon: biri ikkinchisini ko'ra olmaydi (404) — `tenancy` T-4, `rls`, E2E
- [x] Start → Biznes: «Umumiy katalog» qulfdan chiqadi — `features` F-2
- [x] Naqd yoqilgan: o'z kuryerlarini o'chirish rad etiladi — `features` F-5 (+ E2E)
- [x] SMS kod 5 marta xato → 15 daqiqa blok — `identity` I-2 (+ E2E)
- [x] Telefonda (360 px) va «Telegram ichida» (soxta WebApp) ochiladi, uz/ru almashadi — E2E
- [ ] **Texnik mas'ul identity va ruxsat kodini ko'rib chiqdi** — ⛔ O7: mas'ul belgilanmagan

## 4. Inson ko'rib chiqishi MAJBURIY (CLAUDE.md §5.4)

Quyidagilarsiz S0 «tayyor» emas (DoD). Fayllar ustuvorlik tartibida:

1. **Kirish va sessiya:** `apps/api/src/modules/identity/{identity,session,token,totp,telegram}.service.ts`, `common/access.ts`, `common/crypto.ts`
2. **Ruxsatlar va izolyatsiya:** `infra/migrations/0006_rls.sql`, `common/rbac.ts`, `common/access.ts`, `db/db.service.ts` (`SET LOCAL` konteksti), `modules/tenancy/tenancy.service.ts`
3. **Kalitlar (pulga ta'sir qiladi):** `modules/plans-flags/{features,admin-plans}.service.ts`
4. **Idempotentlik:** `common/idempotency.interceptor.ts`
5. **Audit/rozilik:** `0005_consents_events_audit.sql`, `audit-events/*`

Maxsus e'tibor so'raladigan joylar:
- RLS: `app.platform='on'` faqat server kodida o'rnatiladi (admin, dispatcher). Boshqa joyda (masalan, kelajakdagi xom SQL) o'rnatilsa izolyatsiya buziladi.
- `invites` siyosati token xeshi bo'yicha ham ochiq (qabul qilish uchun) — tokenning 256 bit tasodifiyligiga tayanadi.
- Telegram initData: `auth_date` ≤ 24 soat; qayta ishlatishga qarshi alohida himoya yo'q (spetsifikatsiya talab qilmaydi).

## 5. Qaror va farqlar (halol)

| # | Nima | Izoh |
| --- | --- | --- |
| 1 | «Testlar avval» to'liq bajarilmadi | OpenAPI shartnomasi va migratsiyalar kodlardan **oldin** yozildi; testlar esa har modul bilan **birga** (kod → test → tuzatish) yozildi. Mezonlar spetsifikatsiyadan olingan; qizil→yashil tarixi yo'q |
| 2 | T-5 (Z17) | Egasi limitga kiradi → Start'da **3-taklif** rad etiladi (spetsifikatsiyadagi «4-taklif» emas) |
| 3 | OpenAPI bitta fayl | Reja 4 faylni nazarda tutgan; $ref'lar va validatorlar soddaligi uchun bitta `openapi.yaml` |
| 4 | PostGIS yo'q (Z16-a) | `branches.lat/lng` + `zone_geojson`; PostGIS S4'da |
| 5 | ~~Tokenlar `localStorage`'da~~ → **hal qilindi** (2026-11-05) | Next.js BFF proksi (`apps/web/src/app/v1/[...path]/route.ts`): tokenlar httpOnly cookie'da (`dst_at` / `dst_rt`, yangilash tokeni faqat `/v1/auth` yo'lida), brauzer JS ularni ko'rmaydi; HTTPS'da `SameSite=None; Secure; Partitioned` (Telegram Web iframe uchun), CSRF — Origin tekshiruvi + CSP `frame-ancestors`. **Insonning ko'rib chiqishi kerak** (`lib/bff.ts`, `route.ts`) |
| 6 | `DEV_SMS_INBOX` | Faqat e2e uchun mock SMS'ni HTTP orqali o'qish; productionda config yoqishga yo'l qo'ymaydi (test bor) |
| 7 | `PATCH /tenants {status:"active"}` | KYC/oferta imzolash (Onboard-Shop 4-qadam) S0 doirasida emas: egasi faollashtira oladi |
| 8 | Egalik berish | S0'da yo'q (`role=owner` PATCH rad etiladi); oxirgi egani o'zgartirib bo'lmaydi |
| 9 | `plan.changed` 30 kunlik ogohlantirish | Hodisa va `plan_migrate_at` yoziladi, interfeysda sana ko'rinadi; SMS/Telegram xabarnomasi (notifications moduli) S2+ |
| 10 | `ai.external_agents` (`owner+platform`) | Platforma darajasida yoqiq; «beta»ni platforma o'chirgichi bilan boshqarish mumkin. Tasdiq kerak |
| 11 | ~~IP bo'yicha cheklash yo'q~~ → **hal qilindi** | Redis, kirish endpointlari 30/daq, qolgan API 600/daq (`RATE_LIMIT_*`), 429 `rate.limited` + `Retry-After`; Redis ishlamasa fail-open (monitoring S1) |

## 6. O'lchanmagan yoki qilinmagan

- LCP/INP/CLS (4G o'rta Android) — faqat JS byudjeti (≈128 KB gzip, chegara 170) o'lchandi; Lighthouse CI va real qurilma — staging'da.
- API p95 (≤300/600 ms) va k6 yuklama — S8 rejasi bo'yicha; S0'da o'lchanmagan.
- Vizual regressiya (skrinshot taqqoslash): skrinshotlar olinadi (`apps/web/e2e-screenshots/`), lekin baza bilan solishtirilmaydi; shrift/OS farqi sababli tavsiya — CI'da Docker bilan.
- Haqiqiy SMS provayder va Telegram bilan tutun testi (O10, O12); haqiqiy Telegram klientida tekshiruv.
- `pnpm audit --prod`: **yuqori daraja yo'q** (multer/postcss/body-parser `overrides` bilan yopildi); **8 ta o'rta** qoldi (`qs`, `minimatch`, `file-type`, `@nestjs/core`) — NestJS 11 ga ko'chish bilan hal bo'ladi, alohida PR sifatida tavsiya.
- Telefon raqami bazada ochiq (`users.phone`, `invites.phone`, `otp_codes.phone`): SMS yuborish uchun zarur. Loglarda va hodisalarda yo'q. Ustun darajasida shifrlash — reyestr (O4) qaroriga qarab.
- `docker compose` / Dockerfile'lar bu muhitda ishga tushirilmagan (Docker yo'q); CI'da tekshiriladi.

## 7. Keyingi qadam

S1 — katalog, qoldiq, Excel import, MXIK. **S0 tugamaguncha S1 ga o'tilmaydi:** avval (a) O7 — mas'ul tayinlanishi va §4 bo'yicha ko'rib chiqish, (b) CI'ning GitHub'da yashil bo'lishi, (c) §5.5 (tokenlar saqlovi) bo'yicha qaror.

## 8. Yangilanish (2026-11-05, keyingi sessiya)

- **CI:** `ci.yml` YAML xatosi tufayli birinchi ikki yurishda umuman ishga tushmagan edi (tuzatildi, actionlint bilan). Keyin `check` job (typecheck, lint, test, build, E2E) GitHub'da yashil; `security` job'da pullik gitleaks-action o'rniga bepul CLI qo'yildi.
- **Oferta/rozilik:** `OFERTA_JORIY_ETISH.md` — versiyalash, kuchga kiritish (placeholder'siz), qayta akcept, do'kon akcepti, marketing roziligi.
- **Tokenlar:** BFF + httpOnly cookie (yuqoridagi §5.5).
- **IP cheklovi** va `GET /v1/health`.
- Testlar: API 188, i18n 6, contracts 5, web 21, E2E 44+.

## 9. S1 (katalog, qoldiq, import) — holat (2026-11-05)

Reja va qarorlar (D1–D17): `S1_REJA.md`.

| Nima | Holat |
| --- | --- |
| Migratsiya 0009: `categories`, `products`, `stock`, `stock_movements` (o'zgarmas), `import_jobs` + RLS, tenantlararo murakkab FK | ✅ |
| API: kategoriya, mahsulot (kursor, qidiruv, MXIK filtri), qoldiq (o'rnatish/tuzatish/«Tugadi»), import (preview/apply, CSV+XLSX) | ✅ |
| OpenAPI: +17 operatsiya, shartnoma ↔ kod testi | ✅ |
| Veb: `/katalog`, `/import` (uz/ru, 360–1440, axe) | ✅ |
| Mezon: 1 000 mahsulot import ≤ 60 s | ✅ ~3 s (API testi) |
| Mezon: «Tugadi» ≤ 5 s | ✅ keshsiz o'qish (ommaviy vitrina — S2) |
| Testlar: API 214, web 25, E2E 63 | ✅ lokal |

Qilinmagan / keyingi: import «bekor qilish» (undo), zal/ombor bo'linishi, ierarxik kategoriya, rasm yuklash (S3 bilan), MXIK avtomatik to'ldirish (AI, S7), ommaviy vitrina o'qishi (S2).
Inson ko'rib chiqishi: ruxsatlar (`catalog:*`, `stock:*`), RLS (0009), import parseri (`parsers.ts`, zip-bomba chegarasi).
Tuzatildi: yangilash tokeni bir vaqtda ikki marta yuborilganda API sessiyani «qayta ishlatish» deb bekor qilardi (CI jurnalida `reuse` ko'rindi). BFF endi bir xil token uchun natijani 10 soniya umumlashtiradi.
