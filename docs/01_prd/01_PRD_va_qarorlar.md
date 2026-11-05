# PRD v1: gibrid SaaS dostavka platformasi

Nov 5, 2026 · @Khikmatullo

Bu hujjat — loyihaning yagona manbai. 95 ta prototip ekrani, reyestr va ofertalar shu yerdagi qarorlarga bo'ysunadi; ziddiyat bo'lsa, shu hujjat ustun. Kod AI tomonidan modul-modul yoziladi, shuning uchun har talab qabul mezoni bilan beriladi.

## Qabul qilingan qarorlar (2026-11-05)

| # | Qaror | Oqibati |
| --- | --- | --- |
| Q1 | **Gibrid model**: har do'konning o'z vitrinasi + platformaning umumiy katalogi | Xaridor ikki yo'l bilan keladi; do'kon katalogga chiqishni o'zi yoqadi |
| Q2 | **Komissiya yo'q**; daromad — paketlar va qo'shimcha xizmatlar | Xaridor puli platformadan o'tmaydi; to'lov agenti litsenziyasi kerak emas |
| Q3 | **Har funksiya yoqiladi va o'chiriladi** (feature flag): platforma, paket va do'kon darajasida | Bitta kod — turli do'konlar uchun turli imkoniyat |
| Q4 | **3 kuryer kanali**: do'konning o'z kuryerlari, platforma kuryerlar puli, tashqi xizmatlar (API) | Kuryeri yo'q do'kon ham ishlay oladi; olib ketish — v2 |
| Q5 | **Kanallar**: Telegram mini-ilova + veb (bitta moslashuvchan kod bazasi) | iOS/Android ilovalari — v2 |
| Q6 | **Kodni AI yozadi** | Stek, modullar, qabul mezonlari va testlar aniq yozilgan bo'lishi shart |
| Q7 | MVP: faqat O'zbekiston, o'zbek (lotin) va rus tillari | Xalqaro — v2/v3 |
| Q8 | Paket narxlari — gipoteza, pilotda tekshiriladi | Narxlar kodda emas, konfiguratsiyada saqlanadi |

Avvalgi hujjatlar (reyestr, ofertalar, data strategiyasi) amalda qoladi; Q1 va Q4 sababli ofertalarga 3 ta o'zgarish kerak (8-bo'limda).

## Gibrid model

Xaridor do'konga uch yo'l bilan keladi; hammasi bitta katalog va bitta panelga tushadi. Umumiy katalog kichik do'konning eng katta muammosi — trafik yo'qligini hal qiladi.

> **Diagramma** (Mermaid versiyasi: `01_prd/06_Diagrammalar.md`): gibrid model · 3 kirish kanali, 1 do'kon

**Umumiy katalog qoidalari:** faqat Biznes va undan yuqori paketdagi, reytingi 4,0 dan yuqori va ishonch indeksi 70 dan yuqori do'konlar ko'rinadi. Tartib: masofa va yetkazish vaqti → reyting → "Reklama" belgili pullik o'rin (Pro). Xaridor bitta hisob va bitta ball hamyoni bilan bir nechta do'kondan xarid qiladi, lekin bitta savat — bitta do'kon (v1). Bir nechta do'kondan bitta savat — v2.

**Qabul mezoni:** umumiy katalogdan kelgan buyurtma do'kon panelida "Katalog" manbasi bilan belgilanadi va do'kon analitikasida alohida ko'rinadi.

## Yoqib-o'chiriladigan funksiyalar

Har funksiya uch qavatli kalit bilan boshqariladi: **platforma** (global, avariya o'chirgichi) → **paket** (do'kon tarifida bormi) → **do'kon** (egasi o'zi yoqadimi). Funksiya faqat uchala qavat ruxsat bersa ishlaydi. Har o'zgarish audit jurnaliga yoziladi.

