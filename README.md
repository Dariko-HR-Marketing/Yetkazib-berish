# Dostavka SaaS platformasi (v1)

O'zbekistondagi do'konlar uchun gibrid SaaS dostavka platformasi. Loyiha qoidalari — [`CLAUDE.md`](CLAUDE.md), hujjatlar — [`docs/`](docs/README.md). **Hozirgi bosqich: S0** (identity, tenancy, plans-flags, audit-events) — holat: [`docs/00_boshlash/S0_HISOBOT.md`](docs/00_boshlash/S0_HISOBOT.md).

```
apps/api            NestJS modulli monolit (identity, tenancy, plans-flags, audit-events)
apps/web            Next.js (App Router): kirish, do'kon yaratish, TOTP, jamoa, paket va funksiyalar; Telegram Mini App
packages/contracts  OpenAPI 3.1 (yagona manba) + turlar
packages/i18n       uz/ru xabarlar (ICU) va summa formati
packages/ui         dizayn tokenlari (CSS o'zgaruvchilar, Tailwind preset) va komponentlar
packages/config     tsconfig, eslint
infra/              docker-compose, SQL migratsiyalar, seed (plans.json, feature_flags.json, ...)
docs/               loyiha hujjatlari (99_arxiv_eski/ — eskirgan, ishlatilmaydi)
```

## Ishga tushirish

Talablar: Node 22, pnpm 10, PostgreSQL 16, Redis 7 (`docker compose -f infra/docker-compose.yml up -d`).

```bash
pnpm install
cp .env.example .env            # sirlarni almashtiring
pnpm db:migrate                 # migratsiyalar + seed
pnpm --filter @dostavka/api dev       # API :4000
pnpm --filter @dostavka/web dev       # veb :3000 (/v1/* ni API'ga proksilaydi)
```

Demo uchun SMS kodni ko'rish: `DEV_SMS_INBOX=on` bilan API'ni ishga tushirib, `GET /v1/_dev/sms?phone=%2B998...` (faqat dev; productionda config rad etadi). Platforma admini: foydalanuvchini SMS bilan yarating, so'ng `update users set is_platform_admin = true where phone = '+998…'` va TOTP yoqing (admin endpointlari TOTP'siz ishlamaydi).

## Tekshiruvlar

```bash
pnpm typecheck && pnpm lint
pnpm test                       # API (168, haqiqiy PostgreSQL+Redis kerak), i18n, contracts, web
pnpm build                      # + JS byudjeti (<= 170 KB gzip)
pnpm --filter @dostavka/web e2e # Playwright (chromium); PW_CHROMIUM_PATH bilan mavjud brauzerni ko'rsatish mumkin
```

Test bazasi `dostavka_test` (har ishga tushirishda noldan quriladi), E2E — `dostavka_e2e`. O'zgartirish: `TEST_DATABASE_URL`, `E2E_DATABASE_URL`.

## Asosiy qoidalar (qisqacha)

Pul — tiyinda butun son; vaqt — UTC; har so'rovda `X-Tenant-Id` (begona do'kon → 404); o'zgartiruvchi so'rovlarda `Idempotency-Key`; ilova DB roli (`dostavka_app`) RLS'ni chetlab o'ta olmaydi; audit va rozilik jadvallari o'zgarmas; loglarda telefon maskalanadi.

## Soddalashtirilgan kirish (OPEN_LOGIN)

Hozircha kirish juda sodda: faqat telefon raqami. SMS kod, ikkinchi omil (TOTP), oferta/rozilik so'rovlari va blokirovkalar ishlamaydi. Standart: **yoqiq** (`OPEN_LOGIN=on`).

- **Xavfsiz emas**: istalgan raqam bilan istalgan hisobga kiriladi; haqiqiy ma'lumot bilan ochiq internetga qo'ymang.
- Soxta rozilik yozuvlari yaratilmaydi; har kirish auditga (`auth.open_login`) yoziladi.
- Rasmiy ishga tushirishda `OPEN_LOGIN=off` qiling: SMS/Telegram + TOTP + rozilik oqimi o'zgarishsiz saqlangan va testlar bilan qoplangan.
