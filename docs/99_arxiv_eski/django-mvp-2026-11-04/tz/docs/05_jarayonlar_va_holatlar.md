# 5. Biznes jarayonlari va holatlar modeli

Buyurtma, to'lov va yetkazish uchta mustaqil holat mashinasida yuritiladi. Har bir o'tish buyurtma tarixiga (audit) vaqt, muallif va sabab bilan yoziladi. Sxemalar: `diagrams/02_buyurtma_oqimi.mmd`, `diagrams/03_holatlar.mmd`.

## 5.1. Asosiy jarayon: buyurtmadan topshirishgacha

1. **Manzil va savat.** Xaridor manzilni pin va mo'ljal bilan kiritadi. Tizim hudud, mos filial, katalog, tarif va bo'sh vaqt oralig'ini tekshiradi.
2. **Rasmiylashtirish.** Vaqt, to'lov usuli, almashtirish qoidasi va rozilik chegarasi tanlanadi. Narx va yetkazish haqi serverda qayta hisoblanadi.
3. **Tasdiq va rezerv.** Filial qoldig'i va vaqt sig'imi atomar band qilinadi, buyurtma raqami beriladi. Kichik do'kon profilida sotuvchi qo'lda tasdiqlaydi (SLA 5 daqiqa, sozlanadi).
4. **To'lov.** Oldindan to'lovda provayder havolasi yoki avtorizatsiya; topshirishda to'lovda holat «kutilmoqda» qoladi.
5. **Yig'ish yoki pishirish.** Yig'uvchi mahsulotlarni belgilaydi, vazn yoki muqobilni kiritadi; oshxona tayyorlik vaqtini yozadi.
6. **Qadoq va yakuniy summa.** Yakuniy savat versiyalanadi. Summa rozilik chegarasidan oshsa, xaridorga tasdiq so'rovi ketadi.
7. **Kuryer va kuzatuv.** Dispetcher yoki tizim kuryerni biriktiradi, kuryer olib ketishni tasdiqlaydi. Xaridorga qisqa muddatli tokenli kuzatuv havolasi yuboriladi.
8. **Topshirish.** PIN yoki ruxsat etilgan dalil bilan topshiriladi; fiskal chek va yordam sahifasi havolasi yuboriladi.
9. **Yopish.** Kun yakunida buyurtma, to'lov va qoldiq solishtiriladi.

## 5.2. Holatlar modeli

| Obyekt | Holatlar ketma-ketligi | Yakuniy holatlar |
| --- | --- | --- |
| Buyurtma (`order_status`) | `created` → `pending_confirmation` → `accepted` → `preparing` → `ready` → `in_delivery` → `completed` | `completed`, `cancelled` |
| To'lov (`payment_status`) | `pending` → `authorized` → `paid` → `refunding` → `refunded` / `partially_refunded` | `paid`, `refunded`, `failed` |
| Yetkazish (`shipment_status`) | `created` → `assigned` → `picked_up` → `on_the_way` → `delivered` | `delivered`, `failed`, `returned` |

O'zbekcha nomlar UI'da: yaratildi, tasdiq kutilmoqda, qabul qilindi, tayyorlanmoqda, tayyor, yetkazilmoqda, yakunlandi, bekor qilindi.

### O'tish qoidalari

- Ruxsat etilmagan o'tish (masalan, `completed` → `preparing`) server tomonidan `409 Conflict` bilan rad etiladi.
- Buyurtma `preparing`gacha xaridor tomonidan bekor qilinishi mumkin; keyin — faqat operator orqali.
- Bekor qilishda rezerv avtomatik bo'shatiladi; to'lov bo'lsa qaytarish yozuvi yaratiladi.
- Har bir holat o'zgarishi `outbox_events` jadvaliga yoziladi va xabarnoma yuboradi (6.6-band).

## 5.3. Istisno holatlar

| Istisno | Operatsion qoida | Mas'ul |
| --- | --- | --- |
| Mahsulot tugadi | Muqobil va yangi narx xaridorga yuboriladi. Javob vaqti (standart 5 daqiqa) tugasa, oldindan tanlangan qoida ishlaydi: muqobil yoki chiqarib tashlash | Yig'uvchi, tizim |
| Vazn yoki narx o'zgardi | Yakuniy summa versiyalanadi. Rozilik chegarasidan oshgan qism tasdiqqa yuboriladi. Provayder qisman qaytarishni qo'llamasa — yakuniy summaga to'lov havolasi yoki topshirishda to'lov | Tizim, yig'uvchi |
| Kuryer yo'q yoki kechikmoqda | Dispetcher zaxira kuryerni biriktiradi yoki yangi vaqt taklif qiladi. Bekor bo'lsa rezerv bo'shaydi, qaytarish boshlanadi | Dispetcher |
| Oshxona band | Tizim sig'imga qarab yangi tayyorlik vaqtini taklif qiladi | Oshxona, tizim |
| Manzilda qabul qiluvchi yo'q | Kamida 2 bog'lanish urinishi va kutish (standart 10 daqiqa) qayd etiladi. Qayta yetkazish yoki qaytarishni mas'ul xodim hal qiladi | Kuryer, yordam |
| Qadoq shikastlangan | Murojaat buyurtma va mahsulot qatoriga bog'lanadi, surat ilova qilinadi. Qaytarish yoki qayta yuborish rasmiylashtiriladi | Yordam xizmati |
| To'lov javobi kelmadi | Holat provayderdan so'rov orqali tekshiriladi; noaniq holat operatorga uzatiladi | Tizim, moliya |
| POS ma'lumoti eskirgan | Avtomatik tasdiq to'xtatiladi, buyurtma qo'lda tasdiqqa o'tadi | Tizim, hamkor |
