# Mijoz ma'lumotlari: 33 kompaniya tajribasi va bizga tavsiyalar

Nov 5, 2026 · @Khikmatullo

Platformamiz Amazon, Walmart, Instacart, Tesco va Uber kabi kompaniyalarning o'zi ishlatadigan 5 ta asosiy usulni MVP'da joriy qila oladi: hodisalarni yagona sxemada yozish, yagona mijoz profili, qayta xarid sikli, muqobil mahsulot o'rganish va ETA. Qolgan 7 tasi v2'ga qoladi.

## Qisqa xulosa: 12 ta asosiy tavsiya

| # | Tavsiya | Kimdan olingan | Bizda nima beradi | Versiya |
| --- | --- | --- | --- | --- |
| 1 | Har harakatni yagona hodisalar sxemasida yozish (ko'rish, qidiruv, savat, to'lov, topshirish) | Google Analytics 4, Yandex Metrica, Amazon | Barcha tahlil va AI uchun bitta toza manba | v1 |
| 2 | Yagona mijoz profili: o'zi aytgani + xulqi + xaridlari (CDP) | Microsoft Dynamics Customer Insights, Tesco Clubcard, Starbucks | Har ekranda mijozni "taniydigan" interfeys | v1 |
| 3 | "Yana olish" va qayta xarid sikli (sut har 3 kunda) | Amazon (Buy again, Subscribe & Save), Instacart, Ocado | Eng tez o'sadigan chek, xaridor vaqti tejaladi | v1 |
| 4 | Muqobil afzalliklarini o'rganish (kim brend almashtirmaydi) | Instacart, Walmart, Baymard tadqiqoti | Rad etilgan muqobillar va qaytarishlar kamayadi | v1 |
| 5 | Real vaqtdagi qoldiq va ETA bashorati | Uber, Instacart, Blinkit/Zepto | Va'da qilingan vaqt to'g'ri, "Tugadi" kam uchraydi | v1 (oddiy), v2 (ML) |
| 6 | Sessiyalarni yozib ko'rish va issiqlik xaritalari | Yandex Metrica (Vebvizor), Microsoft Clarity | Mijoz qayerda qiynalayotgani ko'rinadi, bepul | v1 |
| 7 | Qidiruvni xulq bo'yicha o'rgatish va natijasiz qidiruvlarni yig'ish | Google, Amazon, Wildberries, Ozon | "Topilmadi" kamayadi, katalog bo'shliqlari ko'rinadi | v1 (asos), v2 (ML) |
| 8 | Shaxsiy kuponlar va bonus — xarid tarixiga qarab | Tesco (dunnhumby), Kroger (84.51°), Starbucks, Korzinka | Aksiya puli to'g'ri odamga ketadi | v1 (qoida), v2 (model) |
| 9 | A/B test madaniyati: har o'zgarish o'lchanadi | Booking.com, Amazon, Netflix | Qaror fikrga emas, raqamga tayanadi | v2 |
| 10 | Firibgarlik va risk modeli | Stripe Radar, Kaspi, Uber | Soxta buyurtma va naqd yo'qotishlari kamayadi | v2 |
| 11 | AI agentlar uchun ochiq protokol (MCP, ACP, AP2) | OpenAI + Stripe (ACP), Google (AP2), Anthropic (MCP) | Shaxsiy AI agentlar biz orqali buyurtma bera oladi | v1 beta, v2 |
| 12 | Qonuniy minimum: rozilik, so'rov bo'yicha ma'lumotni berish, tuzatish va o'chirish | Google (My Activity), OpenAI (Memory), Spotify | Ishonch va qonunga muvofiqlik | v1 |

Hujjatda 33 kompaniya ko'rib chiqilgan: siz sanagan 12 tasi va qo'shimcha 21 ta xalqaro kompaniya. Ularning ma'lumot bilan ishlash usuli ochiq manbalar asosida umumlashtirilgan; ichki tafsilotlari kompaniya sirlari hisoblanadi.

