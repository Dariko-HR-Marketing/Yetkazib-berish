# S0 sprint: spetsifikatsiya paketi (2 hafta)

Bu AI'ga beriladigan birinchi topshiriq. Har modul uchun: foydalanuvchi hikoyasi, qabul mezonlari, API, ma'lumot va testlar. Modul tayyor deyiladi — qachonki barcha mezonlar avtomatik testda yashil va inson ko'rib chiqqan.

## S0 natijasi

Monorepo, CI, staging muhiti; telefon va Telegram orqali kirish; do'kon, filial, xodim va rollar; paket va funksiya kalitlari; audit jurnali va hodisalar yozuvi. Foydalanuvchiga ko'rinadigan ekranlar: kirish, do'kon yaratish, xodim taklif qilish, paket va funksiyalar.

## 1. identity — kirish

**Hikoya:** xaridor, do'kon xodimi yoki kuryer sifatida telefon raqamim yoki Telegram orqali parolsiz kiraman.

| # | Berilgan | Qachon | Unda |
| --- | --- | --- | --- |
| I-1 | +998 bilan to'g'ri raqam | SMS kod so'raladi | 6 xonali kod yuboriladi, 5 daqiqa amal qiladi; 60 soniyada bir martadan ko'p yuborilmaydi |
| I-2 | Kod 5 marta noto'g'ri kiritildi | 6-urinish | Raqam 15 daqiqaga bloklanadi, `auth.otp_locked` hodisasi yoziladi |
| I-3 | Telegram mini-ilovadan ochildi | initData keladi | Imzo bot tokeni bilan tekshiriladi; 24 soatdan eski bo'lsa rad etiladi |
| I-4 | Yangi foydalanuvchi | birinchi kirish | Oferta va maxfiylik siyosati versiyasi bilan akcept so'raladi va `consents` ga yoziladi |
| I-5 | Egasi, buxgalter yoki admin roli | kirish | Ikkinchi omil (TOTP yoki Telegram tasdiq) majburiy |
| I-6 | Sessiya | 30 kun faolsiz | Sessiya tugaydi; kirish tokeni 15 daqiqa, yangilash tokeni aylanib turadi |

**API:** `POST /v1/auth/otp/request`, `POST /v1/auth/otp/verify`, `POST /v1/auth/telegram`, `POST /v1/auth/refresh`, `POST /v1/auth/logout`, `GET /v1/me`.

## 2. tenancy — do'kon, filial, xodimlar

**Hikoya:** egasi sifatida do'konimni yarataman, filial qo'shaman va xodimlarni rol bilan taklif qilaman.

| # | Berilgan | Qachon | Unda |
| --- | --- | --- | --- |
| T-1 | Kirgan foydalanuvchi | do'kon yaratadi (nom, STIR) | Tenant “qoralama” holatida, foydalanuvchi “egasi”, paket Start |
| T-2 | STIR 9 raqam emas | saqlash | `validation.tin_invalid` xatosi uz/ru |
| T-3 | Egasi | xodimni telefon va rol bilan taklif qiladi | Taklif SMS/Telegram bilan ketadi, 72 soat amal qiladi |
| T-4 | A do'kon xodimi | B do'kon ma'lumotini so'raydi | 404 (mavjudligi ham oshkor qilinmaydi); RLS testida tekshiriladi |
| T-5 | Paket limiti 3 xodim | 4-taklif | `plan.limit_reached` va paketni oshirish taklifi |
| T-6 | Rol o'zgartirildi | darhol | Keyingi so'rovda yangi ruxsatlar amal qiladi, audit yozuvi bor |

**Rollar (v1, 8 ta):** egasi (owner), menejer (manager), dispetcher (dispatcher), yig'uvchi (picker), kassir (cashier), buxgalter (accountant), marketolog (marketer) — panel rollari; kuryer (courier) — kuryer ilovasi roli. Ruxsatlar matritsasi: `05_spetsifikatsiya_json/roles_permissions.json`. **API:** `POST /v1/tenants`, `PATCH /v1/tenants/{id}`, `POST /v1/branches`, `POST /v1/invites`, `POST /v1/invites/{token}/accept`, `GET/PATCH /v1/members`.

## 3. plans-flags — paketlar va kalitlar