| Kalit (kod nomi) | Nima qiladi | Paketdan boshlab | Do'konda standart | Kim o'zgartiradi |
| --- | --- | --- | --- | --- |
| `storefront.own` | Do'konning o'z vitrinasi (subdomen) | Start | Yoqilgan | Egasi |
| `storefront.custom_domain` | O'z domeni (shop.uz) | Biznes | O'chiq | Egasi |
| `catalog.marketplace_listing` | Umumiy katalogda ko'rinish | Biznes | O'chiq | Egasi |
| `catalog.marketplace_promo` | Katalogda yuqori o'rin (ichki reklama) | Pro | O'chiq | Egasi |
| `channel.telegram_miniapp` | Do'konning Telegram mini-ilovasi va boti | Start | Yoqilgan | Egasi |
| `delivery.own_couriers` | O'z kuryerlari | Start | Yoqilgan | Egasi |
| `delivery.platform_pool` | Platforma kuryerlar puli | Start (xizmat haqi bilan) | O'chiq | Egasi |
| `delivery.third_party` | Tashqi xizmat (Yandex Delivery va boshq.) | Biznes | O'chiq | Egasi |
| `delivery.auto_fallback` | Kuryer topilmasa avtomatik keyingi kanal | Biznes | Yoqilgan | Egasi |
| `payment.cash` | Naqd (faqat o'z kuryerlari bilan) | Start | Yoqilgan | Egasi |
| `payment.saved_cards` | Saqlangan karta (token) | Start | Yoqilgan | Egasi |
| `stock.visible` | Xaridorga qoldiq ko'rsatish | Start | Yoqilgan | Egasi |
| `integration.pos_erp` | Billz, 1C va boshqalar | Biznes | O'chiq | Egasi |
| `loyalty.points` | Ball va sodiqlik kartasi | Biznes | O'chiq | Egasi |
| `loyalty.stamp_cards` | Aksiya (shtamp) kartalari | Pro | O'chiq | Egasi |
| `loyalty.gift_cards` | Sovg'a kartalari | v2 (yurist xulosasidan keyin) | O'chiq | Platforma |
| `ai.customer_assistant` | Xaridor uchun AI yordamchi | Biznes | Yoqilgan | Egasi |
| `ai.owner_assistant` | Egasi uchun "ma'lumotdan so'rang" | Pro | Yoqilgan | Egasi |
| `ai.external_agents` | Tashqi AI agentlar (MCP), beta | Pro | O'chiq | Egasi + platforma |
| `analytics.advanced` | ABC/XYZ, hudud ABC, kogorta | Pro | Yoqilgan | Egasi |
| `branches.multi` | Bir nechta filial | Pro | — | Egasi |

**Qabul mezoni:** paketda yo'q funksiya interfeysda "Paketni oshirish" belgisi bilan ko'rinadi, lekin ishlamaydi; o'chirilgan funksiya ma'lumotni o'chirmaydi, faqat yashiradi.

## Paketlar va narxlar

4 ta paket bo'ladi. Narxlar — boshlang'ich gipoteza: pilotda 3 xil narx bilan sinaladi va konfiguratsiyada saqlanadi, kodni o'zgartirmasdan almashtiriladi. Barcha paketlarda 14 kunlik Pro sinovi; yillik to'lovda 15% chegirma.

|  | Start | Biznes | Pro | Tarmoq |
| --- | --- | --- | --- | --- |
| Kim uchun | Kichik do'kon, birinchi qadam | O'rta do'kon, o'sish | Faol marketing qiladigan do'kon | Supermarketlar tarmog'i |
| Narx gipotezasi, so'm/oy | 0 | 590 000 | 1 290 000 | kelishuv bo'yicha (3 mln dan) |
| Buyurtmalar/oy | 150 gacha | 1 500 gacha | 6 000 gacha | cheklovsiz |
| Filiallar | 1 | 1 | 3 gacha | cheklovsiz |
| Xodimlar | 3 | 10 | 30 | cheklovsiz |
| O'z vitrinasi + Telegram mini-ilova | ✓ | ✓ | ✓ | ✓ |
| O'z domeni | — | ✓ | ✓ | ✓ |
| Umumiy katalogda ko'rinish | — | ✓ | ✓ + yuqori o'rin | ✓ + yuqori o'rin |
| Kuryerlar: o'z + platforma puli | ✓ | ✓ | ✓ | ✓ |
| Tashqi kuryer xizmatlari va avtomatik zaxira | — | ✓ | ✓ | ✓ |
| POS/ERP integratsiya | — | 1 ta | 3 ta | cheklovsiz + API |
| Ball va sodiqlik kartasi | — | ✓ | ✓ + aksiya kartalari | ✓ |
| AI xaridor yordamchisi | — | ✓ | ✓ | ✓ |
| AI egasi yordamchisi, tashqi AI agentlar | — | — | ✓ | ✓ |
| Analitika | Asosiy | Savdo + ABC | To'liq (hudud, kogorta, RFM) | To'liq + ma'lumot eksporti |
| Qo'llab-quvvatlash | Chat | Chat, 4 soat | Shaxsiy menejer | SLA shartnoma |

**Qo'shimcha xizmatlar (paketdan tashqari):**

| Xizmat | Narx gipotezasi | Kim to'laydi |
| --- | --- | --- |
| Platforma kuryeri (1 yetkazish, 3 km gacha) | 12 000 so'm; har qo'shimcha km — 2 000 | Do'kon, haftalik hisob-faktura |
| Tashqi xizmat kuryeri | Xizmat tarifi + 5% texnik xizmat haqi | Do'kon |
| SMS paket (1 000 ta) | Operator narxi + 10% | Do'kon |
| Katalog va MXIK to'ldirish xizmati | 500 so'm / mahsulot | Do'kon (ixtiyoriy) |
| Integratsiyani sozlash | Bir martalik, 1 mln so'm dan | Do'kon (ixtiyoriy) |

Start bepul: do'konni jalb qilish narxi past bo'ladi, platforma esa kuryer xizmati va paketni oshirishdan daromad oladi. Gipotezani tekshirish mezoni: 90 kunda Start'dan pullik paketga o'tish ≥ 25%.

## Kuryer muammosi yechimi

Kuryeri yo'q do'kon ham ishlay oladi: tizim buyurtma uchun avtomatik ravishda o'z kuryerini, keyin platforma pulini, keyin tashqi xizmatni tanlaydi. Naqd to'lov faqat do'konning o'z kuryeri bilan bo'ladi — shunda xaridor puli platformadan o'tmaydi.

> **Diagramma** (Mermaid versiyasi: `01_prd/06_Diagrammalar.md`): kuryer tanlash tartibi · 3 kanal, 3 qaror

|  | O'z kuryerlari | Platforma kuryerlar puli | Tashqi xizmat (API) |
| --- | --- | --- | --- |
| Kim | Do'kon bilan shartnoma | Platforma bilan shartnoma (o'zini o'zi band qilganlar) | Yandex Delivery yoki mahalliy hamkor |
| To'lov turi | Naqd va onlayn | Faqat oldindan to'langan | Faqat oldindan to'langan |
| Do'kon nimaga to'laydi | Kuryerga o'zi | Yetkazish uchun xizmat haqi (12 000 so'm, 3 km gacha), haftalik hisob-faktura | Xizmat tarifi + 5%; oldindan to'langan balansdan |
| Xaridor ko'radi | Ism, surat, xarita, ETA | Ism, surat, xarita, ETA | Xizmat kuzatuv havolasi va ETA |
| Javob vaqti | Do'kon belgilaydi | Qabul ≤ 3 daqiqa, olib ketish ≤ 15 daqiqa | Xizmat bergan vaqt |
| Sifat nazorati | Reyting, ko'nikmalar, do'kon | Reyting, o'qitish, platforma | Xizmatning o'zi; muammoli buyurtma — murojaat |
| Soliq | Do'kon (100 mln so'mdan oshsa — soliq agenti) | Platforma — soliq agenti | Xizmat |

