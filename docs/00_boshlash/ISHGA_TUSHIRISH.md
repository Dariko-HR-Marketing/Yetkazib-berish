# Pilotga tayyorgarlik va ishga tushirish ro'yxati (S8)

Holat: **kod tomoni tayyor, lekin pilotga chiqish uchun quyidagi tashqi va inson qadamlari majburiy.** Bajarilmagan band — to'siq.

## 1. To'siqlar (pilotdan oldin albatta)
| # | Nima | Kim | Holat |
| --- | --- | --- | --- |
| 1 | `OPEN_LOGIN=off`, `SMS_FIXED_CODE` olib tashlash, `DEMO_SEED=off`, `DEV_SMS_INBOX=off` | DevOps | ⛔ hozir test rejimi |
| 2 | Haqiqiy SMS provayder (O10) va Telegram bot tokeni (O12) | Egasi | ⛔ |
| 3 | Yurist tasdiqlagan oferta/maxfiylik/DPA matnlari (`[...]` to'ldirilgan), ruscha tarjimalar | Yurist | ⛔ |
| 4 | Texnik mas'ul (O7) kirish, ruxsat, BFF, qoldiq/ball mantig'ini ko'rib chiqishi (har PR'da belgilangan) | Mas'ul | ⛔ |
| 5 | Onlayn to'lov: holat mashinasi, imzolangan webhook, qaytarish va sandbox **tayyor**; Payme/Click/Uzum **adapterlari** (provayder protokoli va imzo) merchant sandbox kalitlari va hujjatlari bilan qo'shiladi; fiskal chek integratsiyasi | Egasi + dasturchi | ⛔ adapterlar kutilmoqda |
| 6 | Platforma kuryerlari puli — yurist xulosasigacha **yoqmaslik** (CLAUDE.md §9) | Yurist | ⛔ |
| 7 | KYC (E-IMZO) va fiskal chek integratsiyasi | Egasi | ⛔ |
| 8 | Tashqi xavfsizlik tekshiruvi (pentest) | Tashqi firma | ⛔ |

## 2. Muhit sozlamalari (production)
- Maxfiy kalitlar: `JWT_SECRET`, `DATA_ENCRYPTION_KEY` (32 bayt base64), `PHONE_HASH_PEPPER`, `POSTGRES_PASSWORD`, `APP_DB_PASSWORD` — kuchli, repoga qo'yilmaydi.
- `NODE_ENV=production` da dev qiymatlar bilan API ishga tushmaydi (config tekshiradi).
- HTTPS (cookie `Secure; SameSite=None; Partitioned` Telegram uchun), `CORS_ORIGINS`, `APP_BASE_URL`.
- Redis: `maxmemory-policy noeviction` (BullMQ), persistence yoqilgan. Ko'p nusxa: Redis qulf (`job:loyalty:daily`) bitta nusxada bajaradi; BFF yangilash umumlashtirishi xotirada — ko'p nusxada API'da qisqa «reuse» oynasi qo'shiladi (O6 hosting aniq bo'lgach).
- `EVENTS_DISPATCH=on` (outbox), `BACKGROUND_JOBS=on` (ball muddati va ledger solishtirish).

## 3. Zaxira va tiklash (Texnik spetsifikatsiya §5: yo'qotish ≤ 15 daqiqa, tiklash ≤ 4 soat)
- `deploy/backup.sh` — `pg_dump` (cron: har 4 soatda) + **WAL arxivlash** (`archive_mode=on`, `archive_command` → S3) — 15 daqiqalik chegara uchun majburiy.
- `deploy/restore-test.sh` — **oyiga bir marta** oxirgi nusxani vaqtinchalik bazaga tiklab tekshiradi. Natijani jurnalga yozing.
- Tiklash tartibi: (1) API to'xtatiladi; (2) `pg_restore -d dostavka --clean --no-owner <dump>`; (3) `node dist/db/migrate-cli.js`; (4) API ishga tushiriladi; (5) `GET /v1/health`; (6) ledger solishtirish (`reconcile`) bo'sh bo'lishi kerak.

## 4. Kuzatuv (monitoring)
- `GET /v1/health` (baza + Redis). Uptime monitor: 1 daqiqa, ogohlantirish 2 ketma-ket xatoda.
- API jurnali JSON (`level`, `rid`); shaxsiy ma'lumot maskalangan. ERROR: `ball ledgeri nomuvofiq`, `refresh rad etildi: reuse` (o'g'irlik belgisi), 5xx.
- `GET /v1/metrics` (Prometheus matni: so'rovlar davomiyligi gistogrammasi marshrut bo'yicha, jarayon xotirasi) — `METRICS_TOKEN` o'rnatilsa ochiladi (Bearer). Grafana paneli va Sentry (DSN) — **hali ulanmagan**; ulangach: p95 o'qish ≤ 300 ms, yozish ≤ 600 ms, mavjudlik ≥ 99,5%.

## 5. Yuklama sinovi
`infra/k6/load.js` — vitrina o'qish + buyurtma berish; maqsad: **300 buyurtma/soat × 10 zaxira** (3000/soat), chegaralar skriptda. Staging'da ishga tushiring:
```bash
k6 run -e BASE_URL=https://<staging> -e SLUG=demo -e BRANCH_ID=<filial-uuid> infra/k6/load.js
```
**Hali bajarilmagan** (staging yo'q, O6). Natija shu hujjatga yoziladi.

## 6. Xavfsizlik tekshiruvi (ichki)
- ✅ RLS barcha tenant jadvallarida (avtomatik test: yangi jadval RLS'siz qolmaydi); begona do'kon — 404.
- ✅ Idempotentlik (pul/holat so'rovlarida), o'zgarmas ledger/audit/harakat jurnali (trigger).
- ✅ Tokenlar httpOnly cookie (BFF), CSRF Origin tekshiruvi, CSP `frame-ancestors`, IP bo'yicha so'rov cheklovi.
- ✅ Parser xavfsizligi: XLSX zip-bomba chegarasi, CSV formula in'ektsiyasidan himoya (xatolar fayli).
- ✅ `pnpm audit --prod`: zaifliklar yo'q (NestJS 11 + Express 5 ga ko'childi, minimatch override).
- ⛔ Tashqi pentest, maxfiy kalitlarni aylantirish tartibi, ma'lumotni ustun darajasida shifrlash (telefon) — reyestr (O4) qaroriga qarab.

## 7. Qabul qilish yo'riqnomasi
Test yo'riqnomasi: `TEST_YOLLANMA.md`. Pilot: 10–15 do'kon. Har do'kon uchun: hujjat akcepti, filial, katalog (import), xodimlar va kuryerlar, yetkazish narxi.
