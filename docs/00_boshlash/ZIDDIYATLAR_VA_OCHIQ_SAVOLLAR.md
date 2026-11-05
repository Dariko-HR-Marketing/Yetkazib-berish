# Ziddiyatlar va ochiq savollar

Arxiv yig'ilganda barcha hujjat va prototiplar o'zaro solishtirildi. Arxivda tuzatilganlari "Tuzatildi" deb belgilangan. Qolganlari qaror kutmoqda.

## A. Topilgan ziddiyatlar

| # | Qayerda | Ziddiyat | Holat / qaror |
| --- | --- | --- | --- |
| Z1 | PRD "Ishlab chiqish tartibi" ↔ S0 tab | PRD'da S0 = 1 hafta, S0 spetsifikatsiyasida "2 hafta" | **Tavsiya: 2 hafta** (monorepo, CI, kirish, tenancy, kalitlar, audit — 1 haftaga sig'maydi). Jami 18 hafta. Tasdiqlash kerak |
| Z2 | Data strategiyasi (16 hafta) ↔ PRD (17 hafta) | Joriy etish muddati har xil | PRD ustun. Data rejasi bosqichlari sprintlarga bog'lanadi: Tayyorgarlik = S0–S1, O'lchash = S2–S5, Faollashtirish = pilot |
| Z3 | Reyestr (X13), Xaridor ofertasi §8 | "Bonus" atamasi | **Tuzatildi** (arxivda "ball"). Onlayn hujjatda hali "bonus" — keyin yangilanadi |
| Z4 | S0 "Rollar (v1)" ↔ Owner-Team prototipi | S0'da operator bor, dispetcher va marketolog yo'q | **Tuzatildi**: 7 panel roli + kuryer (`roles_permissions.json`) |
| Z5 | Owner-Plan va Admin-Plans prototiplari ↔ PRD flag jadvali | Minimal paketlar farq qilgan (masalan, platforma kuryeri) | **Tuzatildi** — prototiplar PRD'ga moslandi (v70) |
| Z6 | MVP-Scope, Money-Flow, Pay-Architecture | "v2'da komissiya" deyilgan | **Tuzatildi** — komissiyasiz modelga moslandi |
| Z7 | `Owner-Billing`, `SaaS-Landing` prototiplari | Narx o'rnida `[NARX]` | Eskirgan; narxlar `Owner-Plan` va `plans.json` da |
| Z8 | PRD kirish qismi | "95 ta prototip" deyilgan, hozir 100 ta | Ma'lumot uchun; ta'siri yo'q |
| Z9 | Prototiplar ↔ Texnik spetsifikatsiya | Prototiplarda 11–12 px matn bor, spetsifikatsiyada "matn ≥ 14 px" | Production'da: mobil asosiy matn ≥ 14 px, ikkinchi darajali ≥ 12 px (`design_tokens.json`) |
| Z10 | Eski TZ paketi (`99_arxiv_eski/dariko-tz-v1.0`) | Stek tavsiyasi Python/Django, tijorat modellarida komissiya variantlari | **Eskirgan.** Yangi qarorlar: NestJS/TypeScript, komissiyasiz |
| Z11 | Eski backend (`99_arxiv_eski/dariko-platform-backend-qisman`) | Python, qisman, eski sxema | Ishlatilmaydi; tavsiya — arxivlash (foydalanuvchi roziligi kutilmoqda) |
| Z12 | PRD #32 "Integratsiyalar" | Alohida panel ekrani prototipi yo'q | `Integrations-Model` sxemasi va `Panel-Stock` asosida S1/S7 da loyihalanadi |

## B. Ochiq savollar (kodni to'xtatmaydi, lekin javob kerak)

