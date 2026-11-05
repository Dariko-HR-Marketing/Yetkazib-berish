# Yetkazib berish — universal dostavka platformasi (DARIKO)

Hamkor (do'kon, supermarket, restoran, nooziq-ovqat) uchun brendli vitrina va ish paneli, xaridor uchun yagona buyurtma yadrosi (OMS). TZ v1.0 (`docs/tz/`) asosidagi **ishlaydigan MVP**.

```
frontend/   vitrina (PWA, uz/ru) va ish paneli (hamkor, yig'uvchi, dispetcher, kuryer, yordam, moliya, admin) — build talab qilmaydi
backend/    Django 5.2 + DRF modular monolith (apps/: accounts, tenants, catalog, orders, payments, delivery, support, platform)
docs/       HOLAT.md (TZ ↔ kod), TAKLIFLAR.md (tavsiyalar), tz/ (TZ paketi: talablar, ADR, OpenAPI, sxema, backlog, QA)
scripts/    loadtest.py (AC-11)
```

## Tez ishga tushirish

**Docker bilan** (tavsiya):
```bash
cp deploy/.env.example .env      # POSTGRES_PASSWORD, JWT_SECRET ni o'zgartiring
docker compose up --build -d
docker compose exec web python manage.py seed_demo
```
Vitrina: <http://localhost:8000/?t=demo-dokon> · Panel: <http://localhost:8000/panel/> · Django Admin: `/admin/` · Swagger: <http://localhost:8081>

> Production muhitida `APP_ENV=production` bo'ladi (demo ma'lumot va sinov to'lovi o'chadi, HTTPS majburiy).

**Docker'siz** (PostgreSQL 15+ kerak):
```bash
cd backend && pip install -r requirements-dev.txt
export DATABASE_URL=postgresql://dariko:dariko@localhost:5432/dariko
python manage.py migrate && python manage.py seed_demo
python manage.py runserver            # boshqa terminalda: python manage.py worker
python -m pytest                      # 60 ta test
```

## Demo hisoblar (parol hammasida `demo12345`)

| Rol | Telefon | Nima ko'radi |
| --- | --- | --- |
| Do'kon egasi | `+998900000011` | buyurtmalar, katalog, hudud/slot, xodimlar, hisobot, yig'ish, dispetcher |
| Yig'uvchi | `+998900000012` | yig'ish navbati |
| Dispetcher | `+998900000013` | jo'natmalar, kuryer biriktirish |
| Kuryer | `+998900000014` | o'z topshiriqlari, PIN bilan topshirish |
| Yordam | `+998900000015` | murojaatlar, qaytarish so'rovi |
| Moliya | `+998900000016` | solishtiruv, qaytarishni tasdiqlash (**MFA majburiy**: birinchi kirishda sozlanadi) |
| Admin | `+998900000001` | hamkor ulash (**MFA majburiy**) |
| Kafe egasi | `+998900000021` | ikkinchi hamkor (izolyatsiyani sinash uchun) |

Xaridor: vitrinada manzilni tekshiring → savat → buyurtma (mehmon sifatida). Onlayn to'lov demo'da `localhost` da «Sinov to'lovini bajarish» tugmasi bilan (mock provayder).
Fon ishchi (`worker`): xabarnoma, taymaut, rezerv muddati, SLA, to'lov holati tekshiruvi — Docker'da avtomatik ishlaydi.

## Asosiy qarorlar

- **Atomar rezerv**: `UPDATE … WHERE available − reserved ≥ qty` — oxirgi SKU uchun raqobatda bittasi yutadi (AC-02).
- **Idempotentlik**: `POST /orders`, to'lov va qaytarish `Idempotency-Key` talab qiladi; webhook `(provider, event_id)` bo'yicha bir marta (ADR-003).
- **Outbox**: holat o'zgarishi va hodisa bitta tranzaksiyada; worker eksponensial kechikish, 10 urinishdan keyin dead-letter.
- **Tenant izolyatsiyasi** serverda: boshqa hamkor obyekti → 404 + audit. Audit jurnali o'zgarmas.
- **Pul** — tiyinda (butun son); narx va yetkazish haqi faqat serverda hisoblanadi.
- PostGIS o'rniga ilova darajasida hudud tekshiruvi (ADR-004).

## Nima tayyor, nima yo'q

`docs/HOLAT.md` da AC-01…AC-13 va FR bo'yicha halol holat jadvali. **Qisqacha:** buyurtma-to'lov-yig'ish-yetkazish-yordam-moliya yadrosi, tenant/rol xavfsizligi, OTP/MFA, CSV katalog, hisobotlar tayyor va testlangan. **Provayderga bog'liq qismlar** (Payme/Click, fiskal chek, Telegram Mini App, Yandex Maps/Delivery, POS) — interfeys tayyor, ulanish G1 qarorlarini kutadi. Tavsiyalar — `docs/TAKLIFLAR.md`.

## API

REST/JSON, `/api/v1`. Boshlang'ich shartnoma: `docs/tz/api/openapi.yaml` (TZ). Amalda qo'shimcha endpointlar bor (kuryer, moliya, katalog, hisobot) — ular `backend/config/urls.py` da; OpenAPI'ni G2 da yangilash tavsiya etiladi. Xatolar: `{"error": {"code", "message", "request_id"}}`, til `Accept-Language: uz|ru`.
