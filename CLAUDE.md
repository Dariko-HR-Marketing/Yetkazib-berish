# CLAUDE.md — Dostavka SaaS platformasi (v1)

Bu fayl Claude Code uchun loyiha ko'rsatmasi. Har sessiya boshida o'qiladi. Hujjatlar o'zbek tilida, kod va identifikatorlar ingliz tilida.

## 1. Loyiha bir gapda

O'zbekistondagi do'konlar (oziq-ovqat, dorixona, gul, uy-ro'zg'or) uchun **gibrid SaaS dostavka platformasi**. Har do'konning o'z vitrinasi va Telegram mini-ilovasi bor, ixtiyoriy umumiy katalog ("Yaqin do'konlar") ham bor. Buyurtma, yig'ish, kuryer, to'lov, ball va analitika bitta tizimda. **Savdodan komissiya olinmaydi**: daromad faqat paketlar va qo'shimcha xizmatlardan keladi.

## 2. Manbalar ustuvorligi (ziddiyat bo'lsa)

Quyidagi yo'llar `docs/` papkasiga nisbatan (arxiv `docs/` ichiga joylashtiriladi, bu fayl — repo ildizida).

1. `00_boshlash/QARORLAR.md` — qabul qilingan qarorlar
2. `01_prd/03_S0_spetsifikatsiya_va_hodisalar.md` — joriy sprint qabul mezonlari
3. `01_prd/02_Texnik_spetsifikatsiya.md` — stek, modullar, ma'lumot modeli, NFR
4. `01_prd/01_PRD_va_qarorlar.md` — funksiyalar, paketlar, 40 ekran, sprintlar
5. `05_spetsifikatsiya_json/*.json` — mashina o'qiydigan qoidalar (flaglar, paketlar, hodisalar, rollar, kuryer, ball, tokenlar)
6. `02_huquqiy/*` — oferta, rozilik, ma'lumotlar reyestri (matnlar loyiha, yurist tasdiqlamagan)
7. `04_prototip/*` — UI namunasi (vizual va matn manbai, kod emas)
8. `03_data_va_marketing/*` — kontekst
9. `99_arxiv_eski/*` — **eskirgan, ishlatma**. Faqat tarix uchun.

Topilgan ziddiyatlar: `00_boshlash/ZIDDIYATLAR_VA_OCHIQ_SAVOLLAR.md`. Yangisini topsang — o'sha faylga yoz va foydalanuvchidan so'ra. O'zing taxmin qilib hal qilma.

## 3. O'zgarmas qoidalar (buzilmaydi)

- **Pul**: xaridor puli platformadan o'tmaydi. Do'konning Payme / Click / Uzum merchant hisobiga to'g'ridan-to'g'ri tushadi. Platforma faqat webhook orqali holatni ko'radi.
- **Naqd** faqat do'konning o'z kuryeri bilan. Platforma va tashqi kuryer kanallari faqat oldindan to'langan buyurtmani oladi.
- **Summalar** butun son: tiyin (so'm × 100) yoki ball. Float ishlatilmaydi. Vaqt UTC'da saqlanadi va Asia/Tashkent'da ko'rsatiladi.
- **Multi-tenant**: har jadvalda `tenant_id` va PostgreSQL RLS siyosati. Boshqa do'kon ma'lumotiga so'rov kelsa — 404 qaytadi (403 emas).
- **Funksiya kalitlari**: har funksiya `can(tenant, key)` bilan tekshiriladi. Shart: platforma ∧ paket ∧ do'kon. Kesh 60 soniya. Kalitlar va bog'liqliklar `feature_flags.json` da.
- **Idempotentlik**: pul yoki holatni o'zgartiradigan har so'rovda `Idempotency-Key` bo'ladi. Webhooklar imzo bilan tekshiriladi. Outbox pattern ishlatiladi.
- **Ledger va audit** o'zgarmas (faqat qo'shiladi). Ball ledgeri har kuni solishtiriladi.
- **Shaxsiy ma'lumot**: loglarda va hodisa xususiyatlarida bo'lmaydi (faqat ID). Telefon, manzil va ism maskalanadi. Karta raqami saqlanmaydi (faqat token). Sog'liq/parhez ma'lumoti alohida shifrlanadi.
- **Rozilik**: xizmat roziligi va marketing roziligi alohida. Meta/Google'ga hodisa faqat marketing roziligi bilan va xeshlangan holda yuboriladi.
- **Mijoz tahlili faqat ichki**: xaridorga analitika ekrani ko'rsatilmaydi, u faqat natijani (tavsiya, eslatma) ko'radi.
- **Atama**: xaridor uchun faqat **"ball"** (bonus emas). "Bonus" so'zi faqat kuryer to'lov koeffitsienti uchun.
- **Til**: uz (lotin) — asosiy, ru — to'liq ikkinchi til. Barcha UI matnlari ICU formatida, kalitlar bilan. Xato formati: `{code, message_uz, message_ru, details}`.
- **Narxlar** kodda emas, konfiguratsiyada (`plans.json` → DB seed). Ular hali gipoteza.