| # | Savol | Kim | Qachongacha |
| --- | --- | --- | --- |
| O1 | Platforma kuryer xizmati operatori va soliq agenti bo'ladimi? | Yurist | S4 dan oldin |
| O2 | Ballar elektron pul hisoblanmasligi | Yurist | S6 dan oldin |
| O3 | Ofertalar, DPA, kuryer shartnomasi, maxfiylik siyosatini tasdiqlash + rus tarjimasi | Yurist | S6 dan oldin |
| O4 | Shaxsiy ma'lumotlar bazasini davlat reyestriga ro'yxatdan o'tkazish (15 kun) | Yurist / DPO | Pilotdan 1 oy oldin |
| O5 | Yandex Delivery va zaxira mahalliy hamkor bilan shartnoma | Siz | S5 dan oldin |
| O6 | Hosting: O'zbekiston DC yoki xalqaro bulut | Siz | S0 |
| O7 | Texnik mas'ul (AI kodini ko'rib chiqadigan inson) | Siz | S0 |
| O8 | Paket narxlari — 8 ta do'kon egasi bilan suhbat | Siz | S0–S1 vaqtida |
| O9 | Agregator komissiyalari (Uzum Tezkor, Yandex Eats) — ochiq manbada yo'q | Suhbatda (D-7) | S1 |
| O10 | SMS provayder (Eskiz, Play Mobile va b.) | Siz | S0 |
| O11 | Sessiya yozuvi: Microsoft Clarity yoki Yandex Metrica (Metrica ma'lumoti Rossiyada) | Yurist + siz | S2 |
| O12 | Domen, Telegram bot nomi, brend | Siz | S0 |
| O13 | Umumiy katalogda tartiblash adolatliligi (reklama va reyting og'irligi) | Qaror | S7 |

## C. S0 rejalashtirishda topilgan yangi ziddiyatlar (2026-11-05, Claude Code)

**Holat: Z13–Z20 va Z1 — tavsiya bo'yicha TASDIQLANGAN (2026-11-05) va S0'da amalga oshirilgan. Z21 (O6, O7, O10, O12) — hali ochiq.** Qarorlarning tafsiloti: `S0_HISOBOT.md` §5.

| # | Qayerda | Ziddiyat / noaniqlik | Tavsiya |
| --- | --- | --- | --- |
| Z13 | Repo ↔ CLAUDE.md §4, §9 | Repoda avvalgi topshiriq bo'yicha yozilgan **Django + vanilla JS MVP** bor (`backend/`, `frontend/`, `docker-compose.yml`, `docs/tz/`). Yangi qaror — TypeScript/NestJS monorepo; §9 Python/Django ishlatishni taqiqlaydi | Eski kodni **o'chirmasdan** `git mv` bilan `docs/99_arxiv_eski/django-mvp-2026-11-04/` ga ko'chirish (tarix va g'oyalar — idempotentlik, outbox, atomar rezerv — S3/S4 uchun ma'lumot sifatida saqlanadi), repo ildizini yangi tuzilmaga bo'shatish. Siz tasdiqlamaguncha tegmayman |
| Z14 | Eski MVP ↔ CLAUDE.md §3 (pul) | Eski MVP'da to'lov platforma orqali mock provayderda o'tadi, platforma kuryeri/naqd qoidalari D2/D3 ga mos emas, `docs/TAKLIFLAR.md` komissiyasiz modelga to'liq tayanmaydi | Z13 bilan birga arxivlanadi; `docs/HOLAT.md` va `docs/TAKLIFLAR.md` ham «eskirgan» deb belgilanadi |
| Z15 | CLAUDE.md §3 va tex. spets. §3: «har jadvalda `tenant_id` va RLS» ↔ S0 jadvallari | `users`, `plans`, `plan_features` tenantga tegishli emas; `consents` yangi foydalanuvchi uchun do'konsiz yoziladi (I-4); `events`/`audit_log` platforma darajasidagi yozuvlarni ham o'z ichiga oladi (admin, `auth.*`) | Tenantga tegishli jadvallar (`branches`, `memberships`, `tenant_features`, `invites`) — qat'iy RLS (`tenant_id = current_setting('app.tenant_id')`). Global jadvallar (`users`, `plans`, `plan_features`) — RLS yo'q, faqat servis roli yozadi. `consents`/`events`/`audit_log` — `tenant_id` NULL bo'lishi mumkin; siyosat: o'z tenanti yoki NULL+platforma konteksti. Bu 1-bandning istisnosi, tasdiq kerak |
| Z16 | S0 `branches` (geo, zona) ↔ ish muhiti | PostGIS S0'da kerakmi? Hozirgi ish muhitimda Docker ham, PostGIS ham yo'q (oddiy PostgreSQL 16 bor); RLS testlarini haqiqiy PostgreSQL'da yuritaman, lekin PostGIS'li migratsiyani faqat CI (service container `postgis/postgis:16`) tekshira oladi | **(a, tavsiya):** S0'da `branches` da `lat/lng` + `zone_geojson jsonb`, PostGIS kengaytmasi S4 (zona, dispetcher) bilan kiritiladi. (b): S0'dan PostGIS — bunda migratsiya lokalda tekshirilmaydi, faqat CI'da |
| Z17 | T-5 «paket limiti 3 xodim» ↔ `plans.json` (`staff: 3`) | Egasi o'zi limitga kiradimi? | Tavsiya: **kiradi** (faol `memberships` soni, egasi bilan). Boshqacha bo'lsa — ayting |
| Z18 | I-5 ↔ Start paketi | Har do'kon egasi uchun 2FA majburiy; «Telegram tasdiq» usuli bot tokeni (O12) va bot bilan bog'langan akkauntni talab qiladi | S0'da faqat **TOTP** (Telegram tasdiq — bot tayyor bo'lgach, S2). Egasi birinchi kirishda TOTP sozlaydi |
| Z19 | `feature_flags.json`: `loyalty.gift_cards.min_plan = "v2"` | `"v2"` `plan_order` da yo'q | Tavsiya: har qanday paketda `can()` = yo'q (faqat platforma darajasida yoqiladi, hozir yoqilmaydi) |
| Z20 | `events.json` `auth.otp_locked` ↔ S0 hodisalar jadvali | Jadvalda yo'q, faqat I-2 da eslatilgan; xususiyat `telefon_hash` — CLAUDE.md §3 «faqat ID» | `events.json` ustun. Xesh — HMAC-SHA256 + maxfiy «pepper» (oddiy SHA qaytariladigan: raqam maydoni kichik) |
| Z21 | README «boshlashdan oldin» ↔ ochiq savollar | **Z1** (S0 = 2 hafta), **O6** (hosting), **O7** (texnik mas'ul — identity/ruxsat kodini ko'radigan inson), **O10** (SMS provayder), **O12** (domen, bot nomi) javobsiz | Kod uchun O6/O10/O12 bloker emas (mock + `.env.example`), lekin staging'ga chiqish uchun kerak. **O7 DoD'ning bir qismi** — usiz S0 «tayyor» bo'lmaydi |
