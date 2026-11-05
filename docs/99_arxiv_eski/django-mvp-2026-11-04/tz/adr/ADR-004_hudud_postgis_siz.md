# ADR-004. MVP'da xizmat hududi PostGIS'siz

- **Holat:** Qabul qilingan (MVP) · **Sana:** 04.11.2026

## Kontekst
`db/schema.sql` PostGIS (`geography`) ni nazarda tutadi. Pilot 1 shahar, 2–5 hamkor, har filialda bir nechta hudud — nuqta-poligon tekshiruvi so'rov boshiga o'nlab hisob-kitob.

## Qaror
Hudud `DeliveryZone` da doira (`center_lat/lng` + `radius_m`) yoki poligon (`[[lng,lat],…]`, JSON) ko'rinishida saqlanadi; tekshiruv ilovada (`apps/tenants/geo.py`: haversine va ray-casting). Bu o'rnatishni soddalashtiradi (oddiy `postgres` obrazi, GeoDjango/GDAL kerak emas).

## Oqibatlar
- (+) Infratuzilma va CI sodda; testlar tez.
- (−) Filial va hududlar soni yuzlab bo'lganda (agregator bosqichi) har so'rovda Python'da aylanish samarasiz.
- **Qaytish sharti:** ≥ 200 faol hudud yoki masofa bo'yicha saralash/marshrut kerak bo'lsa — PostGIS + GiST indeks (`ST_Contains`) ga o'tiladi; `geo.py` interfeysi (`resolve`, `zone_for`) o'zgarmaydi.
