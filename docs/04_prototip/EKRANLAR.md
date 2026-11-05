# Ekranlar ro'yxati (100 ta + Index)

Har ekran: `ekranlar/<Fayl>.dc.html` (manba: HTML + JS ma'lumot) va `skrinshotlar/<Fayl>.png` (rasm). **v1 #** — PRD'dagi 40 ta v1 ekranidan qaysi biriga kiradi (bo'sh bo'lsa — ma'lumot/sxema yoki keyingi versiya).


## MVP 1-versiya: O’zbekiston, o’zbek va rus tili

Nimadan boshlaymiz va pul qanday aylanadi

| Fayl | Nomi | Turi | Rollar | v1 # | Versiya | Tavsif |
| --- | --- | --- | --- | --- | --- | --- |
| `MVP-Scope` | MVP doirasi: v1, v2, v3 | Sxema | Ichki jamoa, Xaridor, Kuryer, Do'kon xodimi, Do'kon egasi, Platforma admini |  |  | Har rol uchun v1 da nima bor, nima keyinga qoladi; tillar va muvaffaqiyat mezonlari |
| `Money-Flow` | Pul, mahsulot va ma’lumot oqimi | Sxema | Ichki jamoa, Xaridor, Kuryer, Do'kon xodimi, Do'kon egasi, Platforma admini |  |  | 8 bosqich: to’lov, band qilish, yechish, topshirish, kassa, T+1; kim kimga to’laydi |

## Gibrid model: paketlar, kalitlar va kuryer kanallari

PRD v1 qarorlari: komissiyasiz, har funksiya yoqiladi/o’chiriladi

| Fayl | Nomi | Turi | Rollar | v1 # | Versiya | Tavsif |
| --- | --- | --- | --- | --- | --- | --- |
| `Shop-Marketplace` | Umumiy katalog: yaqin do’konlar (Telegram) | Mobil (390×844) | Xaridor | 4 | v1 | Do’konlar va mahsulot narxini solishtirish, “Tugadi”, “Reklama” belgisi, uz/ru |
| `Owner-Plan` | Paket va funksiyalar | Desktop (1440×900) | Do'kon egasi | 24, 31 | v1 | 4 paket, 21 funksiya kaliti, limitlar va qo’shimcha xizmatlar |
| `Owner-Delivery` | Kuryer kanallari va qoidalar | Desktop (1440×900) | Do'kon egasi, Do'kon xodimi | 21 | v1 | O’z kuryeri → platforma puli → tashqi API; ustuvorlik va sinov |
| `Admin-Plans` | Paket konstruktori | Desktop (1440×900) | Platforma admini | 37 | v1 | Paket × funksiya matritsasi, uch qatlamli tekshiruv, versiya |
| `Admin-CourierPool` | Platforma kuryerlar puli | Desktop (1440×900) | Platforma admini, Kuryer | 38 | v1 pilot | Tuman talab/taklif, bonus, kuryerlar va qabul navbati |

## Ro’yxatdan o’tish, oferta va roziliklar

Har taraf kirishda o’z hujjatini qabul qiladi

| Fayl | Nomi | Turi | Rollar | v1 # | Versiya | Tavsif |
| --- | --- | --- | --- | --- | --- | --- |
| `Onboard-Customer` | Xaridor: ro’yxatdan o’tish va roziliklar (uz/ru) | Mobil (390×844) | Xaridor | 1 | v1 | Oferta, maxfiylik, xizmat roziligi, 18+; ixtiyoriy marketing, reklama, AI profili |
| `Onboard-Shop` | Do’kon: KYC va E-IMZO bilan shartnoma | Desktop (1440×900) | Do'kon egasi, Platforma admini | 16 | v1 | Kompaniya, rahbar, bank; SaaS ofertasi va DPA imzosi |
| `Onboard-Courier` | Kuryer: ishga qabul va roziliklar | Mobil (390×844) | Kuryer, Do'kon xodimi | 33 | v1 | Maqom, hujjatlar, shartnoma, GPS faqat smenada, o’quv modullari |
| `Admin-Consents` | Oferta va rozilik markazi (ichki) | Desktop (1440×900) | Ichki jamoa, Platforma admini | 39 | v1 | Versiyalar, o’zgarmas jurnal, mijoz so’rovlari, muvofiqlik ro’yxati |

## Hisoblar, ballar va onboarding

Har rolning hisobi, ichki ball, sodiqlik va aksiya kartalari

| Fayl | Nomi | Turi | Rollar | v1 # | Versiya | Tavsif |
| --- | --- | --- | --- | --- | --- | --- |
| `Accounts-Architecture` | Hisoblar, rollar va hamyonlar arxitekturasi | Sxema | Ichki jamoa, Do'kon egasi, Platforma admini |  |  | Platforma ID, 5 xil hisob, ledger, tenant izolyatsiyasi va talablar |
| `Points-Model` | Ball, sodiqlik va aksiya kartalari modeli | Sxema | Ichki jamoa, Do'kon egasi, Xaridor, Platforma admini |  |  | Yig’ish, sarflash, muddat, 4 xil karta, qonuniy chegara, buxgalteriya |
| `Shop-Account` | Xaridor: hisobim va sodiqlik kartasi (uz/ru) | Mobil (390×844) | Xaridor | 13 | v1 | QR karta, ball balansi, daraja, aksiya kartasi, kuponlar, sovg’a kartasi |
| `Shop-Rewards` | Xaridor: ball do’koni | Mobil (390×844) | Xaridor | 13 | v1 | Mahsulotlarni 100% ball bilan olish |
| `Shop-PayPoints` | Xaridor: ball + pul bilan to’lash | Mobil (390×844) | Xaridor | 8 | v1 | Chekning 30% gacha ball, qolgani karta yoki naqd, keshbek hisobi |
| `Owner-PointsLedger` | Do’kon: ballar, aksiya va sovg’a kartalari | Desktop (1440×900) | Do'kon egasi | 26 | v1 | Ball majburiyati, oylik hisob, shtamp kartalar, sovg’a kartasi partiyalari |
| `Owner-Team` | Do’kon: jamoa, rollar va filiallar | Desktop (1440×900) | Do'kon egasi | 30 | v1 | Xodimlarni taklif qilish, 7 rol × 12 ruxsat, 2FA, filiallar |
| `Courier-Account` | Kuryer: hisobim, daromad va naqd | Mobil (390×844) | Kuryer | 36 | v1 | Haftalik daromad, soliq chegarasi, naqdni topshirish, hujjatlar muddati |
| `Onboarding-Guides` | Onboarding va yo’riqnomalar | Desktop (1440×900) | Xaridor, Kuryer, Do'kon xodimi, Do'kon egasi, Platforma admini | 17 | v1 | Egasi uchun 10 qadam, xaridor intro, yig’uvchi va kuryer yo’riqnomasi, yordam markazi |

## Strategiya va biznes model

Nima sotamiz, kimga va qanday pul aylanadi

| Fayl | Nomi | Turi | Rollar | v1 # | Versiya | Tavsif |
| --- | --- | --- | --- | --- | --- | --- |
| `SaaS-Model` | SaaS modeli: pul va xizmat oqimi | Sxema | Ichki jamoa, Do'kon egasi, Platforma admini |  |  | Platforma, do’kon, xaridor va kuryer o’rtasidagi pul va xizmat oqimi |
| `Tenant-Lifecycle` | Do’kon hayot sikli | Sxema | Ichki jamoa, Do'kon egasi, Platforma admini |  |  | Lid → sinov → faol → qarzdor → to’xtatilgan: har bosqich harakatlari |
| `Flow-E2E` | To’liq buyurtma jarayoni | Sxema | Ichki jamoa, Xaridor, Kuryer, Do'kon xodimi, Do'kon egasi, Platforma admini |  |  | 13 bosqich × 6 ishtirokchi: kim nima qiladi va qachon |
| `Gaps` | Bo’shliqlar va tavsiyalar | Sxema | Ichki jamoa, Do'kon egasi, Platforma admini |  |  | Biznes jarayonidagi uzilishlar va ularni yopish tavsiyalari |
| `Services-Map` | Xizmatlar va protseduralar xaritasi | Sxema | Ichki jamoa, Do'kon egasi, Platforma admini |  |  | Tayyor, qisman va qolib ketgan xizmatlar, SOP va jamoa resurslari |
| `Store-Brands` | Har do’konga o’z internet-do’koni | Desktop (1440×900) | Ichki jamoa, Do'kon egasi, Xaridor |  |  | Bitta platforma — har do’kon o’z domeni, rangi va katalogi bilan |

## Arxitektura va mantiq

Tizim qanday quriladi va qanday ishlaydi

| Fayl | Nomi | Turi | Rollar | v1 # | Versiya | Tavsif |
| --- | --- | --- | --- | --- | --- | --- |
| `Main` | Arxitektura: 3 ilova, 1 yadro | Sxema | Ichki jamoa |  |  | Vitrina, kuryer ilovasi, panel va umumiy backend xizmatlari |
| `Flow-Order` | Buyurtma holatlari mantiqi | Sxema | Ichki jamoa, Do'kon xodimi |  |  | Holat mashinasi: o’tishlar, taymerlar va xatolik yo’llari |
| `Track-Model` | Kuzatuv mantiqi: holat, lokatsiya, ETA | Sxema | Ichki jamoa, Xaridor, Do'kon xodimi |  |  | Har mahsulot holati, kuryer koordinatasi va ETA hisobi |
| `GPS-Flow` | GPS: kuryerdan xaridorgacha | Sxema | Ichki jamoa, Kuryer, Xaridor |  |  | Har 15/60 soniyada nuqta, geozona, xaridorga uzatish |
| `Analytics-Method` | Analitika metodikasi | Sxema | Ichki jamoa, Do'kon egasi |  |  | Ko’rsatkichlar formulasi va ma’lumot manbalari |

## To’lov tizimlari va xalqaro chiqish

Bitta API, ko’p provayder, ko’p davlat

| Fayl | Nomi | Turi | Rollar | v1 # | Versiya | Tavsif |
| --- | --- | --- | --- | --- | --- | --- |
| `Pay-Architecture` | To’lov arxitekturasi | Sxema | Ichki jamoa, Do'kon egasi, Platforma admini |  |  | Yagona Payment API, orkestrator, adapterlar, ledger, fiskal chek |
| `Pay-Providers` | Provayderlar katalogi | Desktop (1440×900) | Ichki jamoa, Do'kon egasi, Platforma admini |  | v1: UZ | UZ, KZ, KG, TJ, RU, TM va xalqaro: usullar va ulanish fazasi |
| `Expansion` | Xalqaro kengayish | Sxema | Ichki jamoa, Do'kon egasi, Platforma admini |  | v2–v3 | Davlatlar bo’yicha valyuta, soliq, ma’lumot joyi va ochish tartibi |
| `Shop-Payment` | Xaridor: to’lov usuli | Mobil (390×844) | Xaridor | 8 | v1 | Payme, Click, Uzum, Humo/Uzcard, Visa/MC, Google Pay, naqd |
| `Owner-Payments` | Egasi: to’lov usullarini ulash | Desktop (1440×900) | Do'kon egasi | 25 | v1 | Provayderni yoqish, kalitlar, webhook, test to’lov, MXIK |

## Dizayn tizimi va rollar

Umumiy til: ranglar, komponentlar, holatlar

| Fayl | Nomi | Turi | Rollar | v1 # | Versiya | Tavsif |
| --- | --- | --- | --- | --- | --- | --- |
| `Foundations` | Dizayn tizimi | Desktop (1440×900) | Ichki jamoa |  |  | Rang, shrift, tugmalar, maydonlar, kartochkalar |
| `Journeys` | Rollar va ketma-ketlik | Sxema | Ichki jamoa |  |  | Har rolning yo’li: qaysi ekrandan qaysisiga |
| `States` | Tizim holatlari | Desktop (1440×900) | Ichki jamoa |  |  | Bo’sh, yuklanmoqda, xato, oflayn holatlar |

## Do’kon egasi: ulanishdan sotuvgacha

Do’kon platformaga qanday qo’shiladi

| Fayl | Nomi | Turi | Rollar | v1 # | Versiya | Tavsif |
| --- | --- | --- | --- | --- | --- | --- |
| `SaaS-Landing` | Platforma sayti | Desktop (1440×900) | Do'kon egasi |  |  | Do’konlar uchun sotuv sahifasi va tariflar |
| `SaaS-Signup` | Ro’yxatdan o’tish | Desktop (1440×900) | Do'kon egasi | 16 | v1 | Telefon, do’kon ma’lumoti, hudud — bosqichma-bosqich |
| `Owner-Dashboard` | Egasi: bosh sahifa | Desktop (1440×900) | Do'kon egasi | 18 | v1 | Bugungi savdo, buyurtmalar va ogohlantirishlar |
| `Owner-Storefront` | Internet-do’kon sozlash | Desktop (1440×900) | Do'kon egasi | 24 | v1 | Logo, rang, domen va bannerlar — jonli ko’rinish bilan |
| `Owner-Product` | Mahsulot kartochkasi | Desktop (1440×900) | Do'kon egasi, Do'kon xodimi |  |  | Narx, rasm, qoldiq, variantlar |
| `Owner-Billing` | Tarif va to’lov | Desktop (1440×900) | Do'kon egasi | 31 | v1 | Obuna, hisob-fakturalar, to’lov usullari |
| `Owner-Money` | Pul oqimi onlayn | Desktop (1440×900) | Do'kon egasi, Do'kon xodimi | 25 | v1 | Har to’lov soniyalarda: usul, karta, holat; kuryerdagi naqd, payout, solishtirish |
| `Loyalty` | Sodiqlik dasturi | Desktop (1440×900) | Do'kon egasi, Xaridor |  |  | Keshbek, darajalar, promo-kodlar, iqtisodiy hisob va xaridor ko’rinishi |

## Xaridor

Kirishdan topshirishgacha

| Fayl | Nomi | Turi | Rollar | v1 # | Versiya | Tavsif |
| --- | --- | --- | --- | --- | --- | --- |
| `Shop-Login` | Kirish (OTP) | Mobil (390×844) | Xaridor | 1 | v1 | Telefon raqami va SMS kod |
| `Shop-Home` | Shaxsiy bosh sahifa (uz/ru) | Mobil (390×844) | Xaridor | 3 | v1 | Tugayotganlar, odatdagi savat, qaytgan mahsulot, mavsum, aksiya, lenta |
| `Shop-Search` | Aqlli qidiruv | Mobil (390×844) | Xaridor | 5 | v1 | Sinonimlar (сут → sut), shaxsiy tartib, natijasiz qidiruvda so’rov |
| `Shop-Product` | Mahsulot kartochkasi | Mobil (390×844) | Xaridor | 6 | v1 | Qoldiq, parhezga moslik ogohlantirishi, eslatma, birga olinadi |
| `Shop-Address` | Manzil | Mobil (390×844) | Xaridor | 2 | v1 | Xaritada manzil va yetkazish zonasi tekshiruvi |
| `Shop-Catalog` | Katalog | Mobil (390×844) | Xaridor | 3 | v1 | Kategoriyalar, qidiruv, savatga qo’shish |
| `Shop-Desktop` | Vitrina: desktop | Desktop (1440×900) | Xaridor |  |  | Katta ekran uchun adaptiv vitrina |
| `Shop-Checkout` | Savat va rasmiylashtirish | Mobil (390×844) | Xaridor | 8 | v1 | Slot, to’lov usuli, muqobil mahsulot qoidasi |
| `Shop-CartSmart` | Aqlli savat | Mobil (390×844) | Xaridor | 7 | v1 | Bepul yetkazishgacha, muqobil afzalligi, yakuniy summa, “Nima to’xtatdi?” |
| `Shop-Cards` | Mening kartalarim (uz/ru) | Mobil (390×844) | Xaridor | 9 | v1 | Uzcard/Humo ulash: raqam, SMS kod, token; to’lovlar tarixi |
| `Shop-AIAssistant` | AI yordamchi (uz/ru) | Mobil (390×844) | Xaridor | 15 | v1 | Matn, ovoz yoki ro’yxat suratidan savat; buyurtma holati |
| `Shop-Tracking` | Kuzatuv va tasdiq | Mobil (390×844) | Xaridor | 10 | v1 | Buyurtma holati va muqobilni tasdiqlash |
| `Shop-LiveTrack` | Jonli kuzatuv xaritada | Mobil (390×844) | Xaridor | 10 | v1 | Kuryer nuqtasi, masofa va ETA |
| `Shop-Support` | Murojaat | Mobil (390×844) | Xaridor | 12 | v1 | Muammo turi, surat va javob |
| `Shop-Privacy` | Rozilik va maxfiylik (uz/ru) | Mobil (390×844) | Xaridor | 14 | v1 | Xizmat, marketing, reklama, sog’liq roziligi; AI agentlar; ma’lumot so’rash va o’chirish |

## Do’kon operatsiyalari

Buyurtmani qabul qilish, yig’ish va jo’natish

| Fayl | Nomi | Turi | Rollar | v1 # | Versiya | Tavsif |
| --- | --- | --- | --- | --- | --- | --- |
| `Panel-Orders` | Buyurtmalar | Desktop (1440×900) | Do'kon xodimi | 19 | v1 | Yangi buyurtmalar, SLA taymer, tasdiqlash |
| `Panel-Picking` | Yig’ish | Desktop (1440×900) | Do'kon xodimi | 20 | v1 | Yig’uvchi ro’yxati, muqobil va qadoqlash |
| `Panel-Dispatch` | Dispetcher | Desktop (1440×900) | Do'kon xodimi | 21 | v1 | Kuryerga biriktirish va marshrut |
| `Track-Ops` | Buyurtma yo’li va xarita | Desktop (1440×900) | Do'kon xodimi |  |  | Operator uchun barcha kuryerlar xaritada |
| `Panel-Stock` | Qoldiq xizmati | Desktop (1440×900) | Do'kon xodimi, Do'kon egasi, Xaridor | 22 | v1 | Zal va ombor qoldig’i, yoqish/o’chirish, “Tugadi” belgisi, xaridor ko’rinishi |
| `Integrations-Model` | POS, CRM, ERP integratsiyasi | Sxema | Ichki jamoa, Do'kon xodimi, Do'kon egasi, Platforma admini | 32 | v1 | Integratsiyali, fayl orqali va integratsiyasiz rejim; yig’uvchi POS kassadan o’tkazadi |
| `Panel-Catalog` | Katalog va qoldiq | Desktop (1440×900) | Do'kon xodimi, Do'kon egasi | 22 | v1 | Mahsulotlar, narxlar va qoldiq nazorati |
| `Panel-Zones` | Hudud va slotlar | Desktop (1440×900) | Do'kon xodimi, Do'kon egasi | 23 | v1 | Yetkazish zonalari, narx va vaqt oraliqlari |
| `Panel-Support` | Murojaatlar | Desktop (1440×900) | Do'kon xodimi | 28 | v1 | Xaridor murojaatlari va qaytarishlar |
| `Panel-Finance` | Moliya | Desktop (1440×900) | Do'kon xodimi, Do'kon egasi | 25 | v1 | To’lovlar, kuryer naqdi, solishtirish |

## Kuryer

Smenadan topshirishgacha

| Fayl | Nomi | Turi | Rollar | v1 # | Versiya | Tavsif |
| --- | --- | --- | --- | --- | --- | --- |
| `Courier-Shift` | Smena va GPS ruxsati | Mobil (390×844) | Kuryer | 34 | v1 | Smenani boshlash va joylashuv ruxsati |
| `Courier-Tasks` | Topshiriqlar | Mobil (390×844) | Kuryer | 34 | v1 | Biriktirilgan buyurtmalar ro’yxati |
| `Courier-Route` | Marshrut va navigatsiya | Mobil (390×844) | Kuryer | 35 | v1 | Manzillar tartibi va yo’l ko’rsatish |
| `Courier-Deliver` | Topshirish (PIN) | Mobil (390×844) | Kuryer | 35 | v1 | PIN kod, naqd yoki onlayn to’lov tasdig’i |
| `Courier-Fail` | Topshirib bo’lmadi | Mobil (390×844) | Kuryer | 35 | v1 | Sabab, surat va qaytarish yo’li |

## Reyting va ishonch

Do’kon, kuryer va xaridor bahosi

| Fayl | Nomi | Turi | Rollar | v1 # | Versiya | Tavsif |
| --- | --- | --- | --- | --- | --- | --- |
| `Rating-Model` | Reyting va ishonch modeli | Sxema | Ichki jamoa, Do'kon xodimi, Kuryer, Do'kon egasi, Platforma admini |  |  | Kim kimni baholaydi, formula, indekslar, chegara va halollik qoidalari |
| `Shop-Review` | Xaridor: do’kon va kuryerni baholash | Mobil (390×844) | Xaridor | 11 | v1 | Yulduz, teglar, izoh, surat va minnatdorchilik |
| `Courier-Rate` | Kuryer: baholash va mening reytingim | Mobil (390×844) | Kuryer | 36 | v1 | Do’kon va xaridorni baholash, o’z indeksi va izohlar |
| `Panel-Reviews` | Panel: reyting va sharhlar | Desktop (1440×900) | Do'kon xodimi, Do'kon egasi | 27 | v1 | Sharhga javob, e’tiroz, ishonch indeksi, kuryerlar reytingi |

## Analitika, marketing, AI va hisobotlar

Raqamlar va AI asosida qaror qabul qilish

| Fayl | Nomi | Turi | Rollar | v1 # | Versiya | Tavsif |
| --- | --- | --- | --- | --- | --- | --- |
| `Analytics-Overview` | Savdo ko’rsatkichlari | Desktop (1440×900) | Do'kon egasi, Platforma admini | 29 | v1 | Tushum, buyurtmalar, o’rtacha chek, dinamika |
| `Sales-Report` | Sotuv hisoboti | Desktop (1440×900) | Do'kon egasi, Do'kon xodimi | 29 | v1 | Guruhlash, filtr va jadvalni eksport qilish |
| `Analytics-ABC` | ABC / XYZ matritsasi | Desktop (1440×900) | Do'kon egasi | 29 | v1 | Mahsulotlar daromad va barqarorlik bo’yicha |
| `Analytics-Geo` | Hudud ABC tahlili | Desktop (1440×900) | Do'kon egasi, Platforma admini | 29 | v1 | Tumanlar bo’yicha tushum, qamrov, o’sish va oq dog’lar |
| `Analytics-Product` | Bitta mahsulot | Desktop (1440×900) | Do'kon egasi, Do'kon xodimi |  |  | Mahsulot savdosi, qoldiq va prognoz |
| `Marketing-Frameworks` | Marketing freymvorklari | Desktop (1440×900) | Do'kon egasi |  | v1+ | BCG, RFM, kogorta, AARRR voronka |
| `Marketing-Channels` | Ijtimoiy tarmoqlar | Desktop (1440×900) | Do'kon egasi |  |  | Instagram, Telegram, Facebook — UTM bo’yicha natija |
| `Marketing-Campaigns` | Kampaniya yaratish | Desktop (1440×900) | Do'kon egasi |  |  | Segment, kanal, taklif va vaqt |
| `Reports-Scheduler` | Hisobotlarni rejalashtirish | Desktop (1440×900) | Do'kon egasi, Platforma admini |  |  | Avtomatik hisobotlar: kimga va qachon |
| `Data-ImportExport` | Import / eksport markazi | Desktop (1440×900) | Do'kon egasi, Do'kon xodimi | 22 | v1 | Excel/CSV yuklash, tekshirish va tarix |
| `AI-Services` | AI xizmatlari | Sxema | Ichki jamoa, Do'kon egasi, Do'kon xodimi, Platforma admini |  | v1+ | 15 ta AI yo’nalishi: ta’sir, murakkablik, faza va AI yordamchi |
| `AI-Agents` | AI integratsiya va tashqi agentlar | Sxema | Ichki jamoa, Xaridor, Do'kon egasi, Platforma admini |  |  | AI shlyuz, do’kon va xaridor AI xizmatlari, MCP orqali shaxsiy agentlarni ulash |

## Ichki data va jamoa

Faqat kompaniya xodimlari uchun: tahlil va ko’nikmalar

| Fayl | Nomi | Turi | Rollar | v1 # | Versiya | Tavsif |
| --- | --- | --- | --- | --- | --- | --- |
| `Data-Customer360` | Mijoz 360 (ichki) | Desktop (1440×900) | Ichki jamoa, Do'kon egasi, Platforma admini | 40 | v1 | Segment, CLV, ketish xavfi, keyingi xarid prognozi, keyingi eng yaxshi harakat |
| `Data-Funnel` | Voronka, talab va kanallar (ichki) | Desktop (1440×900) | Ichki jamoa, Do'kon egasi, Platforma admini | 40 | v1 | Voronka, “Nima to’xtatdi?”, natijasiz qidiruv, CAC, ROAS, sof ta’sir |
| `Skills-Matrix` | Ko’nikmalar matritsasi va akademiya | Desktop (1440×900) | Do'kon xodimi, Do'kon egasi, Kuryer, Platforma admini | 30 | v1 | Hard va soft skills: yig’uvchi, kuryer, menejer; modullar va tavsiyalar |

## Bildirishnomalar

Kimga, qachon va qaysi kanal orqali

| Fayl | Nomi | Turi | Rollar | v1 # | Versiya | Tavsif |
| --- | --- | --- | --- | --- | --- | --- |
| `Notify-Matrix` | Bildirishnomalar matritsasi | Sxema | Ichki jamoa, Xaridor, Kuryer, Do'kon xodimi, Do'kon egasi, Platforma admini |  |  | 15 hodisa × 5 qabul qiluvchi va kanal qoidalari |
| `Notify-Feeds` | Xabarlar lentasi | Mobil (390×844) | Xaridor, Kuryer, Do'kon xodimi |  |  | Xaridor, kuryer va do’kon telefonida |

## Platforma admini

Barcha do’konlarni boshqarish

| Fayl | Nomi | Turi | Rollar | v1 # | Versiya | Tavsif |
| --- | --- | --- | --- | --- | --- | --- |
| `Admin-SaaS` | Do’konlar va obunalar | Desktop (1440×900) | Platforma admini | 37 | v1 | MRR, obunalar, qarzdorlar va SLA |
| `Admin-Tenants` | Hamkorni ulash | Desktop (1440×900) | Platforma admini | 37 | v1 | Yangi do’kon: KYC, sozlash va ishga tushirish |

## PRD v1: 40 ta ekran → prototiplar

| # | Rol | v1 ekrani | Prototiplar | Majburiy holatlar |
| --- | --- | --- | --- | --- |
| 1 | Xaridor | Kirish va roziliklar | `Onboard-Customer`, `Shop-Login` | xato kod, SMS kechikishi |
| 2 | Xaridor | Manzil va zona | `Shop-Address` | zona tashqarisi |
| 3 | Xaridor | Do'kon bosh sahifasi | `Shop-Home`, `Shop-Catalog` | bo'sh, yuklanish |
| 4 | Xaridor | Umumiy katalog: yaqin do'konlar | `Shop-Marketplace` | yaqinda do'kon yo'q |
| 5 | Xaridor | Qidiruv | `Shop-Search` | natija yo'q |
| 6 | Xaridor | Mahsulot | `Shop-Product` | tugadi, parhezga zid |
| 7 | Xaridor | Savat | `Shop-CartSmart` | bo'sh, narx o'zgardi |
| 8 | Xaridor | To'lov (ball + pul) | `Shop-Payment`, `Shop-PayPoints`, `Shop-Checkout` | rad etildi, 3DS/OTP |
| 9 | Xaridor | Kartalarim | `Shop-Cards` | token xatosi |
| 10 | Xaridor | Kuzatuv va xarita | `Shop-Tracking`, `Shop-LiveTrack` | GPS yo'q, kechikish |
| 11 | Xaridor | Baholash | `Shop-Review` | — |
| 12 | Xaridor | Murojaat | `Shop-Support` | — |
| 13 | Xaridor | Hisobim, sodiqlik, ball do'koni | `Shop-Account`, `Shop-Rewards` | ball yetmaydi |
| 14 | Xaridor | Rozilik va maxfiylik | `Shop-Privacy` | — |
| 15 | Xaridor | AI yordamchi | `Shop-AIAssistant` | AI javob bermadi |
| 16 | Do'kon | Ro'yxatdan o'tish va KYC | `Onboard-Shop`, `SaaS-Signup` | E-IMZO xatosi |
| 17 | Do'kon | Ishga tushirish ro'yxati | `Onboarding-Guides` | — |
| 18 | Do'kon | Bosh sahifa | `Owner-Dashboard` | yangi do'kon (ma'lumotsiz) |
| 19 | Do'kon | Buyurtmalar | `Panel-Orders` | SLA o'tdi |
| 20 | Do'kon | Yig'ish (planshet) | `Panel-Picking` | skaner xatosi |
| 21 | Do'kon | Dispetcher va kuryer kanallari | `Panel-Dispatch`, `Owner-Delivery` | kuryer topilmadi |
| 22 | Do'kon | Katalog, qoldiq, import | `Panel-Catalog`, `Panel-Stock`, `Data-ImportExport` | import xatolari |
| 23 | Do'kon | Hudud va slotlar | `Panel-Zones` | — |
| 24 | Do'kon | Vitrina va katalogga chiqish | `Owner-Storefront`, `Owner-Plan` | paketda yo'q |
| 25 | Do'kon | To'lovlar va pul oqimi | `Owner-Payments`, `Owner-Money`, `Panel-Finance` | provayder uzildi |
| 26 | Do'kon | Sodiqlik va ballar | `Owner-PointsLedger` | — |
| 27 | Do'kon | Sharhlar | `Panel-Reviews` | — |
| 28 | Do'kon | Murojaatlar | `Panel-Support` | — |
| 29 | Do'kon | Analitika | `Analytics-Overview`, `Sales-Report`, `Analytics-ABC`, `Analytics-Geo` | ma'lumot kam |
| 30 | Do'kon | Jamoa, rollar, ko'nikmalar | `Owner-Team`, `Skills-Matrix` | — |
| 31 | Do'kon | Paket va funksiyalar | `Owner-Billing`, `Owner-Plan` | to'lov kechikdi |
| 32 | Do'kon | Integratsiyalar | `Integrations-Model` | sinxron uzildi |
| 33 | Kuryer | Ishga kirish | `Onboard-Courier` | hujjat rad etildi |
| 34 | Kuryer | Smena va topshiriqlar | `Courier-Shift`, `Courier-Tasks` | GPS ruxsati yo'q |
| 35 | Kuryer | Marshrut, topshirish, topshirib bo'lmadi | `Courier-Route`, `Courier-Deliver`, `Courier-Fail` | oflayn |
| 36 | Kuryer | Hisobim va reyting | `Courier-Account`, `Courier-Rate` | — |
| 37 | Admin | Do'konlar va paket konstruktori | `Admin-SaaS`, `Admin-Tenants`, `Admin-Plans` | — |
| 38 | Admin | Platforma kuryerlar puli | `Admin-CourierPool` | kuryer yetishmaydi |
| 39 | Admin | Oferta va rozilik markazi | `Admin-Consents` | — |
| 40 | Admin | Ichki tahlil | `Data-Customer360`, `Data-Funnel` | — |

**Eslatma:** #32 Integratsiyalar ekrani uchun alohida panel ekrani hali yo'q — `Integrations-Model` sxemasi va `Panel-Stock` asos bo'ladi. `Owner-Billing` va `SaaS-Landing` dagi `[NARX]` joylari eskirgan: narxlar `Owner-Plan` va `05_spetsifikatsiya_json/plans.json` da.
