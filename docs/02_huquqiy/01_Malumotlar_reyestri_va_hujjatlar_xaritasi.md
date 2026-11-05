# Ma'lumotlar reyestri, oferta va roziliklar

Nov 5, 2026 · @Khikmatullo

Platformada 6 ta taraf bor: xaridor, do'kon (kompaniya), do'kon xodimi, kuryer, AI agent va platformaning o'zi. Har biri ro'yxatdan o'tishda o'ziga tegishli ofertani qabul qiladi va kerakli roziliklarni beradi. Har qabul versiya, vaqt va kanal bilan jurnalga yoziladi.

## Xulosa

- **Shartnoma ommaviy oferta orqali tuziladi.** Elektron tijorat to'g'risidagi qonun (ZRU-792) bo'yicha akseptning uch shakli bor: elektron raqamli imzo (ERI), rozilikni bildiruvchi elektron xabar yoki shartni bajarish. Xaridor uchun — telefon va SMS kod bilan belgi. Do'kon uchun — E-IMZO orqali ERI.
- **Rozilik ofertadan alohida olinadi.** Shaxsiy ma'lumotlar to'g'risidagi qonun bo'yicha rozilikda operator, maqsadlar, ma'lumotlar ro'yxati, muddat va uchinchi tomonga yoki xorijga uzatish ko'rsatiladi. Yangi maqsad uchun yangi rozilik olinadi.
- **Har bir taraf haqidagi ma'lumot to'liq reyestrga kiritilgan** — jami 7 guruh, 59 ta ma'lumot turi. Har biriga maqsad, huquqiy asos, saqlash muddati va kim ko'rishi yozilgan.
- **Do'kon va platforma o'rtasida ma'lumot qayta ishlash kelishuvi (DPA) tuziladi.** Xaridorga sotuvchi — do'kon; platforma esa do'kon nomidan va o'z xizmati uchun ma'lumotni qayta ishlaydi.
- **Kuryer** — mehnat yoki fuqarolik-huquqiy shartnoma bilan, jumladan o'zini o'zi band qilgan shaxs sifatida. 2025-yilgi kuryer qoidasi bo'yicha naqd qabul qilinganda chek majburiy va kuryer mijoz ma'lumotini uchinchi shaxsga bermaydi.
- **Matnlar yurist uchun loyiha.** Bu hujjat huquqiy maslahat emas: ishga tushirishdan oldin O'zbekiston yuristi tekshiradi va rus tiliga tarjima qilinadi.

## Hujjatlar xaritasi

13 ta hujjat bor; har taraf faqat o'ziga tegishlisini, aynan kerakli bosqichda qabul qiladi. Oferta loyihalari keyingi tablarda.

