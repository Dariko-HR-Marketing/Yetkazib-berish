# Amalga oshirish holati (TZ v1.0 ↔ kod)

Oxirgi yangilanish: 05.11.2026 · Testlar: `cd backend && python -m pytest` — **60 ta, hammasi o'tadi**.
Belgilar: ✅ tayyor va testlangan · 🟡 qisman / sinov (mock) darajasida · ⛔ qilinmagan (sababi bilan).

## 1. Qabul sinovlari (AC-01…AC-13)

| Kod | Holat | Qanday tekshirilgan |
| --- | --- | --- |
| AC-01 qurilma va format | 🟡 | Brauzer (Chromium, 390 px) bo'yicha to'liq oqim o'tkazildi; Android/iOS real qurilmada qo'lda tekshirish kerak |
| AC-02 parallel buyurtma | ✅ | `test_AC02_parallel_last_item_only_one_wins` — haqiqiy 2 oqim, PostgreSQL: bittasi 201, ikkinchisi 409 `out_of_stock` |
| AC-03 takroriy so'rov | ✅ | Ketma-ket va parallel bir xil `Idempotency-Key`; takroriy webhook `duplicate` |
| AC-04 tenant izolyatsiyasi | ✅ | B egasi A buyurtmasi/filiali/katalogiga → 404 va auditda `access_denied` |
| AC-05 kuryer izolyatsiyasi | ✅ | Boshqa kuryer topshirig'i 404; topshirgach telefon niqoblanadi |
| AC-06 to'lov uzilishi | ✅ | Webhook kelmasa holat provayderdan so'raladi; noaniq → operator navbati `/ops/attention` |
| AC-07 kuryer rad etishi | ✅ | Jo'natma `created`ga qaytadi, `attention=rejected`, dispetcherga hodisa; qayta biriktirish |
| AC-08 bekor qilish | ✅ | Rezerv bo'shaydi, refund yozuvi, xabarnoma |
| AC-09 almashtirish | ✅ | Taymaut: `suggest_similar` → muqobil qo'llanadi; `remove` → chiqariladi; `call_me` → chiqariladi + operatorga signal |
| AC-10 tarozili mahsulot | ✅ | 1,08 kg — avtomatik; 1,25 kg — `approval_pending`, xaridor tasdig'isiz «tayyor» bo'lmaydi |
| AC-11 unumdorlik | 🟡 | `scripts/loadtest.py`, 4 yadroli sandbox'da (generator, baza va ilova bir mashinada), 50 sessiya: sof o'qishda katalog p95 ≈ 225 ms; **aralash yuklamada katalog p95 ≈ 935 ms (maqsad 800), buyurtma p95 ≈ 1067 ms (maqsad 1500)**. Katalog maqsadiga staging'da (alohida mashina) qayta o'lchash va kerak bo'lsa kesh kerak |
| AC-12 tiklash | ⛔ | Infratuzilma ishi (WAL arxiv + tiklash mashqi) — `deploy/` da runbook rejasi |
| AC-13 xavfsizlik | ⛔ | Tashqi skaner/pentest kerak. Ichki chora: HSTS/HTTPS, MFA, RBAC, idempotentlik, PIN bloklash, audit |

## 2. Funksional talablar

| Guruh | Holat | Izoh |
| --- | --- | --- |
| FR-AUTH (OTP, mehmon) | ✅ | OTP 5 daqiqa, 5 xato → blok, 10 daqiqada 5 so'rov. SMS provayder — adapter (`console`/`sms`) |
| FR-ADR, FR-ZONE | ✅ | Pin (koordinata + Leaflet xarita ixtiyoriy), mo'ljal/podyezd/qavat, doira va poligon hudud, bir nechta filialdan eng yaqini |
| FR-CAT, FR-CART, FR-SLOT | ✅ | Qidiruv, kategoriya, filial bo'yicha qoldiq; narx/yetkazish/min. savat serverda; slot sig'imi atomar |
| FR-SUB, FR-PK | ✅ | Qoida + rozilik chegarasi, muqobil taklif, taymaut, tarozili mahsulot, seriya raqami, shtrix-kod (kamera: `BarcodeDetector` qo'llasa) |
| FR-PAY | 🟡 | Mock provayder to'liq; **Payme/Click — interfeys tayyor, ulanish G1 qarori va sinov kalitlarini kutadi** |
| FR-TRK, FR-SUP, FR-HIST, FR-LANG | ✅ | Tokenli holat sahifasi (410 muddati), qator bo'yicha murojaat + surat, takroriy savat, uz/ru, PWA qobig'i |
| FR-P01…P04 | ✅ | Qo'lda tasdiq + SLA ogohlantirish, POS eskirsa qo'lda tasdiq, oshxona yuklamasi bo'yicha tayyorlik vaqti, mo'rt/og'irlik bo'yicha transport talabi |
| FR-PT01…PT07 | ✅ | Brend, katalog CRUD, CSV import/eksport (1000 qator ≪ 1 daq), narx/qoldiq/stop-list, hudud, slotlar, buyurtmalar (5 s so'rov + ovozli signal), hisobot, xodimlar |
| FR-DSP, FR-CR, FR-POD | ✅ | Biriktirish (transport tekshiruvi), rad etish, PIN (5 xato → blok), surat orqali topshirish (sozlama bilan), ≥2 bog'lanish + kutish, qayta yetkazish/qaytarish |
| FR-CS, FR-FIN, FR-ADM | ✅ | Murojaatlar, qaytarish limiti → moliya tasdig'i, kun yakuni solishtiruvi + CSV, hamkor ulash (kodsiz), Django Admin, o'zgarmas audit |
| 6.6 xabarnomalar | 🟡 | Barcha hodisalar outbox orqali; yuborish `console`/HTTP-SMS. **Telegram bot xabar yuborishi va Mini App ulanmagan** (faqat `/start` deep link javobi) |

## 3. Ataylab qilinmagan (keyingi sprintlar)

| Nima | Sabab | Qachon |
| --- | --- | --- |
| Payme / CLICK haqiqiy protokoli | Provayder tanlanmagan (TZ 14.2), sinov hisobi yo'q | G1 dan keyin, ~1 hafta |
| Fiskal chek (INT-FISC) | Fiskal operator tanlanmagan, yuridik qaror | G1 |
| Telegram Mini App, bot xabarlari, WhatsApp | Bot tokeni/provayder kerak; MVP'da SMS yoki veb-havola | Sprint 5 (US-029 «S») |
| POS/ERP adapteri | Hamkor tizimi noma'lum; hozir CSV + `source=pos` eskirish nazorati tayyor | Hamkor aniqlangach |
| Yandex Maps / Geocoder / Yandex Delivery | API kalitlari va shartnoma; hozir Leaflet+OSM va o'z kuryerlari | G1 |
| PostGIS, Redis, MinIO | MVP uchun kerak emas (ADR-004); rasm yuklash mahalliy diskda | Masshtablashda |
| PostgreSQL RLS | Ilova darajasidagi izolyatsiya testlangan; RLS — ikkinchi qatlam (NFR-08) | Pilotdan oldin (0,5 kun) |
| Poligon chizish interfeysi | API tayyor; xarita chizgichi Yandex Maps bilan birga | Sprint 3 |
| Sentry, monitoring ogohlantirishlari | DSN/infratuzilma kerak; `/health` va `X-Request-Id` tayyor | Staging bilan |
| Zaxira nusxa va tiklash mashqi (NFR-04, AC-12) | Server kerak | G4 dan oldin |
