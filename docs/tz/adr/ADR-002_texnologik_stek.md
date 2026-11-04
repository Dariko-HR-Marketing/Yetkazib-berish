# ADR-002. Texnologik stek

- **Holat:** Ochiq (G1 da tasdiqlanadi)
- **Sana:** 04.11.2026

## Variantlar

| Mezon | Python (Django/DRF) | Node.js (NestJS) | Go |
| --- | --- | --- | --- |
| Admin panel tez yaratish | Kuchli (Django Admin) | O'rta | Zaif |
| Mahalliy bozorda dasturchi topish | Yuqori | Yuqori | O'rta |
| Unumdorlik | Yetarli | Yetarli | Yuqori |
| PostGIS bilan ishlash | GeoDjango | TypeORM/Prisma + SQL | SQL |
| Frontend bilan til birligi | Yo'q | Bor (TypeScript) | Yo'q |

## Tavsiya

Python 3.12 + Django/DRF (ichki admin va GeoDjango tufayli MVP tezroq), vitrina uchun Next.js, panellar uchun React. Jamoa asosan TypeScript bilan ishlasa — NestJS tanlanadi. Yakuniy tanlov jamoa tarkibiga qarab qayd etiladi.
