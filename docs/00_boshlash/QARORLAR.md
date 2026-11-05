# Qabul qilingan qarorlar (2026-11-05 holatiga)

Raqamlash PRD bilan bir xil (Q1–Q8). Qo'shimcha qarorlar D- bilan belgilangan.

| # | Qaror | Oqibati |
| --- | --- | --- |
| Q1 | **Gibrid model**: har do'konning o'z vitrinasi + platformaning umumiy katalogi | Xaridor uch yo'l bilan keladi; do'kon katalogga chiqishni o'zi yoqadi (Biznes paketidan) |
| Q2 | **Komissiya yo'q**: daromad — paketlar va qo'shimcha xizmatlar | Xaridor puli platformadan o'tmaydi; to'lov agenti litsenziyasi kerak emas |
| Q3 | **Har funksiya yoqiladi/o'chiriladi** — platforma, paket va do'kon darajasida | Bitta kod, turli do'konlar uchun turli imkoniyat (`feature_flags.json`) |
| Q4 | **3 kuryer kanali**: o'z kuryeri → platforma puli → tashqi API (Yandex Delivery va b.) | Kuryeri yo'q do'kon ham ishlaydi; o'zi olib ketish — v2 |
| Q5 | **Kanallar**: Telegram mini-ilova + veb (bitta Next.js kodi) | iOS/Android xaridor ilovasi — v2; kuryer — React Native Android (fonda GPS uchun) |
| Q6 | **Kodni AI yozadi**: spetsifikatsiya → testlar → AI kod → avtomatik tekshiruv → inson ko'rib chiqishi | Stek, modullar, qabul mezonlari va testlar aniq yozilgan bo'lishi shart |
| Q7 | **MVP**: faqat O'zbekiston, o'zbek (lotin) va rus tillari | Xalqaro chiqish — v2/v3 (`Expansion` sxemasi) |
| Q8 | **Paket narxlari — gipoteza**: Start 0, Biznes 590 000, Pro 1 290 000, Tarmoq 3 mln+ so'm/oy | Narxlar konfiguratsiyada; pilot va suhbatlarda tekshiriladi |
| D1 | Qo'shimcha xizmatlar: platforma kuryeri 12 000 so'm (≤3 km) + 2 000/km; tashqi xizmat tarif +5%; SMS operator narxi +10%; MXIK to'ldirish 500 so'm/mahsulot; integratsiya 1 mln+ | `plans.json` |
| D2 | Naqd faqat o'z kuryeri bilan; platforma va tashqi kanal — faqat oldindan to'langan buyurtma | `courier_dispatch_rules.json` |
| D3 | **Pilotda platforma kuryerlar puli o'chiq** (yurist xulosasigacha): zanjir o'z kuryeri → tashqi xizmat | Platforma darajasidagi flag |
| D4 | Ball: 1 ball = 1 so'm, naqdga chiqmaydi, o'tkazilmaydi, 90 kun, chekning 30% gacha, 24 soat kutish, faqat pul bilan to'langan qismga hisoblanadi | `loyalty_rules.json` |
| D5 | Atama: xaridor uchun **"ball"**; "bonus" — faqat kuryer to'lov koeffitsienti | Barcha matnlar shunga mos |
| D6 | Mijoz ma'lumoti faqat ichki tahlil uchun; xaridor analitika ko'rmaydi | Mijoz 360 — faqat panel/ichki |
| D7 | Asosiy baza O'zbekistonda (bizning tanlov; 2026-yil martidan qonun faqat biometrik/genetik ma'lumot uchun talab qiladi) | Hosting tanlovi ochiq |
| D8 | Panel rollari (7): egasi, menejer, yig'uvchi, kassir, dispetcher, buxgalter, marketolog + kuryer (ilova) | `roles_permissions.json` |
| D9 | Pilot: 20 do'kon, Chilonzor va Yunusobod, 8 hafta, 6 ta muvaffaqiyat mezoni | `01_prd/05_Suhbat_va_pilot.md` |
| D10 | Ishlab chiqish: 9 sprint, 17 hafta (S0 — 1 hafta asos + 8 × 2 hafta) | PRD "Ishlab chiqish tartibi" |

## Havolalar (onlayn, tahrirlanadigan versiyalar)

- PRD v1 (5 tab): https://claude.ai/artifact/9ffVoo46ox8PiK4udWcNmc
- Holat hisoboti: https://claude.ai/artifact/NE35nbjMqWZeGWHZXfYvzo
- UX prototip (interaktiv): https://claude.ai/artifact/6gAzZYgso9FUAZ6khmEcYy
- Ma'lumotlar reyestri, oferta va roziliklar: https://claude.ai/artifact/CPxuJwSJJvWVLwXrCtaGwK
- Mijoz ma'lumotlari, 33 kompaniya, data strategiyasi: https://claude.ai/artifact/9bJztAUWEi2vobACWRM4E2

Havolalar shaxsiy — boshqalar ochishi uchun egasi "Share" orqali ulashishi kerak.
