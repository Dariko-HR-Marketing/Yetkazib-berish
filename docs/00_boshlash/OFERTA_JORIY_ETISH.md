# Oferta va rozilik hujjatlarini joriy etish (S0 doirasida)

Holat: **mexanizm tayyor va testlangan; matnlar hali kuchga kirmagan** (yurist tasdig'i, rekvizitlar, rus tarjimasi — O3 kutilmoqda).

## Qanday ishlaydi

| Qatlam | Nima |
| --- | --- |
| Manba matnlar | `infra/seed/legal/<kalit>.<til>.md` (git'da; yurist PR orqali tahrirlaydi). Kalitlar: `customer_offer`, `privacy_policy`, `shop_saas_offer`, `shop_dpa`, `courier_agreement` |
| Versiyalash | Fayl mazmuni o'zgarsa, `pnpm db:migrate` yangi **qoralama** versiya (v+1) yaratadi. Matn bazada o'zgarmas (trigger); xesh `sha256(matn)` |
| Kuchga kiritish | Faqat platforma admini (TOTP bilan): `POST /v1/admin/legal/{id}/publish`. **To'ldirilmagan joylar (`\[...\]`) qolsa 422 `legal.placeholders_remain`.** Oldingi amaldagi versiya «eskirgan» bo'ladi, bitta tilda faqat bitta amaldagi versiya |
| Yangi matn (bazadan, faylsiz) | `POST /v1/admin/legal` (qoralama) → `publish` |
| Productionda qoralama | `LEGAL_ALLOW_DRAFT=off` (production'da standart): amaldagi versiya bo'lmasa ro'yxatdan o'tish `503 consent.documents_unavailable`. Staging/dev'da `on` |
| Xaridor akcepti | Birinchi kirishda oferta + maxfiylik siyosati (versiya va matn xeshi `consents` ga). **Yangi versiya chiqsa — keyingi kirishda faqat o'zgargan hujjat qayta so'raladi** |
| Do'kon akcepti | Do'kon yaratishda SaaS oferta + DPA (`consents.tenant_id` bilan); akceptsiz do'kon yaratilmaydi |
| Marketing | Alohida, ixtiyoriy: `PUT /v1/me/consents/marketing` (berish/qaytarib olish), hodisalar `consent.accepted/revoked` |
| Ommaviy o'qish | `GET /v1/legal/documents?audience=…`, `GET /v1/legal/documents/{kalit}?version=…`; veb: `/hujjat/<kalit>?version=` |
| Til | uz — asosiy; ru tarjimasi yo'q bo'lsa o'zbekcha ko'rsatiladi va `translated=false` (interfeysda ogohlantirish) |

## Kuchga kiritishdan oldin to'ldirilishi kerak (hozirgi qoralamalarda)

| Hujjat | To'ldirilmagan joylar |
| --- | --- |
| `customer_offer` | platforma operatori nomi va STIR; rekvizitlar (nomi, STIR, manzil, bank, aloqa) |
| `privacy_policy` | DPO F.I.Sh. va domen (dpo@…) |
| `courier_agreement` | haq stavkasi (summa), javobgarlik chegarasi (summa), shartnoma muddati |
| `shop_saas_offer`, `shop_dpa` | placeholder yo'q (lekin yurist tasdig'i kerak) |

## Tartib (tavsiya)

1. Yurist matnni tahrirlaydi → `infra/seed/legal/*.md` (rus tarjimasi: `<kalit>.ru.md`).
2. PR → `pnpm db:migrate` (staging) → admin panelda/API'da qoralama ko'rib chiqiladi.
3. `publish` (production). Audit jurnalida `legal.published` (kim, qaysi versiya, xesh).
4. Foydalanuvchilar keyingi kirishda yangi versiyani qabul qiladi; eski akceptlar tarixda qoladi.

## Hali qilinmagan (qaror/ish kerak)

- Marketing roziligi matni hujjat sifatida versiyalanmagan (xesh vaqtincha `marketing@1`) — yurist matnini bering.
- Kuryer shartnomasi akcepti (kuryer ilovasi S4) va do'kon KYC/E-IMZO bilan imzolash (Onboard-Shop 4-qadam) — S0 dan tashqarida; hozir do'kon egasi belgi orqali akcept qiladi (elektron akcept, SMS orqali kirgan va TOTP bilan himoyalangan egasi).
- Admin interfeysi (panel) hujjatlar uchun yo'q — hozircha API orqali.
