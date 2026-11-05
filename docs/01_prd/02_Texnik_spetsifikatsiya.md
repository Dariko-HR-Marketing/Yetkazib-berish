# Texnik spetsifikatsiya v1 (AI ishlab chiqish uchun)

Kod AI tomonidan modul-modul yoziladi. Shuning uchun stek keng tarqalgan va bitta tilda (TypeScript), arxitektura — modulli monolit, har modul uchun shartnoma (API va ma'lumot sxemasi) koddan oldin yoziladi.

## 1. Stek

| Qatlam | Tanlov | Nega |
| --- | --- | --- |
| Til | TypeScript (hamma joyda) | Bitta til — AI uchun eng barqaror natija, umumiy turlar |
| Monorepo | pnpm + Turborepo | Umumiy turlar, dizayn tokenlari, API klienti bitta joyda |
| Veb (vitrina, umumiy katalog, panel, admin) | Next.js (App Router), React, Tailwind | Server render — tez birinchi ekran; PWA; bitta kod Telegram mini-ilova va brauzer uchun |
| Telegram mini-ilova | O'sha Next.js ilovasi + Telegram Mini Apps SDK | Alohida kod yo'q; Telegram mavzusi va tugmalariga moslashadi |
| Kuryer ilovasi | React Native (Expo), Android | Fonda GPS faqat mahalliy ilovada ishonchli (PRD, 8-bo'lim, 1-band) |
| Backend | NestJS (modulli monolit) | Aniq modul chegaralari; keyin mikroservisga ajratish oson |
| Ma'lumotlar bazasi | PostgreSQL 16 + PostGIS | Tranzaksiyalar, ledger, zonalar va masofa; satr darajasida tenant himoyasi (RLS) |
| Kesh va navbatlar | Redis + BullMQ | Funksiya kalitlari keshi, kuryer taklifi taymerlari, webhooklar |
| Real vaqt | WebSocket (kuzatuv, panel), SSE (xaridor) | Kuryer joylashuvi va buyurtma holati soniyalarda |
| Fayllar | S3 bilan mos saqlash + CDN | Rasmlar AVIF/WebP, bir nechta o'lcham |
| Qidiruv | PostgreSQL to'liq matn + pg\_trgm, sinonimlar jadvali | v1 uchun yetarli; v2 — alohida qidiruv dvigateli |
| Kuzatuv | OpenTelemetry, Sentry, Prometheus + Grafana | Xato, tezlik va biznes ko'rsatkichlari |
| CI/CD | GitHub Actions, Docker | Har o'zgarish avtomatik test va sinov muhitiga |

## 2. Modullar

Har modul o'z jadvallari va API'siga ega; boshqa modulga faqat uning ochiq API'si yoki hodisasi orqali murojaat qiladi.

| Modul | Vazifa | Sprint |
| --- | --- | --- |
| identity | Telefon + SMS, Telegram, sessiyalar, 2FA | S0 |
| tenancy | Do'kon, filial, xodim, rollar (RBAC) | S0 |
| plans-flags | Paketlar, funksiya kalitlari, limitlar | S0, S7 |
| audit-events | Audit jurnali, hodisalar lug'ati | S0 |
| catalog / inventory | Mahsulot, MXIK, narx, qoldiq, band qilish, import | S1 |
| storefront / marketplace | Vitrina, umumiy katalog, tartiblash | S2, S7 |
| cart / orders | Savat, buyurtma holat mashinasi, muqobil | S2 |
| payments / fiscal | Provayder adapterlari, token, band qilish, chek | S3 |
| fulfilment | Yig'ish, qadoq, dispetcher | S4 |
| delivery | Kanal tanlash, o'z kuryeri, platforma puli, tashqi API adapterlari | S4, S5 |
| tracking | GPS qabul, ETA, xaridorga uzatish | S4 |
| loyalty | Ball ledgeri, darajalar, kuponlar, aksiya kartalari | S6 |
| consents / legal | Hujjat versiyalari, akceptlar, so'rovlar | S6 |
| billing | Paket obunasi, qo'shimcha xizmatlar hisobi | S7 |
| notifications | Telegram, SMS, push, shablonlar uz/ru | S2–S7 |
| ai-gateway | LLM, ovoz, rasm; limitlar va maskalash | S7 |
| integrations | Billz, 1C, Excel, webhooklar | S1, S7 |
| analytics | Hisobotlar, ichki tahlil | S7 |

## 3. Asosiy ma'lumot modeli

| Jadval | Asosiy maydonlar |
| --- | --- |
| tenants | id, nomi, STIR, paket, holat, yaratilgan |
| branches | id, tenant\_id, manzil, geo, zona (polygon), ish vaqti |
| users | id, telefon, telegram\_id, til |
| memberships | user\_id, tenant\_id, rol, filial\_id, holat |
| plans / plan\_features | paket kodi, narx (konfiguratsiya), funksiya kalitlari, limitlar |
| tenant\_features | tenant\_id, kalit, yoqilgan, kim o'zgartirgan, vaqt |
| products | id, tenant\_id, nom\_uz, nom\_ru, MXIK, shtrix-kod, narx (tiyin), holat |
| stock | product\_id, filial\_id, miqdor, band, manba, yangilangan |
| orders | id, tenant\_id, xaridor\_id, manba (vitrina/katalog/telegram/agent), holat, summalar (tiyin), slot |
| order\_items | order\_id, product\_id, miqdor, narx, muqobil\_qoidasi, natija |
| payments | id, order\_id, provayder, holat, band qilingan, yechilgan, qaytarilgan, idempotency\_key |
| deliveries | id, order\_id, kanal (own/pool/third\_party), kuryer\_id yoki tashqi\_id, narx, holat, ETA |
| courier\_locations | courier\_id, vaqt, nuqta, aniqlik (90 kun, keyin jamlanadi) |
| ledger\_entries | hisob, summa (ball yoki tiyin), turi, manba, bog'langan yozuv (o'zgarmas) |
| consents | user\_id, hujjat, versiya, harakat, kanal, IP, vaqt, matn xeshi (o'zgarmas) |
| events | nomi, tenant\_id, user\_id, vaqt, xususiyatlar (JSON) |
| audit\_log | kim, nima, qachon, oldin/keyin (o'zgarmas) |

Pul va ball har doim butun son (tiyin, ball) sifatida saqlanadi; vaqt UTC'da; har jadvalda tenant\_id va RLS siyosati.

## 4. API qoidalari

- Shartnoma birinchi: OpenAPI 3.1 sxemasi yoziladi, kod va klient undan yaratiladi.
- REST + JSON, `/v1/...`; xato formati: `{code, message_uz, message_ru, details}`.
- Pul yoki holat o'zgartiruvchi har so'rovda `Idempotency-Key` sarlavhasi majburiy.
- Ro'yxatlar — kursor bilan sahifalash; filtr va saralash bir xil sintaksisda.
- Kiruvchi webhooklar imzo bilan tekshiriladi; chiquvchi webhooklar HMAC bilan imzolanadi va qayta urinish bilan yuboriladi.
- Ruxsat: `orders:read`, `stock:write` kabi ruxsat satrlari; rol — ruxsatlar to'plami.
- Funksiya tekshiruvi: bitta `can(tenant, feature)` funksiyasi (platforma → paket → do'kon), Redis'da 60 soniya kesh.

## 5. Tezlik va ishonchlilik talablari

| Ko'rsatkich | Maqsad | Qanday o'lchanadi |
| --- | --- | --- |
| Birinchi asosiy kontent (LCP), o'rta Android, 4G | ≤ 2,5 s | Real foydalanuvchi o'lchovi + Lighthouse CI |
| Javob tezligi (INP) | ≤ 200 ms | Real foydalanuvchi o'lchovi |
| Joy siljishi (CLS) | ≤ 0,1 | Lighthouse CI |
| Xaridor sahifalari JS hajmi | ≤ 170 KB (gzip) | CI byudjet tekshiruvi |
| API javobi p95 | o'qish ≤ 300 ms, yozish ≤ 600 ms | APM |
| Mavjudlik | ≥ 99,5% oyiga | Monitoring |
| Yuklama (pilot) | 300 buyurtma/soat, 10 baravar zaxira bilan sinov | k6 yuklama testi |
| Zaxira nusxa | Ma'lumot yo'qotish ≤ 15 daqiqa, tiklash ≤ 4 soat | Har oy tiklash sinovi |

**Optimallashtirish usullari:** server render va oqim bilan uzatish; rasmlar CDN orqali kerakli o'lchamda; katalog va narxlar keshi; kod bo'laklarga bo'linadi; shriftlar oldindan yuklanadi va qisqartiriladi; xaritalar faqat kerak bo'lganda yuklanadi; ma'lumotlar bazasida indekslar va sekin so'rovlar monitoringi.

## 6. Moslashuvchanlik (adaptiv) va interfeys

- Mobil birinchi; kengliklar: 360, 768, 1024, 1440 px. Panel planshetda (768) yig'uvchi uchun alohida optimallashtiriladi.
- Bosiladigan elementlar ≥ 44 × 44 px; matn ≥ 14 px; kontrast WCAG 2.2 AA.
- Telegram ichida: mavzu ranglari, asosiy tugma, orqaga tugma va xavfsiz hudud chegaralari hisobga olinadi.
- Dizayn tokenlari (ranglar, shriftlar, oraliqlar) prototiplardagi qiymatlardan; qorong'i rejim tokenlar orqali.
- Ko'p tillilik: ICU formatidagi xabarlar, o'zbek (lotin) va rus; summa "48 440 so'm" ko'rinishida; sana va vaqt Toshkent vaqtida.
- Oflayn: xaridor uchun katalog keshi; kuryer ilovasi hodisalarni navbatga yozib, aloqa tiklanganda yuboradi.

## 7. Xavfsizlik

- OWASP ASVS 2-daraja talablari; egasi, buxgalter va admin uchun 2FA.
- Maxfiy kalitlar alohida saqlovda; karta ma'lumoti saqlanmaydi (faqat token).
- Shifrlash: uzatishda va saqlashda; sog'liq ma'lumoti alohida shifrlanadi.
- Loglarda telefon, manzil va ism maskalanadi.
- So'rovlar soni cheklanadi; SMS kod urinishlari cheklanadi.
- Kutubxonalar zaifligi avtomatik skanerlanadi; pilotdan oldin tashqi xavfsizlik tekshiruvi.

## 8. Testlar

| Tur | Vosita | Talab |
| --- | --- | --- |
| Birlik testlari | Vitest | Buyurtma, to'lov, ledger, kalitlar modullarida ≥ 80% qamrov |
| Shartnoma testlari | OpenAPI sxemasi bo'yicha | Har API endpoint |
| Uchdan-uchgacha | Playwright (brauzer va Telegram ichidagi ko'rinish) | Har sprintning asosiy yo'llari |
| Yuklama | k6 | S8 da 300 buyurtma/soat × 10 |
| Vizual regressiya | Playwright skrinshotlari, 4 kenglikda | Har ekran |
| To'lov sandbox | Payme, Click, Uzum test muhitlari | Har to'lov holati |

## 9. AI bilan ishlab chiqish tartibi

1. **Spetsifikatsiya paketi** (har modul uchun): foydalanuvchi hikoyalari, qabul mezonlari (Berilgan / Qachon / Unda), OpenAPI, ma'lumot migratsiyasi, test holatlari.
2. **AI kod yozadi** spetsifikatsiya bo'yicha; testlar avval yoziladi.
3. **Avtomatik tekshiruv:** tur tekshiruvi, linter, testlar, tezlik byudjeti, xavfsizlik skaneri — hammasi yashil bo'lmaguncha birlashtirilmaydi.
4. **Inson ko'rib chiqishi** majburiy: to'lov, kirish, shaxsiy ma'lumot, ledger va ruxsat modullari.
5. **Sinov muhiti**, keyin funksiya kaliti bilan bosqichma-bosqich yoqish.

**Tayyorlik mezoni:** qabul mezonlari bajarilgan, testlar o'tgan, uz/ru matnlar bor, 4 kenglikda tekshirilgan, hodisalar yozilmoqda, hujjat yangilangan.

## 10. Muhitlar

Dev (lokal Docker) → Staging (to'lov sandbox, test ma'lumotlar) → Production. Ma'lumotlar bazasi migratsiyalari faqat oldinga, orqaga qaytarish rejasi bilan.
