# 3. Tijorat modellari

MVP faqat **brendli vitrina** modelida ishga tushadi; qolgan ikki model uchun arxitekturada joy qoldiriladi, funksional jihatdan keyingi bosqichga o'tkaziladi.

| Model | Kim mijoz bilan ishlaydi | Bosqich | MVPdagi qaror |
| --- | --- | --- | --- |
| Brendli vitrina | Hamkor o'z katalogi, narxi va xizmat shartlarini boshqaradi | MVP (M) | Har hamkorga o'z manzili (subdomen yoki yo'l), filiallar, foydalanuvchi rollari |
| Agregator | Umumiy portal bir nechta sotuvchini ko'rsatadi; xaridor hudud bo'yicha tanlaydi | Keyingi (W) | Komissiya, hisob-kitob, nizolar va sotuvchi javobgarligi uchun alohida model va shartnoma |
| Kuryer xizmati | Buyurtma tashqi kanalda olinadi, platforma olib ketish va topshirishni bajaradi | Keyingi (W); qo'lda — C | MVPda qo'lda dispetcherlik; API tijoriy va texnik sinovdan keyin |

## 3.1. Hamkor uchun xizmat paketlari (taklif)

| Paket | Tarkibi | Ustuvorlik |
| --- | --- | --- |
| Start | Brendli vitrina, QR, operator paneli, qo'lda qoldiq | M |
| Pro | Start + POS/ERP sinxroni, vaqt oralig'i sig'imi, analitika | S |
| Yetkazish | Kuryer adapteri, dispetcherlik, kuzatuv havolasi | S |

Paketlar narxi pilotda har bir paketni ulash va xizmat ko'rsatish xarajati o'lchangandan keyin belgilanadi.