**Hikoya:** egasi sifatida paketimdagi funksiyalarni o'zim yoqaman; admin sifatida paket tarkibini o'zgartiraman.

| # | Berilgan | Qachon | Unda |
| --- | --- | --- | --- |
| F-1 | Kalit platformada o'chirilgan | har qanday do'kon | `can()` = yo'q (avariya o'chirgichi) |
| F-2 | Kalit paketda yo'q | egasi yoqmoqchi | 403 `feature.not_in_plan`, interfeysda qulf va paket nomi |
| F-3 | Kalit paketda bor | egasi o'chiradi | `can()` 60 soniya ichida yo'q qaytaradi (kesh bekor qilinadi) |
| F-4 | Admin yangi paket versiyasini chop etdi | funksiya olib tashlangan | Mavjud do'konlarga 30 kunlik ogohlantirish, eski shartlar muddat oxirigacha |
| F-5 | `payment.cash` yoqilgan, `delivery.own_couriers` o'chirilgan | saqlash | Rad etiladi: naqd faqat o'z kuryerlari bilan (bog'liqlik qoidasi) |
| F-6 | Har o'zgarish | — | `feature.toggled` hodisasi va audit yozuvi |

**API:** `GET /v1/features` (joriy do'kon uchun hisoblangan ro'yxat), `PATCH /v1/features/{key}`, admin: `GET/POST /v1/admin/plans`, `POST /v1/admin/plans/{id}/publish`.

## 4. audit-events — jurnal va hodisalar

| # | Talab |
| --- | --- |
| A-1 | Pul, rol, kalit, rozilik, narx o'zgarishi — audit jurnaliga: kim, nima, oldin/keyin, IP, vaqt; o'zgartirib bo'lmaydi |
| A-2 | Hodisalar `events` jadvaliga va navbatga; sxema lug'atdagi bilan tekshiriladi, mos kelmasa rad etiladi |
| A-3 | Shaxsiy ma'lumot hodisa xususiyatlariga yozilmaydi (faqat ID) |

## 5. Hodisalar lug'ati (v1)

Nomlash: `obyekt.harakat`, o'tgan zamonda. Har hodisada: `event_id`, `ts`, `tenant_id`, `actor_id`, `source` (vitrina, katalog, telegram, agent, panel, kuryer).

| Hodisa | Asosiy xususiyatlar | Kim ishlatadi |
| --- | --- | --- |
| auth.signed\_up / auth.signed\_in | usul (sms, telegram) | voronka |
| consent.accepted / consent.revoked | hujjat, versiya, kanal | huquqiy |
| store.viewed / product.viewed | product\_id, pozitsiya | tavsiya, voronka |
| search.performed | so'rov, natija soni | “natijasiz qidiruv” |
| cart.item\_added / cart.item\_removed | product\_id, miqdor, narx | savat tahlili |
| checkout.started | summa, slot | voronka |
| order.placed | order\_id, summa, to'lov turi, kanal | asosiy KPI |
| payment.authorized / captured / failed / refunded | provayder, summa, sabab | moliya |
| order.picked | almashtirishlar, “tugadi” soni | operatsiya |
| delivery.channel\_selected | own / pool / third\_party, narx, urinish | kuryer tahlili |
| delivery.offer\_accepted / offer\_expired | courier\_id, kutish soniyalari | SLA |
| order.delivered / order.failed | vaqt, sabab | SLA |
| stock.out\_marked | product\_id, filial | qoldiq aniqligi |
| points.earned / points.spent / points.expired | ball, order\_id | sodiqlik ledgeri |
| review.submitted | shop/courier baho | reyting |
| feature.toggled / plan.changed | kalit, eski, yangi | billing |
| ai.request | xizmat, tokenlar, natija | AI xarajati |

## 6. S0 testlari (minimal)

- Har qabul mezoni uchun kamida bitta avtomatik test (I-1…A-3 = 21 ta).
- Tenant izolyatsiyasi: 2 do'kon, har jadval uchun o'zaro o'qish/yozish urinishi — hammasi rad.
- `can()` uchun jadval testi: 3 qatlam × yoqilgan/o'chirilgan = 8 holat.
- SMS provayder va Telegram — soxta (mock) xizmat bilan; staging'da haqiqiy bilan bitta tutun testi.