## 4. Stek (qaror qabul qilingan)

TypeScript hamma joyda · pnpm + Turborepo monorepo · Next.js (App Router) + React + Tailwind (veb + Telegram Mini App bitta kodda) · NestJS modulli monolit · PostgreSQL 16 + PostGIS · Redis + BullMQ · WebSocket/SSE · S3 + CDN · React Native (Expo) Android kuryer ilovasi · OpenTelemetry + Sentry + Prometheus/Grafana · GitHub Actions + Docker · Vitest, Playwright, k6.

Tavsiya qilingan repo tuzilmasi:

```
apps/web            Next.js: vitrina, umumiy katalog, panel, admin, Telegram Mini App
apps/api            NestJS: modullar (2-bo'lim, Texnik spetsifikatsiya)
apps/courier        React Native (Expo)
packages/ui         dizayn tokenlari + komponentlar (design_tokens.json dan)
packages/contracts  OpenAPI 3.1 + generatsiya qilingan turlar va klient
packages/config     eslint, tsconfig, prettier
packages/i18n       uz/ru xabarlar (ICU)
infra/              docker-compose, migratsiyalar, seed (plans.json, feature_flags.json)
docs/               shu arxivdagi hujjatlar
```

## 5. Ish tartibi (har modul uchun)

1. Spetsifikatsiyani o'qi: qabul mezonlari (Berilgan / Qachon / Unda), API, jadvallar.
2. **Avval** OpenAPI shartnoma va testlar (qabul mezonlari → testlar), keyin kod.
3. Avtomatik tekshiruv: `typecheck`, `lint`, `test`, bundle budget, xavfsizlik skaneri. Hammasi yashil bo'lmaguncha tayyor emas.
4. To'lov, kirish, shaxsiy ma'lumot, ledger va ruxsat modullari — **inson ko'rib chiqishi majburiy**. PR tavsifida buni alohida belgilab qo'y.
5. Yangi funksiya flag ortida chiqadi va bosqichma-bosqich yoqiladi.

**Tayyorlik mezoni (DoD):** qabul mezonlari bajarilgan; testlar o'tgan; uz/ru matnlar bor; 360/768/1024/1440 kengliklarda tekshirilgan; hodisalar `events.json` bo'yicha yozilmoqda; hujjat yangilangan; bo'sh, yuklanish va xato holatlari bor.

## 6. Sifat chegaralari

- 4G'dagi o'rta Android'da: LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1. Xaridor sahifalarida JS ≤ 170 KB (gzip).
- API p95: o'qish ≤ 300 ms, yozish ≤ 600 ms. Mavjudlik ≥ 99,5%.
- WCAG 2.2 AA. Bosiladigan element ≥ 44×44 px. Mobil asosiy matn ≥ 14 px.
- Telegram ichida: mavzu ranglari, MainButton, BackButton va safe area hisobga olinadi.
- Test qamrovi: buyurtma, to'lov, ledger va kalitlar modullarida ≥ 80%.

## 7. Prototiplardan foydalanish

`04_prototip/ekranlar/*.dc.html` — UI namunasi. Har faylda HTML shablon va `renderVals()` ichida namunaviy ma'lumot bor. Ko'rish uchun `04_prototip/KORISH.md` ga qara. PNG: `04_prototip/skrinshotlar/`. Ekran → v1 moslik: `04_prototip/EKRANLAR.md` va `screens.json`.

Prototiplardan **ko'chirma**: inline style'larni, namunaviy raqamlarni, DC shablon sintaksisini olma. Ulardan tuzilma, matnlar, holatlar va oqimlarni ol, so'ng `packages/ui` komponentlari va tokenlari bilan qayta yoz.

## 8. Hozirgi bosqich

**S0 sprint** — `00_boshlash/BIRINCHI_TOPSHIRIQ.md`. S0 tugamaguncha S1 ga o'tma.

## 9. Qilma

- Komissiya yoki split to'lov logikasini qo'shma (v2, alohida qaror kerak).
- Platforma kuryerlar pulini pilotda yoqma (yurist xulosasi kutilmoqda).
- Sovg'a kartalarini qilma (v2).
- `99_arxiv_eski` dagi Python/Django kodini yoki eski TZ qarorlarini ishlatma.
- Haqiqiy kalit yoki sirni repoga qo'yma (`.env.example` faqat).
- Biometrik ma'lumot (masalan, yuz tanish) yig'ma.