## Siz sanagan 12 kompaniya

Har kompaniyadan bizga eng foydali 1–2 ta usul olindi. "O'tay" deganingizni Ozon deb tushundim; boshqa kompaniya bo'lsa, almashtiraman.

| Kompaniya | Qanday ma'lumot yig'adi | Qanday ishlatadi | Bizga mos amaliyot | Versiya |
| --- | --- | --- | --- | --- |
| Google | Qidiruv so'zlari, bosishlar, qurilma, joylashuv; GA4'da hodisalar | Qidiruv natijalari tartibi, reklama, "My Activity" orqali mijoz nazorati | Hodisalarga asoslangan analitika (GA4 kabi); mijozga o'z tarixini ko'rish va o'chirish | v1 |
| YouTube | Ko'rish vaqti, o'tkazib yuborish, "qiziq emas", so'rovnomalar | Tavsiya faqat bosishga emas, mamnunlikka qaraydi | Tavsiyada "bu menga kerak emas" tugmasi va qisqa so'rovnoma | v1 |
| Yandex | Metrica: bosish, aylantirish, Vebvizor (sessiya yozuvi); Lavka va Go buyurtmalari | Sahifa muammolarini topish, superilova ichida tavsiya | Sessiya yozuvi va issiqlik xaritasi; bitta ID bilan bir nechta xizmat | v1 |
| Uber | GPS treklar, vaqt, so'rov turi, tirbandlik | [DeepETA](https://www.uber.com/en-US/blog/deepeta-how-uber-predicts-arrival-times/): marshrut dvigateli ETA'si + ML tuzatish modeli | ETA = xarita hisobi + o'z tariximizdan tuzatish; dinamik yetkazish narxi | v1 oddiy, v2 ML |
| Korzinka | Sodiqlik kartasi QR orqali, bank kartasi bilan to'lovda avtomatik keshbek, xarid tarixi, ilovadagi baholar ([App Store](https://apps.apple.com/uz/app/korzinka/id1454827930)) | Bonus, raqamli chek, Korzinka GO yetkazish | Telefon raqami = yagona sodiqlik ID; raqamli chek; bitta QR | v1 |
| Walmart | Onlayn va do'kon xaridlari, qidiruv, muqobil qabul qilish | Muqobil tavsiyasi, "Walmart+" obunasi, reklama tarmog'i | Muqobilni xaridor tarixidan tanlash; do'kon ichki reklama tarmog'i (v2) | v1, v2 |
| Uzum | Market, Bank, Nasiya ma'lumotlari bitta ekotizimda; sotuvchi analitikasi | Kredit skoringi, shaxsiy vitrina, sotuvchiga talab ma'lumoti | Do'kon egasiga "nimani so'rashyapti" hisoboti; ekotizim ID (Uzum ID) bilan kirish (v2) | v1, v2 |
| Amazon | Ko'rganlar, savat, xaridlar, sharhlar, qidiruv | "Buni olganlar buni ham oldi", "Buy again", Subscribe & Save | Mahsulotdan-mahsulotga tavsiya; takroriy buyurtma; sharhlar xulosasi | v1 asos, v2 |
| Wildberries | Qidiruv, filtr, qaytarishlar, sotuvchi reytingi | Qidiruv tartibiga qaytarish ulushi va reyting ta'sir qiladi | Qidiruv tartibida do'kon reytingi va "Tugadi" ehtimoli | v1 |
| Ozon | Xulq, xaridlar, Ozon Bank, sotuvchi ma'lumotlari | Shaxsiy vitrina, sotuvchilarga reklama va analitika | Do'konlarga talab va raqobat analitikasi | v2 |
| Microsoft | Clarity: bosish, aylantirish, "jahl bosishlari" ([bepul](https://es-cr.wordpress.org/plugins/microsoft-clarity/)); Dynamics: yagona mijoz profili | Muammoli sahifalarni topish, CDP segmentlari | Clarity'ni vitrinaga darhol ulash (shaxsiy ma'lumot avtomatik yashiriladi) | v1 |
| OpenAI | ChatGPT xotirasi (foydalanuvchi boshqaradi), xarid niyati | [Instant Checkout va ACP](https://stripe.com/newsroom/news/stripe-openai-instant-checkout): agent karta ma'lumotini ko'rmaydi, faqat bitta savatga cheklangan token | Agent buyurtmasi uchun bitta do'kon va bitta summaga cheklangan token | v1 beta |
| Google (AP2) | Agent to'lovlari uchun raqamli ruxsatnomalar | [AP2](https://the-decoder.com/google-introduces-open-protocol-for-ai-agent-payments/): mijoz niyati kriptografik imzo bilan qayd etiladi | Agentga berilgan ruxsat va limitni imzolangan yozuv sifatida saqlash | v2 |

## Qo'shimcha 21 ta xalqaro kompaniya

Oziq-ovqat yetkazish va sodiqlik bo'yicha eng kuchli kompaniyalar tanlandi, chunki ular bizning modelimizga eng yaqin.

| Kompaniya | Soha | Qanday ma'lumot yig'adi va ishlatadi | Bizga mos amaliyot | Versiya |
| --- | --- | --- | --- | --- |
| Instacart | Oziq-ovqat yetkazish | Yig'uvchi har skaner yoki "topilmadi" belgisini model uchun yozadi; har soatda 200 mln mahsulot qoldig'i bashorati, \~130 belgi ([manba](https://tech.instacart.com/predicting-real-time-availability-of-200-million-grocery-items-in-us-canada-stores-61f43a16eafe)) | Yig'uvchining "Tugadi" belgisi = qoldiq signali; ehtimoli past mahsulotni yashirish va oldindan muqobil | v1 qoida, v2 ML |
| Tesco (dunnhumby) | Supermarket | Clubcard xaridlari bo'yicha segmentlar va shaxsiy kuponlar; brendlarga anonim tahlil ([manba](https://www.computerweekly.com/feature/Clubcard-at-30-the-evolution-of-retail-loyalty)) | Shaxsiy kupon; ishlab chiqaruvchilarga anonim talab hisoboti (yangi daromad manbai) | v1, v2 |
| Kroger (84.51°) | Supermarket | Xaridlar tarixidan shaxsiy taklif va ichki reklama tarmog'i | Do'kon ichida ishlab chiqaruvchi reklamasi (retail media) | v2 |
| Ocado | Onlayn supermarket | Har xaridorning "odatdagi savati" va talab prognozi | Bir bosishda "odatdagi savat" | v1 |
| Blinkit, Zepto | 10 daqiqali yetkazish | Mikro-hudud bo'yicha talab, qorong'u ombor qoldig'i | Tuman bo'yicha talab xaritasi; qoldiqni filialga moslash | v2 |
| Meituan | Superilova, yetkazish | Kuryer marshruti va buyurtmalarni guruhlash modeli | Bir kuryerga yaqin manzillarni guruhlash | v2 |
| DoorDash | Yetkazish | Tayyorlash vaqti bashorati, kuryerni biriktirish | Do'kon yig'ish vaqtini o'rganish va ETA'ga qo'shish | v1 |
| Alibaba (Hema, Taobao) | Onlayn + oflayn | Bitta ilova orqali do'kondagi va onlayn xaridlarni birlashtirish | Do'kondagi POS xaridini ham mijoz profiliga ulash | v2 |
| Coupang | Marketpleys | Tezkor yetkazish va obuna (Rocket WOW) xulqi | Obuna: bepul yetkazish evaziga oylik to'lov | v2 |
| Shein | Moda | Real vaqtdagi talab signallari bo'yicha kichik partiyalar | Natijasiz qidiruvdan yangi mahsulot taklifi | v2 |
| Netflix | Media | Ko'rish xulqi, katta A/B test madaniyati, shaxsiy muqovalar | Har tavsiya joyini A/B testda o'lchash | v2 |
| Spotify | Media | Tinglash tarixi, "Wrapped" yillik xulosa | Xaridorga yillik "Mening savatim" xulosasi (ijtimoiy tarmoqda ulashish) | v2 |
| Starbucks | Sodiqlik | Rewards ilovasi orqali to'lov, buyurtma va shaxsiy taklif | Ilovada oldindan to'lov va bonus balansi | v1 |
| Sephora | Go'zallik | Profil: teri turi va afzalliklar (mijoz o'zi aytadi) | AI profili: parhez, oila, brendlar | v1 |
| Booking.com | Sayohat | Minglab parallel A/B testlar | Eksperiment platformasi | v2 |
| Airbnb | Sayohat | Qidiruv tartibi uchun ML, ishonch va reyting tizimi | Ikki tomonlama reyting (xaridor va do'kon) | v1 |
| Grab | Superilova | Yetkazish, to'lov va kredit bitta profilda | Bitta ID bilan to'lov va bonus | v2 |
| Kaspi.kz | Superilova | Bank, marketpleys va to'lov ma'lumotlari birga | Kaspi kabi: to'lov tarixi asosida muddatli to'lov (hamkor orqali) | v2 |
| Stripe | To'lov | Radar: tarmoq bo'yicha firibgarlik modeli | To'lov va buyurtma xulqidan risk balli | v2 |
| Shopify | E-tijorat SaaS | Har do'konga analitika, umumiy tarmoq bo'yicha benchmark | Do'konga "siz kabi do'konlar o'rtachasi" taqqoslovi | v1 |
| Klarna | Muddatli to'lov | Xarid niyati va to'lov intizomi, AI yordamchi | Muddatli to'lov hamkorlari (Uzum Nasiya, Alif) uchun ma'lumot | v2 |

## Qayta tuzilgan ro'yxat: 10 toifa, 53 ta ma'lumot

MVP'da 46 ta ma'lumot yig'iladi, 7 tasi v2'ga qoladi; ulardan 3 tasi v1'da oddiy qoida bilan boshlanib, v2'da ML modelga o'tadi. Har qatorda bu usul qaysi kompaniyadan olingani ko'rsatilgan.

### A. Mijoz o'zi aytgan ma'lumot

| # | Ma'lumot | Qanday yig'iladi | Interfeysda nimaga ishlatiladi | Kimdan | Versiya |
| --- | --- | --- | --- | --- | --- |
| A1 | Til (o'zbek / rus) | Telegram tilidan, keyin tanlov | Butun interfeys, xabar, chek, AI javobi | Google, Yandex | v1 |
| A2 | Manzillar va kirish (podyezd, qavat) | Birinchi buyurtma | Zona, slot, kuryer uchun izoh | Uber, DoorDash | v1 |
| A3 | Oila soni, bolalar | 3 savolli ixtiyoriy so'rovnoma | Qadoq hajmi, retsept miqdori | Ocado, Sephora | v1 |
| A4 | Parhez: halol, laktozasiz, shakarsiz, allergiya | AI profili, faqat mijoz aytsa | Avto-filtr, "sizga mos emas" belgisi | Sephora, Instacart | v1 |
| A5 | Sevimli va "almashtirmang" brendlar | Profil va muqobil rad etishdan | Muqobil qoidasi | Instacart, Walmart | v1 |
| A6 | Xabar va marketing roziligi, kanali | Ro'yxatdan o'tishda, alohida | Kim, qachon, qaysi kanalda xabar oladi | Tesco, Google | v1 |
| A7 | Budjet darajasi | Ixtiyoriy savol | Saralash, tavsiya | Walmart | v2 |

### B. Xulq-atvor

| # | Ma'lumot | Qanday yig'iladi | Interfeysda nimaga ishlatiladi | Kimdan | Versiya |
| --- | --- | --- | --- | --- | --- |
| B1 | Qidiruv so'zlari | Hodisa: `search` | Qidiruvni o'rgatish, sinonimlar (sut / сут / молоко) | Google, Amazon | v1 |
| B2 | Natijasiz qidiruvlar | Hodisa: `search_no_result` | Do'konga "shuni so'rashyapti" hisoboti | Shein, Wildberries | v1 |
| B3 | Ko'rilgan mahsulot va kategoriya, vaqt | `view_item`, `view_category` | "Ko'rganlaringiz", shaxsiy tartib | Amazon, YouTube | v1 |
| B4 | Filtr va saralash | `filter_apply` | Keyingi safar shu filtr birinchi | Wildberries | v1 |
| B5 | Savatga qo'shish va olib tashlash | `add_to_cart`, `remove_from_cart` | Ikkilanishda arzonroq muqobil | Amazon | v1 |
| B6 | Sevimlilar va "Kelganda xabar berish" | `wishlist`, `notify_me` | Kelganda xabar, talab signali | Ozon | v1 |
| B7 | "Qiziq emas" bosilgan tavsiyalar | `dismiss_reco` | Tavsiyadan chiqarish | YouTube | v1 |
| B8 | Sessiya yozuvi, "jahl bosishlari" | Clarity yoki Metrica | Sahifadagi muammolarni topish | Microsoft, Yandex | v1 |
| B9 | Aylantirish chuqurligi, banner ko'rinishi | `impression` | Banner va tavsiya joyini baholash | Netflix | v2 |

### C. Xaridlar

| # | Ma'lumot | Qanday yig'iladi | Interfeysda nimaga ishlatiladi | Kimdan | Versiya |
| --- | --- | --- | --- | --- | --- |
| C1 | Xaridlar tarixi (har qator) | Buyurtma bazasi | "Yana olish", odatdagi savat | Amazon, Ocado | v1 |
| C2 | Qayta xarid sikli har mahsulot bo'yicha | Hisoblanadi | "Sut tugayotgandir" eslatmasi | Amazon Subscribe & Save | v1 |
| C3 | RFM: so'nggi xarid, chastota, summa | Hisoblanadi | Segment, kampaniya | Tesco | v1 |
| C4 | Muqobilni qabul / rad etish | Yig'ish jarayonidan | Muqobil afzalligi | Instacart, Walmart | v1 |
| C5 | Bonus va kupon ishlatish | Sodiqlik moduli | Kupon kimga, qancha | Tesco, Kroger, Korzinka | v1 |
| C6 | Do'kondagi (POS) xaridlar | POS integratsiyasi, telefon raqami bo'yicha | Onlayn + oflayn yagona profil | Alibaba Hema, Korzinka | v2 |
| C7 | To'lov usuli va muvaffaqiyati | To'lov webhooklari | Standart usul, rad etilsa zaxira | Stripe | v1 |

### D. Hozirgi holat (kontekst)

| # | Ma'lumot | Qanday yig'iladi | Interfeysda nimaga ishlatiladi | Kimdan | Versiya |
| --- | --- | --- | --- | --- | --- |
| D1 | Vaqt, kun, bayram, Ramazon | Kalendar | Mavsumiy vitrina (iftor, Navro'z) | Tesco, Uzum | v1 |
| D2 | Kanal va manba (Telegram, Instagram, AI agent) | UTM, `source` maydoni | Kanal bo'yicha taklif va hisobot | Google | v1 |
| D3 | Zona, bo'sh slot, yetkazish narxi | Real vaqt | Savatda oldindan ko'rsatish | Baymard, DoorDash | v1 |
| D4 | Qurilma va internet tezligi | Brauzer | Yengil rasm rejimi | Google | v1 |
| D5 | Ob-havo | Tashqi API | Issiqda suv va muzqaymoq | Meituan | v2 |

### E. Niyat signallari

| # | Ma'lumot | Qanday yig'iladi | Interfeysda nimaga ishlatiladi | Kimdan | Versiya |
| --- | --- | --- | --- | --- | --- |
| E1 | So'rov turi: aniq yoki umumiy | Qidiruv tahlili | Aniq — tez natija; umumiy — g'oya va to'plam | Google | v1 |
| E2 | AI yordamchiga so'rov (retsept, ro'yxat surati) | Chat jurnali | Savat tayyorlash | OpenAI, Instacart | v1 |
| E3 | Savat tarkibi | Savat | "Zira yetishmayapti" | Amazon | v1 |
| E4 | Qayta-qayta ko'rish, narx solishtirish | Hodisalar ketma-ketligi | Ikkilanishda ishonch belgisi yoki kupon | Booking.com | v2 |

### F. Ketish sabablari

| # | Ma'lumot | Qanday yig'iladi | Interfeysda nimaga ishlatiladi | Kimdan | Versiya |
| --- | --- | --- | --- | --- | --- |
| F1 | Voronka: katalog → savat → checkout → to'lov | Hodisalar | Qaysi qadamda yo'qotish | Baymard, Google | v1 |
| F2 | Qadamdagi xato va kutish vaqti | Monitoring | Tezlikni tuzatish | Microsoft Clarity | v1 |
| F3 | "Tugadi" mahsulotni ko'rib ketganlar | `view_out_of_stock` | Muqobil va "kelganda xabar" | Instacart | v1 |
| F4 | Ketishdagi bitta savol "Nima to'xtatdi?" | 4 variantli so'rovnoma | Sabablarni bevosita bilish | Baymard | v1 |
| F5 | Tashlab ketilgan savat | Savat holati | 1 soatdan keyin bitta eslatma (rozilik bilan) | Amazon | v1 |

### G. Mijoz ovozi

| # | Ma'lumot | Qanday yig'iladi | Interfeysda nimaga ishlatiladi | Kimdan | Versiya |
| --- | --- | --- | --- | --- | --- |
| G1 | Sharh, yulduz, teglar | Baholash ekrani | Reyting, do'konga xulosa | Airbnb, Wildberries | v1 |
| G2 | Murojaat va sababi | Qo'llab-quvvatlash | Takrorlanuvchi muammo | Uber | v1 |
| G3 | AI va bot yozishmalari | Chat jurnali (anonim tahlil) | Ko'p beriladigan savollar | OpenAI | v1 |
| G4 | CSAT (har buyurtma) va NPS (3 oyda) | Qisqa so'rovnoma | Xizmat sifati trendi | Starbucks | v1 |
| G5 | Kuryer izohi (manzil, kutish) | Kuryer ilovasi | Manzil aniqligi | Uber, DoorDash | v1 |

### H. Hisoblanadigan ko'rsatkichlar ("Mijoz 360")

| # | Ma'lumot | Qanday hisoblanadi | Interfeysda nimaga ishlatiladi | Kimdan | Versiya |
| --- | --- | --- | --- | --- | --- |
| H1 | Segment (RFM) | Qoida | Kampaniya auditoriyasi | Tesco | v1 |
| H2 | Mijozning umrbod qiymati (CLV) | Model | Ushlab qolish xarajati chegarasi | Amazon, Starbucks | v2 |
| H3 | Ketib qolish xavfi | Odatdagi siklidan 2 baravar kechikish | "Sizni sog'indik" taklifi | Netflix, Spotify | v1 qoida, v2 ML |
| H4 | Narxga sezgirlik | Aksiyadagi xulqdan | Kupon kimga kerak, kimga emas | Kroger | v2 |
| H5 | Brendga sodiqlik va muqobilga moyillik | C4 dan | Muqobil tanlash | Instacart | v1 |
| H6 | Keyingi xarid sanasi | C2 dan | Eslatma vaqti | Amazon | v1 |

### I. Operatsion signallar

| # | Ma'lumot | Qanday yig'iladi | Interfeysda nimaga ishlatiladi | Kimdan | Versiya |
| --- | --- | --- | --- | --- | --- |
| I1 | Mahsulot topilish ehtimoli | Yig'uvchi skaneri va "Tugadi" belgilari | Past bo'lsa yashirish, oldindan muqobil | Instacart | v1 qoida, v2 ML |
| I2 | Do'kon yig'ish vaqti | Panel hodisalari | ETA'ga qo'shiladi | DoorDash | v1 |
| I3 | ETA xatosi (va'da va haqiqiy vaqt) | GPS va topshirish | ETA modelini tuzatish | Uber DeepETA | v1 |

### J. AI agent signallari

| # | Ma'lumot | Qanday yig'iladi | Interfeysda nimaga ishlatiladi | Kimdan | Versiya |
| --- | --- | --- | --- | --- | --- |
| J1 | Qaysi agent, qaysi ruxsat, qanday limit | OAuth rozilik yozuvi | Mijoz "Ulangan agentlar" ro'yxati | OpenAI ACP, Google AP2 | v1 beta |
| J2 | Agent so'rovlari va tasdiqlangan buyurtmalar | MCP jurnali | Agentlar orqali savdo hisoboti | OpenAI | v1 beta |

## Texnik asos: ma'lumot qanday aylanadi

Barcha manbalar bitta hodisalar sxemasiga yoziladi; profil va belgilar shu yerdan hisoblanadi va mijoz ekraniga qaytadi.

> **Diagramma** (Mermaid versiyasi: `01_prd/06_Diagrammalar.md`): ma'lumot arxitekturasi · 6 qatlam

MVP uchun real vaqt oqimi, ma'lumot ombori, mijoz profili va oddiy belgilar yetarli. A/B test platformasi va ML modellar v2'da qo'shiladi. Hodisa nomlari (`view_item`, `search_no_result`, `add_to_cart` va boshqalar) GA4 nomlariga yaqin qilib tanlanadi, shunda keyin Google yoki Yandex analitikasiga ulash oson bo'ladi.

## Qonun, etika va nimani ko'chirmaslik kerak

Ma'lumot O'zbekiston qonuni bo'yicha alohida rozilik bilan olinadi; asosiy baza O'zbekistonda saqlanadi (2026-yil martdan bu qonun talabi emas, bizning tanlovimiz). Yirik kompaniyalarning ba'zi usullari bizga mos emas.

**Majburiy qoidalar (v1):**

- "Shaxsiy ma'lumotlar to'g'risida"gi qonun bo'yicha: xizmat uchun rozilik va marketing uchun rozilik alohida, ikkalasi ham uz/ru tilida.
- Sezgir ma'lumot (sog'liq, allergiya, homiladorlik, din) faqat mijoz o'zi aytsa olinadi va hech qachon xulqdan taxmin qilinmaydi.
- Mijoz "Mening ma'lumotlarim" sahifasida hammasini ko'radi, tahrirlaydi, eksport qiladi va o'chiradi (Google My Activity, OpenAI Memory kabi).
- Tahlil faqat kompaniya ichida: mijozga tahlil ekrani ko'rsatilmaydi, u faqat natijani ko'radi (mos mahsulot va taklif).
- Do'kon faqat o'z mijozlarini ko'radi; platforma tahlili va ishlab chiqaruvchilarga hisobot faqat anonim va jamlangan holda.
- Sessiya yozuvida telefon, manzil, karta va parol maydonlari avtomatik yashiriladi.
- Ma'lumot saqlash muddati: xulq hodisalari 24 oy, sessiya yozuvlari 30 kun, keyin o'chiriladi yoki anonimlashtiriladi.

**Ko'chirmaslik kerak:**

| Usul | Kimda uchraydi | Nega bizga mos emas |
| --- | --- | --- |
| Har xaridorga turli narx (shaxsiy narx) | Ba'zi sayohat va taksi xizmatlari | Ishonchni buzadi; aksiya va kupon orqali shaxsiylashtirish yetarli |
| Soxta "oxirgi 1 dona", soxta taymer | Ba'zi marketpleyslar | Aldov; bizda qoldiq haqiqiy (Panel-Stock) |
| Mijoz bilmagan holda uchinchi tomonga ma'lumot sotish | Reklama tarmoqlari | Qonun va ishonch; faqat anonim jamlangan hisobot |
| Ilovadan tashqari kuzatish (boshqa saytlardagi xulq) | Reklama ekotizimlari | Rozilik va qonun xavfi, MVP uchun keraksiz |
| Majburiy ro'yxatdan o'tish | Ko'p saytlar | Baymard bo'yicha xaridorlarning 18% i shu sabab ketadi |

## Prototipga o'tadigan ekranlar

Ro'yxat tasdiqlangach, 7 ta ekran tayyorlanadi; har biri yuqoridagi qatorlarga bog'langan.

1. Shaxsiy bosh sahifa: "Tugayotgan bo'lishi mumkin", "Yana olish", mavsumiy vitrina (C1, C2, D1, H6).
2. Qidiruv: sinonimlar, shaxsiy tartib, natijasiz qidiruvda yordam va "so'rov qoldirish" (B1, B2, E1).
3. Mahsulot kartochkasi: parhezga moslik, topilish ehtimoli (A4, I1).
4. Savat va checkout: yakuniy summa, slot va muqobil afzalligi oldindan, "Nima to'xtatdi?" (D3, C4, F4).
5. "Mening ma'lumotlarim": profil, rozilik, ulangan AI agentlar, o'chirish (A6, J1).
6. Do'kon uchun "Mijoz 360" kartasi (H1–H6, G1).
7. Do'kon uchun voronka va "nimani so'rashyapti" hisoboti (F1, B2).

**Ochiq savollar:**

- "O'tay" deganda Ozon nazarda tutilganmi?
- Sessiya yozuvi uchun qaysi biri: Microsoft Clarity yoki Yandex Metrica? Ikkalasi ham bepul; Metrica ma'lumoti Rossiya serverida saqlanadi, shuning uchun yuristdan so'rash kerak.

## Manbalar

Jadvaldagi havolasiz qatorlar kompaniyalarning ochiq e'lon qilingan amaliyotlari asosida umumlashtirilgan.

- [Instacart — Predicting real-time availability of 200 million grocery items](https://tech.instacart.com/predicting-real-time-availability-of-200-million-grocery-items-in-us-canada-stores-61f43a16eafe)
- [Uber — DeepETA: how Uber predicts arrival times](https://www.uber.com/en-US/blog/deepeta-how-uber-predicts-arrival-times/)
- [Stripe — Instant Checkout in ChatGPT and Agentic Commerce Protocol](https://stripe.com/newsroom/news/stripe-openai-instant-checkout)
- [The Decoder — Google introduces AP2](https://the-decoder.com/google-introduces-open-protocol-for-ai-agent-payments/)
- [Computer Weekly — Clubcard at 30](https://www.computerweekly.com/feature/Clubcard-at-30-the-evolution-of-retail-loyalty)
- [Korzinka — App Store](https://apps.apple.com/uz/app/korzinka/id1454827930)
- [Microsoft Clarity — plugin sahifasi](https://es-cr.wordpress.org/plugins/microsoft-clarity/)
- [Baymard — Cart abandonment rate](https://baymard.com/lists/cart-abandonment-rate)
- [Baymard — Online grocery UX 2026](https://baymard.com/blog/online-grocery-ecommerce-ux-2026)
