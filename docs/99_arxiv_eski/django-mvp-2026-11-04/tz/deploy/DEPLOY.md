# O'rnatish va ishga tushirish qo'llanmasi

Bu qo'llanma texnik rahbar va DevOps uchun. Maqsad: 1 soat ichida lokal yoki staging muhitda ma'lumotlar bazasi, kesh, fayl saqlash va API hujjatini ko'tarish.

## 1. Talablar

| Dastur | Versiya | Tekshirish |
| --- | --- | --- |
| Docker | 24+ | `docker --version` |
| Docker Compose | v2 | `docker compose version` |
| Git | 2.40+ | `git --version` |
| Bo'sh portlar | 5432, 6379, 9000, 9001, 8081 | — |

## 2. Lokal ishga tushirish (development)

```bash
# 1) Paketni oching va deploy papkasiga o'ting
cd dariko-tz/deploy

# 2) Sozlamalar faylini yarating
cp .env.example .env
#    .env ichidagi parollarni (POSTGRES_PASSWORD, S3_SECRET_KEY, JWT_SECRET) almashtiring

# 3) Infratuzilmani ko'taring
docker compose up -d

# 4) Holatni tekshiring
docker compose ps
```

Birinchi ishga tushishda PostgreSQL avtomatik ravishda `db/schema.sql` (sxema) va `db/seed_demo.sql` (demo ma'lumot) fayllarini bajaradi.

## 3. Tekshirish

| Nima | Qayerda | Kutilgan natija |
| --- | --- | --- |
| API hujjati (Swagger) | http://localhost:8081 | Barcha endpointlar ro'yxati |
| Fayl saqlash konsoli | http://localhost:9001 | `.env` dagi S3 login bilan kirish |
| Ma'lumotlar bazasi | `docker compose exec postgres psql -U dariko -d dariko` | `\dt` 20+ jadval ko'rsatadi |
| Demo hamkorlar | `SELECT slug, profile FROM tenants;` | `demo-dokon`, `demo-kafe` |
| Rezerv funksiyasi | `SELECT reserve_stock('aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000002',1);` | Birinchi marta `t`, ikkinchi marta `f` (AC-02) |

## 4. Staging muhit

1. Alohida server yoki bulut (O'zbekiston hududida — LR-03).
2. `.env` da `APP_ENV=staging`, sinov to'lov kalitlari, haqiqiy bo'lmagan shaxsiy ma'lumotlar.
3. HTTPS: Nginx yoki Traefik + Let's Encrypt sertifikati.
4. Zaxira: `pg_dump` har kuni + WAL arxivlash; haftada bir marta tiklash sinovi.

## 5. Production'ga chiqish (G4) cheklisti

- [ ] Production va staging alohida serverlar, alohida parollar va kalitlar
- [ ] Faqat HTTPS, HSTS yoqilgan
- [ ] Ma'lumotlar bazasi tashqi tarmoqqa ochiq emas (5432 port yopiq)
- [ ] Admin va moliya rollari uchun MFA yoqilgan
- [ ] Zaxira nusxa avtomatik, tiklash mashqi dalolatnoma bilan o'tkazilgan (NFR-04)
- [ ] Sentry / monitoring va ogohlantirishlar ishlamoqda (NFR-11)
- [ ] To'lov provayderi production kalitlari, webhook manzili ro'yxatdan o'tkazilgan
- [ ] Huquqiy bandlar LR-01…LR-08 yopilgan
- [ ] Qabul sinovlari AC-01…AC-13 o'tgan

## 6. Tez-tez uchraydigan muammolar

| Belgi | Sabab | Yechim |
| --- | --- | --- |
| `port is already allocated` | Port band | `.env` yoki compose'da portni o'zgartiring |
| Sxema qo'llanmadi | Volume avvaldan mavjud | `docker compose down -v` (ma'lumot o'chadi!) va qayta `up -d` |
| `extension "postgis" is not available` | Oddiy postgres obrazi | `postgis/postgis` obrazidan foydalaning |
