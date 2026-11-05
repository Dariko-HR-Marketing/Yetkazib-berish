# 7. Texnik arxitektura va ma'lumot modeli

MVP uchun modullarga ajratilgan yagona backend (modular monolith) va PostgreSQL taklif qilinadi. Bu jamoa hajmi va pilot yuklamasiga mos; keyinchalik og'ir modullar (xabarnoma, integratsiya) alohida servisga ajratiladi. Sxema: `diagrams/01_arxitektura.mmd`. Qarorlar: `adr/`.

```
┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐
│  Mijoz kanallari   │ │   Hamkor portali   │ │ Operatsion panellar│
│ PWA, Telegram, QR  │ │ katalog, filial    │ │ yig'ish, dispetcher│
└─────────┬──────────┘ └─────────┬──────────┘ └─────────┬──────────┘
          └──────────────┬───────┴──────────────────────┘
                         ▼
┌────────────────────────────────────────────────────────────────────┐
│            API shlyuzi  →  Buyurtma yadrosi (OMS)                  │
│ katalog·savat·hudud·narx·rezerv·yig'ish·to'lov·yetkazish·xabar·audit│
└───────────┬────────────────────────┬───────────────────────┬───────┘
            ▼                        ▼                       ▼
┌───────────────────┐  ┌───────────────────────┐  ┌───────────────────────┐
│ PostgreSQL+PostGIS│  │ Hodisalar navbati     │  │ Integratsiya adapterlari│
│ Redis, S3 (fayl)  │  │ outbox, webhook, DLQ  │  │ to'lov, SMS, xarita, POS│
└───────────────────┘  └───────────────────────┘  └───────────────────────┘
```

## 7.1. Qatlamlar

| Qatlam | Tarkibi |
| --- | --- |
| Mijoz kanallari | Brendli veb-vitrina (PWA, SSR), Telegram bot / Mini App, QR va ijtimoiy tarmoq havolalari |
| Ishchi panellar | Hamkor portali, yig'uvchi/oshxona, dispetcher, kuryer, yordam, moliya, admin (yagona SPA, rolga qarab) |
| API shlyuzi | REST/JSON (`api/openapi.yaml`), autentifikatsiya, rate limit, tenant aniqlash |
| OMS modullari | catalog, cart, zone, pricing, reservation, order, picking, payment, delivery, notification, ticket, audit, report |
| Ma'lumotlar | PostgreSQL 15+ va PostGIS (`db/schema.sql`), Redis (kesh, sessiya, navbat), S3-mos obyekt saqlash |
| Hodisalar | `outbox_events` → worker → webhook/xabarnoma; eksponensial qayta urinish; dead-letter navbati |
| Adapterlar | To'lov, fiskal, SMS/Telegram, xarita/geokod, POS/ERP, kuryer xizmati — har biri bir xil interfeys bilan |

## 7.2. Tavsiya etiladigan texnologik stek

Yakuniy stekni texnik rahbar jamoa tajribasiga qarab ADR orqali tasdiqlaydi.

| Qism | Tavsiya | Muqobil |
| --- | --- | --- |
| Backend | Python 3.12 + Django/DRF yoki FastAPI | Node.js (NestJS), Go |
| Vitrina | Next.js (SSR, PWA) | Nuxt |
| Panellar | React + Vite (SPA) | Vue |
| Ma'lumotlar bazasi | PostgreSQL 15+ + PostGIS | — |
| Kesh / navbat | Redis 7 | RabbitMQ |
| Fayllar | MinIO (S3-mos) | Mahalliy bulut obyekt saqlash |
| Infratuzilma | Docker, CI/CD (GitHub/GitLab), O'zbekiston hududidagi data-markaz | Kubernetes (keyin) |
| Kuzatuv | Sentry, Prometheus + Grafana, markazlashgan loglar (Loki) | — |

## 7.3. Modul tuzilmasi (backend)

```
backend/
  apps/
    tenants/        # hamkor, filial, profil, brend
    accounts/       # foydalanuvchi, rol, OTP, MFA
    catalog/        # mahsulot, variant, kategoriya, modifikator
    inventory/      # filial qoldig'i, rezerv
    zones/          # xizmat hududi, tarif, slot
    cart/           # savat, narx hisoblash
    orders/         # buyurtma, holat mashinasi, versiyalash
    picking/        # yig'ish, almashtirish, vazn
    payments/       # to'lov, qaytarish, provayder adapterlari
    delivery/       # jo'natma, kuryer, PoD, kuzatuv tokeni
    notifications/  # SMS/Telegram shablonlari
    support/        # murojaatlar
    finance/        # kun yakuni solishtiruvi
    audit/          # audit jurnali
    integrations/   # outbox, webhook, POS, xarita
  config/
  tests/
```