| # | Taraf | Hujjat | Qachon qabul qilinadi | Akcept usuli | Majburiy |
| --- | --- | --- | --- | --- | --- |
| 1 | Xaridor | Xaridor ofertasi (do'kon va platforma bilan) | Ro'yxatdan o'tish, birinchi buyurtmadan oldin | Telefon + SMS kod va belgi | Ha |
| 2 | Xaridor | Maxfiylik siyosati | Ro'yxatdan o'tish | Tanishib chiqdim belgisi | Ha |
| 3 | Xaridor | Xizmat ko'rsatish uchun ma'lumot roziligi | Ro'yxatdan o'tish | Alohida belgi | Ha |
| 4 | Xaridor | Marketing xabarlari roziligi | Ro'yxatdan o'tish yoki keyin | Alohida belgi | Yo'q |
| 5 | Xaridor | Reklama platformalariga (xorijga) uzatish roziligi | Ro'yxatdan o'tish yoki keyin | Alohida belgi | Yo'q |
| 6 | Xaridor | Sog'liq va parhez ma'lumoti roziligi (yozma) | AI profili to'ldirilganda | SMS kod bilan tasdiq | Yo'q |
| 7 | Xaridor | AI agentga ruxsat | Agent ulanganda | OAuth ekranida tanlov | Yo'q |
| 8 | Do'kon (kompaniya) | SaaS litsenziya ofertasi (tarif, SLA, to'lov) | Ro'yxatdan o'tish, KYC bosqichi | E-IMZO (ERI) | Ha |
| 9 | Do'kon | Ma'lumot qayta ishlash kelishuvi (DPA) | Oferta bilan birga | E-IMZO (ERI) | Ha |
| 10 | Do'kon | Rahbar va mas'ul shaxs ma'lumotlari roziligi | KYC | SMS kod | Ha |
| 11 | Do'kon xodimi | Panel foydalanish qoidalari va rozilik | Birinchi kirish | SMS kod va belgi | Ha |
| 12 | Kuryer | Kuryer shartnomasi (do'kon bilan) + ilova qoidalari (platforma bilan) | Ishga qabul | E-IMZO yoki SMS kod | Ha |
| 13 | Kuryer | Geolokatsiya roziligi (faqat smena vaqtida) | Birinchi smena | Ilova ruxsati + belgi | Ha |

Har hujjatning versiyasi bor (masalan, v1.0, 2026-12-01). Mazmun o'zgarsa, tarafga 10 kun oldin xabar beriladi va keyingi kirishda yangi versiya qayta qabul qilinadi.

## Reyestr: xaridor

Xaridor haqida 28 turdagi ma'lumot yig'iladi. "Asos" ustunida: **S** — shartnoma (oferta) bajarish, **Q** — qonun talabi, **R** — alohida rozilik.

| # | Ma'lumot | Misol | Maqsad | Asos | Saqlash | Kim ko'radi |
| --- | --- | --- | --- | --- | --- | --- |
| X1 | Telefon raqami | +998 90 \*\*\* 45 12 | Kirish, buyurtma, kuryer aloqasi | S | Hisob yopilguncha + 1 yil | Do'kon, kuryer (topshirilguncha, yashirin qo'ng'iroq) |
| X2 | Ism | Bekzod | Murojaat, kuryer | S | Hisob bilan | Do'kon, kuryer |
| X3 | Telegram ID | 5xxxxxxxx | Kirish, xabarlar | S | Hisob bilan | Tizim |
| X4 | Til | uz / ru | Interfeys, xabar | S | Hisob bilan | Tizim |
| X5 | Tug'ilgan yil (ixtiyoriy) | 1990 | Yoshga oid cheklov, segment | R | Hisob bilan | Tahlil (jamlangan) |
| X6 | Manzillar va koordinata | Mustaqillik 12, 3-podyezd | Yetkazish, zona | S | Hisob bilan | Do'kon, kuryer |
| X7 | Kirish izohi | qavat, domofon | Yetkazish | S | Hisob bilan | Kuryer |
| X8 | To'lov tokeni va karta maskasi | Humo •••• 4417 | Tez to'lov | S | Karta o'chirilguncha | Tizim (raqam provayderda) |
| X9 | To'lovlar tarixi | summa, usul, holat | Hisob-kitob, qaytarish | S, Q | 5 yil (soliq) | Do'kon, moliya |
| X10 | Fiskal cheklar | MXIK, summa | Soliq | Q | 5 yil | Do'kon, soliq organi |
| X11 | Buyurtmalar tarixi | A-104512, mahsulotlar | Bajarish, qayta buyurtma | S | 5 yil | Do'kon |
| X12 | Muqobil afzalliklari | "faqat shu brend" | Yig'ish | S | Hisob bilan | Do'kon |
| X13 | Ball va kuponlar | 14 820 ball | Sodiqlik | S | 90 kun (ball), hisob bilan | Do'kon |
| X14 | Qidiruv va ko'rishlar | "сут", Tvorog 9% | Xizmatni yaxshilash, tavsiya | R (xizmat roziligi) | 24 oy | Tahlil (ichki) |
| X15 | Savat va tashlab ketish | 3 mahsulot | Eslatma, tahlil | R | 24 oy | Tahlil |
| X16 | "Nima to'xtatdi?" javoblari | "yetkazish qimmat" | Tahlil | R | 24 oy | Tahlil (jamlangan) |
| X17 | Sessiya yozuvi (yashirilgan) | bosish, aylantirish | Muammolarni topish | R | 30 kun | Mahsulot jamoasi |
| X18 | AI profili | oila 4 kishi, sevimli brendlar | Shaxsiylashtirish | R | Hisob bilan | Tizim |
| X19 | Sog'liq va parhez | laktozasiz, allergiya | Filtr, ogohlantirish | R (yozma) | Rozilik qaytarilguncha | Faqat tizim (shifrlangan) |
| X20 | Sharh, baho, surat | ★ 5, "tez" | Reyting | S | Hisob bilan | Hammaga (ism qisqartirilgan) |
| X21 | Murojaatlar va yozishma | "non ezilgan" | Qo'llab-quvvatlash | S | 3 yil | Do'kon, operator |
| X22 | AI chat yozishmalari | "palov 6 kishiga" | Savat tayyorlash, sifat | R | 12 oy | Tahlil (anonim) |
| X23 | Kuryerning xaridor haqidagi bahosi | "manzil aniq emas" | Yetkazish sifati | S | 12 oy | Ichki (xaridorga ko'rinmaydi) |
| X24 | Marketing roziligi va kanal | Telegram ✓, SMS ✗ | Xabar yuborish | R | Rozilik jurnali 5 yil | Marketing |
| X25 | Reklama identifikatorlari (xeshlangan) | Meta, Google | Retargeting, o'lchash | R (xorijga uzatish) | 180 kun | Marketing |
| X26 | Qurilma va texnik ma'lumot | IP, model, ilova versiyasi | Xavfsizlik, firibgarlik | S | 12 oy | Xavfsizlik |
| X27 | Ulangan AI agentlar va ruxsatlar | "Mening yordamchim", limit | Agent buyurtmasi | R | Ulanish uzilguncha + jurnal 5 yil | Tizim |
| X28 | Hisoblangan ko'rsatkichlar | segment, CLV, ketish xavfi | Ichki qaror | R (xizmat roziligi) | 24 oy | Tahlil (ichki) |

## Reyestr: do'kon (kompaniya) va uning xodimlari

Kompaniya ma'lumotining ko'pi shaxsiy ma'lumot emas, lekin tijorat siri hisoblanadi; rahbar va xodimlar ma'lumoti esa shaxsiy ma'lumot. Ikkalasi ham himoyalanadi.

### Kompaniya

| # | Ma'lumot | Misol | Maqsad | Asos | Saqlash | Kim ko'radi |
| --- | --- | --- | --- | --- | --- | --- |
| K1 | Yuridik nom, STIR, OKED, ro'yxatdan o'tgan sana | "Yashil Savat" MChJ | KYC, shartnoma, hisob-faktura | S, Q | Shartnoma + 5 yil | Platforma moliya, admin |
| K2 | Yuridik va faoliyat manzillari, filiallar | Toshkent, Yunusobod | Zona, KYC | S | Shartnoma + 5 yil | Admin |
| K3 | Bank rekvizitlari (hisob, MFO) | 2020 8000 •••• 4512 | Obuna, payout nazorati | S, Q | Shartnoma + 5 yil | Moliya |
| K4 | Litsenziya va ruxsatnomalar | savdo, sanitariya | KYC, tekshiruv | Q | Amal qilish muddati + 5 yil | Admin |
| K5 | QQS to'lovchi holati, onlayn-kassa | QQS bor / yo'q | Chek, hisob-faktura | Q | 5 yil | Moliya |
| K6 | To'lov provayderlari ulanishi | Payme merchant ID, kalit (shifrlangan) | To'lov qabul qilish | S | Ulanish davomida | Tizim (kalit faqat vault'da) |
| K7 | Katalog, narx, qoldiq, MXIK | 1 248 mahsulot | Vitrina, chek | S | Shartnoma davomida + 1 yil | Xaridorlar (vitrina), do'kon |
| K8 | POS, ERP, CRM integratsiya ma'lumotlari | Billz kaliti, sinxron jurnali | Qoldiq, chek | S | Ulanish davomida | Tizim |
| K9 | Savdo va moliya ko'rsatkichlari | 132,6 mln so'm, 2 070 buyurtma | Do'kon hisoboti, obuna | S | 5 yil | Do'kon, platforma (jamlangan) |
| K10 | Reyting, ishonch indeksi, sharhlar | 4,72, indeks 88 | Vitrina, nazorat | S | Shartnoma davomida | Xaridorlar (reyting), admin |
| K11 | Obuna, tarif, to'lovlar, qarzdorlik | Biznes tarifi | Billing | S, Q | 5 yil | Moliya |
| K12 | Do'kon xaridorlari bazasi | 1 482 sodiqlik a'zosi | Do'konning o'z marketingi | DPA (do'kon — operator) | DPA bo'yicha | Faqat shu do'kon |

### Rahbar va xodimlar

| # | Ma'lumot | Misol | Maqsad | Asos | Saqlash | Kim ko'radi |
| --- | --- | --- | --- | --- | --- | --- |
| K13 | Rahbar F.I.Sh., lavozim, telefon | direktor | Shartnoma, KYC | S, R | Shartnoma + 5 yil | Admin |
| K14 | Rahbar shaxsini tasdiqlovchi hujjat ma'lumoti (JShShIR) | pasport rekvizitlari | KYC | Q, R | Shartnoma + 5 yil | Admin (cheklangan) |
| K15 | Xodim F.I.Sh., telefon, rol | Gulnora, yig'uvchi | Panelga kirish | S, R | Ishdan ketgandan keyin 1 yil | Do'kon menejeri |
| K16 | Xodim ish ko'rsatkichlari | yig'ish vaqti, xato ulushi | Sifat, o'qitish | R | 12 oy | Do'kon menejeri, xodimning o'zi |
| K17 | Ko'nikmalar va sertifikatlar | 3-daraja | O'qitish, ustuvorlik | R | Ishdan ketgandan keyin 1 yil | Do'kon menejeri, xodim |
| K18 | Panel harakatlari jurnali | narx o'zgartirdi 14:02 | Audit, xavfsizlik | S, Q | 3 yil | Do'kon egasi, admin |

## Reyestr: kuryer, AI agent, hamkorlar va platforma

| # | Taraf | Ma'lumot | Maqsad | Asos | Saqlash | Kim ko'radi |
| --- | --- | --- | --- | --- | --- | --- |
| Q1 | Kuryer | F.I.Sh., telefon, surat (profil uchun, yuzni tanish yo'q) | Shartnoma, xaridorga ko'rsatish | S, R | Shartnoma + 1 yil | Do'kon, xaridor (ism va surat) |
| Q2 | Kuryer | Pasport, JShShIR, o'zini o'zi band qilganlik guvohnomasi | Shartnoma, soliq | Q | Shartnoma + 5 yil | Do'kon, moliya |
| Q3 | Kuryer | Haydovchilik guvohnomasi, transport turi va raqami | Xavfsizlik | S, Q | Shartnoma + 1 yil | Do'kon |
| Q4 | Kuryer | GPS treklar (faqat smena vaqtida) | Yetkazish, ETA, xaridorga xarita | S, R | 90 kun (xom), keyin jamlangan | Dispetcher; xaridor faqat o'z buyurtmasida |
| Q5 | Kuryer | Naqd balans, inkassatsiya | Kassa | S, Q | 5 yil | Do'kon moliya |
| Q6 | Kuryer | Reyting, izohlar, indeks | Sifat | S | Shartnoma + 1 yil | Do'kon, kuryerning o'zi |
| Q7 | Kuryer | Daromad va to'lovlar | Hisob-kitob, soliq agenti (yillik daromad 100 mln so'mdan oshsa) | Q | 5 yil | Moliya |
| A1 | AI agent | Agent nomi, egasi, ruxsatlar, limit | Ruxsat nazorati | R (xaridor ruxsati) | Uzilgunicha + jurnal 5 yil | Tizim |
| A2 | AI agent | Agent so'rovlari jurnali | Audit, firibgarlik | S | 12 oy | Xavfsizlik |
| H1 | To'lov provayderi | Tranzaksiya ID, holat | Solishtirish | S | 5 yil | Moliya |
| H2 | Reklama platformalari | Jamlangan hisobot, xeshlangan hodisalar | O'lchash | R | 180 kun | Marketing |
| H3 | Ishlab chiqaruvchilar (v2) | Faqat anonim jamlangan talab hisoboti | Retail media | Shaxsiy ma'lumot emas | — | Hamkor |
| P1 | Platforma xodimlari | Kirish huquqlari, harakatlar jurnali | Ichki nazorat | S, Q | 3 yil | Xavfsizlik, DPO |

Kuryer yuz surati faqat profil rasmi sifatida saqlanadi. Yuzni tanish ishlatilmaydi, chunki bu biometrik ma'lumot va qat'iy talablarga tushadi (O'zbekistonda saqlash, yozma rozilik, maxsus himoya).

## Rozilik matritsasi

Majburiy rozilik bo'lmasa, xizmat ishlamaydi; ixtiyoriy roziliksiz xizmat to'liq ishlaydi, faqat tegishli funksiya o'chadi. Rozilik istalgan vaqtda qaytarib olinadi va qayta ishlash 24 soat ichida to'xtatiladi.

| Rozilik | Kim beradi | Majburiy | Qaysi ma'lumot (reyestr) | Qaytarib olinsa nima bo'ladi |
| --- | --- | --- | --- | --- |
| Xizmat ko'rsatish | Xaridor | Ha | X1–X16, X20–X21, X23, X26, X28 | Hisob yopiladi; cheklar va to'lovlar qonun bo'yicha 5 yil saqlanadi |
| Marketing xabarlari | Xaridor | Yo'q | X24 | Aksiya va eslatma xabarlari to'xtaydi; buyurtma xabarlari davom etadi |
| Reklama platformalari (xorijga uzatish) | Xaridor | Yo'q | X25 | Meta va Google'ga hodisa yuborilmaydi; eski identifikatorlar o'chiriladi |
| Sessiya yozuvi | Xaridor | Yo'q | X17 | Yozuv o'chiriladi, keyingisi yozilmaydi |
| AI profili va AI chat | Xaridor | Yo'q | X18, X22 | Shaxsiylashtirish umumiy tavsiyaga o'tadi |
| Sog'liq va parhez (yozma) | Xaridor | Yo'q | X19 | Ma'lumot o'chiriladi, filtr va ogohlantirish ishlamaydi |
| AI agent ruxsati | Xaridor | Yo'q | X27, A1–A2 | Agent uziladi, token bekor qilinadi |
| Rahbar ma'lumotlari | Do'kon rahbari | Ha | K13–K14 | Yangi mas'ul shaxs ko'rsatilmaguncha hisob to'xtatiladi |
| Xodim ma'lumotlari va ko'rsatkichlari | Do'kon xodimi | Ha (panel uchun) | K15–K18 | Panelga kirish yopiladi |
| Geolokatsiya (smena vaqtida) | Kuryer | Ha (smena uchun) | Q4 | Smena boshlanmaydi; smenadan tashqari GPS hech qachon yig'ilmaydi |
| Kuryer profili va surati | Kuryer | Ha | Q1 | Shartnoma bo'yicha ishlash to'xtaydi |

Bolalar: platformadan 18 yoshga to'lganlar foydalanadi; yoshroq foydalanuvchi ota-ona yoki vasiy roziligi bilan ishlaydi.

## Qabul qilish va hisobga olish

Har akcept va rozilik o'zgarmas yozuv sifatida saqlanadi; uni hech kim, hatto admin ham, tahrirlay olmaydi.

**Har bir yozuvda:** taraf ID, hujjat turi va versiyasi, matn xeshi, harakat (qabul / rad / qaytarib olish), sana va vaqt (UTC), kanal (ilova, vitrina, Telegram, panel), IP va qurilma, tasdiq usuli (SMS kod, E-IMZO, belgi), til (uz/ru).

**Jarayon:**

1. Ro'yxatdan o'tishda majburiy hujjatlar bitta ekranda, har biri alohida belgi bilan; to'liq matn bir bosishda ochiladi.
2. Ixtiyoriy roziliklar alohida va oldindan belgilanmagan holda taklif qilinadi.
3. Tasdiq: xaridor — SMS kod; do'kon — E-IMZO; kuryer — E-IMZO yoki SMS kod.
4. Yozuv jurnalga tushadi, tarafga Telegram yoki email orqali nusxa (PDF) yuboriladi.
5. Hujjat yangilansa: 10 kun oldin xabar, keyingi kirishda yangi versiyani qabul qilish ekrani.
6. Rozilik qaytarib olinsa: 24 soatda qayta ishlash to'xtaydi, bog'liq tizimlarga (Meta, Google) o'chirish so'rovi ketadi.
7. Saqlash muddati tugagan ma'lumot har kuni avtomatik o'chiriladi yoki anonimlashtiriladi; jarayon jurnalga yoziladi.

**Mijoz so'rovlari (huquqlar):**

| So'rov | Qayerdan | Javob muddati | Kim bajaradi |
| --- | --- | --- | --- |
| Ma'lumotlarimni olish | Ilova: Rozilik va maxfiylik | 30 kungacha (maqsad: 7 kun) | DPO + tizim |
| Tuzatish | Ilova, operator | 3 ish kuni | Qo'llab-quvvatlash |
| O'chirish | Ilova (2 qadamli tasdiq) | 30 kungacha | DPO; qonun bo'yicha saqlanadiganlar bundan mustasno |
| Rozilikni qaytarib olish | Ilova, bir bosishda | 24 soat | Tizim |
| Shikoyat | Telegram @yordam, 1234 | 3 ish kuni | DPO |

**Ishga tushirishdan oldin:** shaxsiy ma'lumotlar bazasini davlat reyestrida ro'yxatdan o'tkazish (ko'rib chiqish 15 kungacha), DPO tayinlash, ma'lumot sizib chiqishi bo'yicha SOP (xorijga uzatishda 24 soatda xabar, 72 soatda hisobot).

## Huquqiy asoslar va manbalar

| Hujjat | Bizga ta'siri | Manba |
| --- | --- | --- |
| "Elektron tijorat to'g'risida"gi qonun (ZRU-792, 2022-yil 29-sentabr, kuchga kirgan 2022-yil 31-dekabr) | Oferta va akseptning uch shakli; to'lov, yetkazish, qaytarish shartlari | [Gratanet](https://gratanet.com/news/uzbekistan-adopts-the-law-on-electronic-commerce-in-a-new-edition) |
| "Shaxsiy ma'lumotlar to'g'risida"gi qonun va 2026-yil martdagi o'zgartirishlar | Rozilik mazmuni, reyestr, huquqlar; mahalliy saqlash faqat biometrik va genetik ma'lumot uchun | [Legal500](https://www.legal500.com/developments/thought-leadership/personal-data-compliance-in-uzbekistan/), [Kun.uz](https://kun.uz/en/news/2026/08/04/uzbekistan-approves-49-countries-for-simplified-personal-data-transfers) |
| Elektron tijoratda kuryer xizmati tartibi to'g'risidagi nizom (2025) | Kuryer — mehnat yoki fuqarolik-huquqiy shartnoma, o'zini o'zi band qilgan ham; naqdda chek majburiy; mijoz ma'lumotini oshkor qilmaslik | [BUZB](https://buzb.uz/en/news/new-rules-for-couriers-have-been-approved-in-uzbekistan) |
| Vazirlar Mahkamasining 2025-yil 2-apreldagi 200-son qarori | Yillik daromadi 100 mln so'mdan oshgan o'zini o'zi band qilgan kuryer uchun soliq agenti | [Kun.uz](https://www.kun.uz/en/news/2025/04/04/aggregators-to-pay-taxes-on-behalf-of-self-employed-taxi-drivers-and-couriers-earning-over-100-million-uzs) |
| "Reklama to'g'risida"gi qonun (2022) | Reklama davlat tilida, narx so'mda | [Kun.uz](https://kun.uz/en/news/2022/09/09/law-on-advertising-comes-into-force-basic-rules-and-restrictions-announced) |
| Fuqarolik kodeksi (oferta va aksept) | Ommaviy oferta asoslari | Yurist lex.uz bo'yicha aniqlaydi |

Hujjat huquqiy maslahat emas. Moddalar raqami va so'nggi tahrirlar ishga tushirishdan oldin lex.uz bo'yicha yurist tomonidan tekshiriladi.
