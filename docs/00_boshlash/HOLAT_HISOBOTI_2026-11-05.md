# Loyiha holati: hisobot

Nov 5, 2026 · @Khikmatullo

## Qisqacha

Loyiha “g'oya va dizayn” bosqichidan “kod yozishga tayyor” bosqichiga o'tdi. Model hal qilindi: do'konlar uchun gibrid SaaS, savdodan komissiyasiz, har funksiya yoqiladi/o'chiriladi. AI'ga beriladigan birinchi topshiriq (S0) tayyor. **Kod yozishdan oldin bitta qadam qoldi:** 8 ta do'kon egasi bilan suhbat va yurist xulosasi. Bu ikki narsa narx va kuryer modelini tasdiqlaydi yoki o'zgartiradi.

## Nima tayyor

| Natija | Holat | Havola |
| --- | --- | --- |
| PRD v1: qarorlar, gibrid model, 21 funksiya kaliti, 4 paket, kuryer yechimi, 40 ekran, 9 sprint | Tayyor | [PRD v1](https://claude.ai/artifact/9ffVoo46ox8PiK4udWcNmc) |
| Texnik spetsifikatsiya: stek, 18 modul, ma'lumot modeli, API, tezlik, adaptivlik, xavfsizlik, testlar | Tayyor | PRD, 2-tab |
| S0 spetsifikatsiya paketi: 21 qabul mezoni, API, 18 qatorli hodisalar lug'ati | Tayyor | PRD, 3-tab |
| Raqobat va unit-iqtisodiyot | Tayyor (gipotezalar bilan) | PRD, 4-tab |
| Suhbat va pilot rejasi: savollar, 20 do'konli pilot, 6 mezon | Tayyor | PRD, 5-tab |
| UX prototip: 100 ekran + navigatsiya, 17 bo'lim | Tayyor | [Prototip](https://claude.ai/artifact/6gAzZYgso9FUAZ6khmEcYy) |
| Ma'lumotlar reyestri (59 tur), 13 hujjat, oferta va roziliklar | Qoralama, yurist kerak | [Reyestr va ofertalar](https://claude.ai/artifact/CPxuJwSJJvWVLwXrCtaGwK) |
| Mijoz ma'lumotlari, 33 kompaniya tajribasi, reklama strategiyasi, SWOT | Tayyor | [Data strategiyasi](https://claude.ai/artifact/9bJztAUWEi2vobACWRM4E2) |
| Qarorlar va havolalar “Supermarket” loyihasida | Saqlangan | claude/qarorlar-va-havolalar.md |

**Bugun tuzatildi:** prototipda xaridor uchun yagona atama — “ball” (9 ekran; kuryer to'lov koeffitsienti “bonus” bo'lib qoldi); MVP-Scope, Money-Flow va Pay-Architecture ekranlari komissiyasiz modelga moslandi (avval “v2 da komissiya” deyilgan edi).

## Avvalgi auditdagi 28 band holati

| Holat | Soni | Misollar |
| --- | --- | --- |
| Yopildi | 15 | Gibrid model, kuryer muammosi, paketlar, 95 → 40 ekran (v1), Telegram mini-ilova, atamalar, ADR/NFR/hodisalar lug'ati, unit-iqtisodiyot, raqobat, qarorlar loyihaga saqlandi |
| Qisman | 7 | Ekran holatlari (bo'sh, xato, yuklanish) — faqat ayrim ekranlarda; vizual QA; naqd fiskal chek oqimi; ballar e-pul emasligi (huquqiy asos) |
| Ochiq (sizga bog'liq) | 6 | Foydalanuvchi suhbatlari, yurist, Yandex shartnomasi, hosting, eski backend kodi taqdiri, jamoa/AI ko'rib chiquvchisi |

## Asosiy xavflar

| Xavf | Ehtimol | Ta'sir | Choralar |
| --- | --- | --- | --- |
| Do'konlar 590 000 so'mni qimmat deydi | O'rta | Yuqori | Suhbatda narx sinovi; Start bepul; birinchi oy bepul pilot |
| Platforma kuryer operatori sifatida soliq/javobgarlik | O'rta | Yuqori | Pilotda kuryerlar puli o'chiq; yurist xulosasi |
| Agregatorlar (Uzum Tezkor, Yandex) narx yoki eksklyuziv shart bilan bosim | O'rta | O'rta | Biz — qo'shimcha kanal, o'rinbosar emas; Wolt chiqishi — bitta kanalga qaramlik xavfi dalili |
| AI yozgan kodda to'lov yoki ma'lumot xatosi | O'rta | Yuqori | Testlar avval, majburiy inson ko'rib chiqishi, sandbox |
| Qoldiq noto'g'ri (“bor” deydi, aslida yo'q) | Yuqori | O'rta | “Tugadi” tugmasi, muqobil, POS integratsiya Pro'da |
| Kuryer GPS ilovasi kechikadi | O'rta | O'rta | Birinchi pilotda veb-ilova + qo'lda holat, keyin Android |

## Tavsiyalarim (ustuvorlik bo'yicha)

1. **Bu hafta: 8 ta do'kon egasi bilan suhbat** (“Suhbat va pilot” tabidagi savollar). Eng arzon va eng muhim qadam — narx va kuryer modelini tasdiqlaydi.
2. **Yurist bilan bitta uchrashuv, 3 savol:** ofertalar; ballar e-pul hisoblanmasligi; platforma kuryer xizmati bersa, kim soliq agenti.
3. **Yandex Dostavka biznes shartnomasini hozir boshlash** — jarayon uzoq, S5 sprintini to'xtatmasin.
4. **Kod uchun bitta mas'ul inson** (texnik rahbar yoki tajribali dasturchi) — AI kodni ko'rib chiqadi va birlashtiradi. Usiz “AI orqali” yondashuv xavfli.
5. **Eski backend kodini arxivlash**, yangi stek bo'yicha noldan, S0 paketidan boshlash.
6. **Shaxsiy ma'lumotlar bazasini reyestrga ro'yxatdan o'tkazish** — pilotdan oldin, 15 kunlik muddat.
7. **Domen, Telegram bot nomi va brendni band qilish** — kichik ish, lekin keyin muammo bo'lmasin.

## Keyingi 2 hafta rejasi

| Hafta | Ish | Kim |
| --- | --- | --- |
| 1 | Suhbatlar (8 do'kon, 10 xaridor, 5 kuryer); yurist uchrashuvi; Yandex bilan aloqa | Siz (savollar va xulosa — men) |
| 1 | Suhbat natijasi bo'yicha paket narxlari va PRD yangilanishi | Men |
| 2 | Repozitoriy, CI, staging; S0 kodi AI orqali; birinchi ko'rib chiqish | Texnik mas'ul + AI |
| 2 | S1 spetsifikatsiya paketi (katalog, qoldiq, import) | Men |

## Sizdan kerak bo'lgan qarorlar

- Suhbat uchun do'konlar ro'yxati (kim bilan gaplashamiz).
- Texnik mas'ul kim bo'ladi.
- Yurist va hosting tanlovi.
- Eski backend kodi: arxivlashga roziligingiz.

## Manbalar (bozor ma'lumotlari)

- [Delever: Online Delivery Market in Uzbekistan 2026](https://delever.io/en/blog/delivery-market-uzbekistan-2026)
- [Kun.uz: Wolt announces exit from Uzbekistan market](https://kun.uz/en/01543038)
- [Kun.uz: Uzum Tezkor named dominant digital platform](https://kun.uz/en/news/2025/04/02/uzum-tezkor-named-dominant-digital-platform-in-delivery-market)
- [Spot.uz: Uzum Tezkor, 2026-02-20](https://www.spot.uz/oz/2026/02/20/uzum-tezkor/)