## 7.4. Asosiy obyektlar

To'liq maydonlar `db/schema.sql` da.

| Obyekt (jadval) | Asosiy maydonlar | Izoh |
| --- | --- | --- |
| Tenant (`tenants`) | id, nom, profil turi, brend, paket, holat | Barcha biznes jadvallarida `tenant_id` |
| Filial (`branches`) | id, tenant_id, manzil, koordinata, ish vaqti, sig'im | — |
| Mahsulot (`products`) | id, tenant_id, nom (uz/ru), kategoriya, birlik, tarozili belgisi | — |
| Variant / SKU (`product_variants`) | id, mahsulot, shtrix-kod, atributlar, og'irlik, hajm | — |
| Filial qoldig'i (`branch_stock`) | filial, sku, mavjud, band, onlayn ajratilgan, yangilangan vaqt | Eskirganlik nazorati |
| Xizmat hududi (`delivery_zones`) | filial, poligon, tarif, minimal savat | PostGIS |
| Vaqt oralig'i (`time_slots`) | filial, boshlanish, tugash, sig'im, band | — |
| Buyurtma (`orders`) | id, raqam, tenant, filial, xaridor, holat, versiya, summalar | Optimistik versiyalash |
| Buyurtma qatori (`order_items`) | so'ralgan va haqiqiy miqdor/vazn, narx, almashtirish qoidasi | — |
| To'lov (`payments`, `refunds`) | provayder, tranzaksiya, summa, holat, idempotentlik kaliti | Karta rekvizitlarisiz |
| Jo'natma (`shipments`) | kuryer, transport turi, holat, PoD | — |
| Murojaat (`tickets`) | buyurtma, qator, turi, holat, ilovalar | — |
| Audit (`audit_log`) | obyekt, amal, eski/yangi qiymat, muallif, vaqt, IP | Faqat qo'shish |

## 7.5. Izolyatsiya va kirish nazorati

1. Har bir tenantga tegishli yozuvda `tenant_id` va kerak bo'lsa `branch_id` saqlanadi.
2. Kirish huquqi har bir API so'rovida serverda tekshiriladi; mijoz tomonidagi filtrga tayanilmaydi.
3. PostgreSQL Row-Level Security qo'shimcha himoya qatlami sifatida yoqiladi (`db/schema.sql` oxirida namuna).
4. Kuryer faqat o'z topshirig'ini va kerakli aloqa ma'lumotini ko'radi; topshirilgandan keyin xaridor telefoni yashiriladi.

## 7.6. Ishonchlilik va uzilishlarga chidamlilik

1. Buyurtma, rezerv va to'lov yaratish so'rovlari `Idempotency-Key` sarlavhasi bilan qabul qilinadi; takroriy so'rov bitta natijaga bog'lanadi.
2. Rezerv va buyurtma versiyasi bitta tranzaksiyada atomar o'zgaradi (`SELECT … FOR UPDATE` yoki shartli `UPDATE … WHERE available - reserved >= :qty`). Oxirgi SKU uchun raqobatda faqat bitta buyurtma tasdiqlanadi.
3. Rezerv muddati cheklangan (standart 15 daqiqa to'lovgacha), muddati o'tsa avtomatik bo'shaydi.
4. POS umumiy rezervni qo'llamasa, onlayn savdo uchun alohida ajratilgan qoldiq yoki operator tasdig'i ishlatiladi.
5. Hodisalar tranzaksiya bilan birga `outbox_events` ga yoziladi; eksponensial qayta urinish (1, 2, 4, 8… daqiqa, maks. 10 urinish), dead-letter, davriy solishtirish va operatorga uzatish.
6. Kiruvchi webhooklar imzo yoki autentifikatsiya bilan tekshiriladi va idempotent qayta ishlanadi.
7. Tashqi servis ishlamasa, operator paneli oxirgi ma'lum holatni va «tekshirilmagan» belgisini ko'rsatadi.