**Platforma kuryerlar pulini ishga tushirish:** pilotda 1 ta tuman, 15–20 ta kuryer, soatlik smena; kuryer to'lovi haftalik; birinchi 3 oy kuryerlar soni buyurtmaga qarab oshiriladi. Tashqi xizmat zaxira sifatida birinchi kundan ulanadi.

**Qabul mezonlari:** kuryer topilmasa 3 daqiqada keyingi kanalga o'tadi; tashqi xizmat narxi buyurtmani jo'natishdan oldin do'konga ko'rsatiladi; har kanal bo'yicha yetkazish narxi va vaqti analitikada alohida.

## v1 ekranlari: 95 tadan 40 taga

Takrorlar birlashtiriladi: v1'da 40 ta ekran, har biri bitta kod moduli. Qolgan prototiplar — manba sifatida arxivda. "YANGI" — hali prototipi yo'q.

| # | Rol | v1 ekrani | Qaysi prototiplardan | Majburiy holatlar |
| --- | --- | --- | --- | --- |
| 1 | Xaridor | Kirish va roziliklar | Onboard-Customer, Shop-Login | xato kod, SMS kechikishi |
| 2 | Xaridor | Manzil va zona | Shop-Address | zona tashqarisi |
| 3 | Xaridor | Do'kon bosh sahifasi | Shop-Home, Shop-Catalog | bo'sh, yuklanish |
| 4 | Xaridor | **Umumiy katalog: yaqin do'konlar** | YANGI | yaqinda do'kon yo'q |
| 5 | Xaridor | Qidiruv | Shop-Search | natija yo'q |
| 6 | Xaridor | Mahsulot | Shop-Product | tugadi, parhezga zid |
| 7 | Xaridor | Savat | Shop-CartSmart | bo'sh, narx o'zgardi |
| 8 | Xaridor | To'lov (ball + pul) | Shop-Payment, Shop-PayPoints, Shop-Checkout | rad etildi, 3DS/OTP |
| 9 | Xaridor | Kartalarim | Shop-Cards | token xatosi |
| 10 | Xaridor | Kuzatuv va xarita | Shop-Tracking, Shop-LiveTrack | GPS yo'q, kechikish |
| 11 | Xaridor | Baholash | Shop-Review | — |
| 12 | Xaridor | Murojaat | Shop-Support | — |
| 13 | Xaridor | Hisobim, sodiqlik, ball do'koni | Shop-Account, Shop-Rewards | ball yetmaydi |
| 14 | Xaridor | Rozilik va maxfiylik | Shop-Privacy | — |
| 15 | Xaridor | AI yordamchi | Shop-AIAssistant | AI javob bermadi |
| 16 | Do'kon | Ro'yxatdan o'tish va KYC | Onboard-Shop, SaaS-Signup | E-IMZO xatosi |
| 17 | Do'kon | Ishga tushirish ro'yxati | Onboarding-Guides | — |
| 18 | Do'kon | Bosh sahifa | Owner-Dashboard | yangi do'kon (ma'lumotsiz) |
| 19 | Do'kon | Buyurtmalar | Panel-Orders | SLA o'tdi |
| 20 | Do'kon | Yig'ish (planshet) | Panel-Picking | skaner xatosi |
| 21 | Do'kon | Dispetcher va kuryer kanallari | Panel-Dispatch + YANGI | kuryer topilmadi |
| 22 | Do'kon | Katalog, qoldiq, import | Panel-Catalog, Panel-Stock, Data-ImportExport | import xatolari |
| 23 | Do'kon | Hudud va slotlar | Panel-Zones | — |
| 24 | Do'kon | Vitrina va katalogga chiqish | Owner-Storefront + YANGI | paketda yo'q |
| 25 | Do'kon | To'lovlar va pul oqimi | Owner-Payments, Owner-Money, Panel-Finance | provayder uzildi |
| 26 | Do'kon | Sodiqlik va ballar | Loyalty, Owner-PointsLedger | — |
| 27 | Do'kon | Sharhlar | Panel-Reviews | — |
| 28 | Do'kon | Murojaatlar | Panel-Support | — |
| 29 | Do'kon | Analitika | Analytics-Overview, Sales-Report, Analytics-ABC, Analytics-Geo | ma'lumot kam |
| 30 | Do'kon | Jamoa, rollar, ko'nikmalar | Owner-Team, Skills-Matrix | — |
| 31 | Do'kon | Paket va funksiyalar | Owner-Billing + YANGI | to'lov kechikdi |
| 32 | Do'kon | Integratsiyalar | Integrations-Model (sxema) + YANGI | sinxron uzildi |
| 33 | Kuryer | Ishga kirish | Onboard-Courier | hujjat rad etildi |
| 34 | Kuryer | Smena va topshiriqlar | Courier-Shift, Courier-Tasks | GPS ruxsati yo'q |
| 35 | Kuryer | Marshrut, topshirish, topshirib bo'lmadi | Courier-Route, Courier-Deliver, Courier-Fail | oflayn |
| 36 | Kuryer | Hisobim va reyting | Courier-Account, Courier-Rate | — |
| 37 | Admin | Do'konlar va paket konstruktori | Admin-SaaS, Admin-Tenants + YANGI | — |
| 38 | Admin | **Platforma kuryerlar puli** | YANGI | kuryer yetishmaydi |
| 39 | Admin | Oferta va rozilik markazi | Admin-Consents | — |
| 40 | Admin | Ichki tahlil | Data-Customer360, Data-Funnel | — |

Har ekran uchun moslashuvchanlik: 360, 768, 1024, 1440 px kengliklar; xaridor ekranlari Telegram mini-ilova ichida ham, oddiy brauzerda ham ishlaydi.

## Ishlab chiqish tartibi

9 ta sprint, jami 17 hafta: 1 haftalik asos + 8 ta ikki haftalik sprint. Har sprint oxirida ishlaydigan, sinovdan o'tgan qism chiqadi; keyingi sprint oldingisining qabul mezonlari bajarilmaguncha boshlanmaydi. Texnik tafsilotlar — "Texnik spetsifikatsiya" tabida.

| Sprint | Natija | Ekranlar (#) | Qabul mezoni |
| --- | --- | --- | --- |
| S0 (1 hafta) | Asos: monorepo, CI/CD, dizayn tokenlari, kirish (SMS/Telegram), tenantlar, rollar, funksiya kalitlari, audit jurnali, hodisalar lug'ati | — | Bo'sh do'kon yaratiladi; rol bo'yicha ruxsat testlari o'tadi |
| S1 | Katalog, qoldiq, Excel import, MXIK | 22, 23 | 1 000 mahsulot 60 soniyada import; "Tugadi" vitrinada 5 soniyada |
| S2 | Vitrina, savat, buyurtma, Telegram mini-ilova | 2–7, 10 (holat) | Telegram va brauzerda bir xil ishlaydi; 4G'da birinchi ekran 2,5 s dan tez |
| S3 | To'lov: Payme, Click, Uzum, karta tokeni, fiskal chek | 8, 9, 25 | Sandbox'da 50 ta to'lov va 10 ta qaytarish xatosiz; idempotentlik testi |
| S4 | Panel: buyurtma, yig'ish, dispetcher; kuryer ilovasi (o'z kuryerlari) | 19–21, 33–36 | Buyurtma qabuldan topshirishgacha to'liq o'tadi; GPS 15 s da |
| S5 | Platforma kuryerlar puli, Yandex Delivery API, avtomatik zaxira | 21, 38 | Kuryer topilmasa 3 daqiqada keyingi kanal; narx oldindan ko'rinadi |
| S6 | Ro'yxatdan o'tish, oferta, roziliklar, KYC (E-IMZO), ball va sodiqlik | 1, 13, 14, 16, 26, 39 | Har akcept jurnalda; ball ledgeri balansi har kuni mos |
| S7 | Umumiy katalog, paketlar va hisob, analitika, AI yordamchi, jamoa | 4, 15, 17, 18, 24, 27–31, 37, 40 | Paket o'zgarsa funksiyalar 1 daqiqada yoqiladi/o'chadi |
| S8 | Sinov va pilotga tayyorgarlik: yuklama, xavfsizlik, zaxira nusxadan tiklash, tarjima, qulaylik | barchasi | 300 buyurtma/soat yuklamada xatosiz; tashqi xavfsizlik tekshiruvi; 10–15 pilot do'kon |

Har sprintdan oldin: modul spetsifikatsiyasi va testlar yoziladi → AI kod yozadi → avtomatik testlar → inson ko'rib chiqadi (xavfsizlik va to'lov qismlari majburiy) → sinov muhiti.

