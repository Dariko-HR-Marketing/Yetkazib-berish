# 13. Sinov va qabul mezonlari, KPI

Har bir bosqich chiqish natijasi bilan qabul qilinadi; sonli chegaralar pilot boshlanishidan oldin tasdiqlanadi.

## 13.1. Qabul sinovlari

| Kod | Sinov | Qabul sharti |
| --- | --- | --- |
| AC-01 | Qurilma va format | Android, iOS va desktop brauzerda buyurtma oxirigacha yakunlanadi; 4 profil bo'yicha yakuniy summa va holatlar to'g'ri |
| AC-02 | Parallel buyurtma | Oxirgi SKU uchun bir vaqtda 2 buyurtmadan faqat bittasi tasdiqlanadi |
| AC-03 | Takroriy so'rov | Ikki marta yuborilgan so'rov yoki webhook qo'shimcha buyurtma yoki to'lov yaratmaydi |
| AC-04 | Tenant izolyatsiyasi | A hamkor xodimi B hamkor buyurtmasini UI va API orqali ko'ra olmaydi (403/404) |
| AC-05 | Kuryer izolyatsiyasi | Kuryer boshqa topshiriqni ocha olmaydi; topshirilgandan keyin xaridor telefoni yashirin |
| AC-06 | To'lov uzilishi | To'lov javobi kechiksa holat provayderdan tekshiriladi, noaniq holat operatorga tushadi |
| AC-07 | Kuryer rad etishi | Zaxira biriktirish yoki yangi vaqt taklifi ishlaydi |
| AC-08 | Bekor qilish | Rezerv yechiladi, to'lov bo'lsa qaytarish yozuvi yaratiladi, xabarnoma ketadi |
| AC-09 | Almashtirish | Xaridor javob bermasa, 5 daqiqadan keyin oldindan tanlangan qoida qo'llanadi |
| AC-10 | Tarozili mahsulot | Vazn farqi rozilik chegarasida avtomatik, undan oshsa tasdiq orqali hisoblanadi |
| AC-11 | Unumdorlik | NFR-01 qiymatlari yuklama sinovida bajariladi |
| AC-12 | Tiklash | Zaxiradan tiklash RTO ichida bajarilib, dalolatnoma bilan yopiladi |
| AC-13 | Xavfsizlik | OWASP Top 10 bo'yicha tekshiruv; kritik va yuqori zaifliklar yopilgan |

Batafsil ssenariylar shabloni: `qa/qabul_sinovlari.csv`.

## 13.2. Pilot KPI

KPI kamida 100 ta topshirilgan buyurtmada hisoblanadi.

| KPI | Maqsad | Hisoblash asosi |
| --- | --- | --- |
| Va'da qilingan vaqtda yetkazish | ≥ 90% | Topshirilgan buyurtmalardan |
| Mahsulot yo'qligi sabab bekor qilish | ≤ 5% | Tasdiqlangan buyurtmalardan |
| Takroriy undirish | 0 | Barcha to'lovlar |
| O'rtacha buyurtma hissasi | ≥ 0 so'm | 11.1-band formulasi |
| Xizmat mavjudligi | ≥ 99,5% | Ish vaqti bo'yicha |
| Murojaatga birinchi javob | ≤ 10 daqiqa | Ish vaqtidagi murojaatlar |
| Xaridor bahosi (CSAT) | ≥ 4,5 / 5 | Baholangan buyurtmalar |

Jami bekor qilishlar, takroriy buyurtma ulushi va kanal bo'yicha konversiya alohida kuzatiladi.
