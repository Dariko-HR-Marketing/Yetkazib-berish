# ADR-001. MVP uchun modular monolith va yagona PostgreSQL

- **Holat:** Taklif qilingan
- **Sana:** 04.11.2026
- **Qaror qabul qiluvchi:** Texnik rahbar

## Kontekst

Pilot bitta shahar, 2–5 hamkor va kuniga yuzlab buyurtma bilan ishlaydi. Jamoa 5–7 dasturchidan iborat. Buyurtma, rezerv va to'lov o'rtasida kuchli tranzaksion bog'liqlik bor.

## Qaror

Backend bitta deploy qilinadigan ilova, ichida aniq chegarali modullar (`apps/*`). Modullar bir-biriga faqat ichki servis interfeysi orqali murojaat qiladi, boshqa modul jadvallariga to'g'ridan-to'g'ri yozmaydi. Barcha ma'lumot bitta PostgreSQL bazasida, tenant bo'yicha ajratilgan.

## Oqibatlar

- (+) Atomar tranzaksiyalar oddiy; deploy va kuzatuv arzon; MVP tezroq.
- (+) Keyinchalik `notifications` va `integrations` modullarini alohida servisga ajratish mumkin.
- (−) Bitta modulning yuklamasi butun ilovaga ta'sir qiladi — monitoring va gorizontal masshtablash (bir nechta instansiya) bilan yumshatiladi.