## Ochiq savollar va xavflar

| # | Masala | Mening tavsiyam | Kim hal qiladi | Muddat |
| --- | --- | --- | --- | --- |
| 1 | **Kuryer GPS'i fonda**: brauzer va Telegram mini-ilova ekran o'chganda joylashuvni ishonchli yubormaydi | Kuryer ilovasini istisno sifatida Android ilova qilish (bitta kod bazasidan, React Native) | Siz | S0 dan oldin |
| 2 | Platforma kuryeri naqd olsa, pul platformadan o'tadi | v1'da platforma va tashqi kuryerlar faqat oldindan to'langan buyurtmani olib boradi; naqd — faqat o'z kuryerlari | Qaror (tavsiya qabul qilinsa) | S5 |
| 3 | Platforma kuryerlar pulini boshqaradi: kuryerlik xizmati operatori va soliq agenti majburiyatlari | Yurist xulosasi; kuryerlar bilan platforma nomidan shartnoma | Yurist | S4 dan oldin |
| 4 | Ofertalarga 3 ta o'zgarish: umumiy katalog shartlari, platforma kuryer xizmati shartnomasi, qo'shimcha xizmatlar hisob-kitobi | Loyihasini men yozaman, yurist tasdiqlaydi | Men + yurist | S6 |
| 5 | Tashqi xizmatlar bilan shartnoma (Yandex Delivery va mahalliy kuryer kompaniyalari) | 1 ta asosiy + 1 ta zaxira | Siz | S5 dan oldin |
| 6 | Umumiy katalogda tartiblash adolatliligi (pullik yuqori o'rin va reyting) | "Reklama" belgisi, reyting va masofa asosiy mezon | Qaror | S7 |
| 7 | AI yozgan kod sifati va xavfsizligi | To'lov, kirish va shaxsiy ma'lumot modullarini inson ko'rib chiqadi; tashqi xavfsizlik tekshiruvi | Siz (mutaxassis yollash) | S3, S8 |
| 8 | Hosting: O'zbekistonda yoki xalqaro bulutda | Asosiy baza O'zbekistonda (ishonch, tezlik); qonun 2026'dan xorijni ham ruxsat beradi | Siz | S0 |
| 9 | Paket narxlari gipoteza | Pilotda 3 narx varianti; 90 kunda qayta ko'rib chiqish | Biz | Pilot |

Manbalar: [Yandex Delivery API](https://yandex.com/dev/logistics/api/about/intro.html), [Yandex O'zbekistonda bizneslar uchun ekspress yetkazish (2025)](https://www.uzdaily.uz/en/yandex-uzbekistan-expands-express-delivery-service-for-businesses/).
