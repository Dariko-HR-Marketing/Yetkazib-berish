# 8. Integratsiyalar

Har bir kanal buyurtmani umumiy yadroga olib kiradi. Har bir tashqi ulanish uchun javobgar tizim, MVPdagi ishlash yo'li va uzilishdagi zaxira yo'li belgilanadi.

| Kod | Kanal yoki servis | Almashiladigan ma'lumot | MVP | Zaxira yo'li |
| --- | --- | --- | --- | --- |
| INT-WEB | Brendli sayt / PWA [13] | Vitrina, filial, katalog, savat, buyurtma holati | M | — |
| INT-TG | Telegram bot va Mini App [14] | Bot menyusi, deep link, umumiy savat, holat xabari; serverda `initData` tekshiriladi | Bot havolasi — M; Mini App — S | Veb-vitrina |
| INT-SOC | Instagram / Facebook [15] | Bio, Story, reklama, QR → filial yoki mahsulot sahifasi; UTM bilan manba | Havola + UTM — M; DM API — W | — |
| INT-MSG | SMS / Telegram / WhatsApp [21] | Buyurtma xabarlari, OTP, kuzatuv havolasi | SMS yoki Telegram — M; WhatsApp — W | Ikkinchi kanal yoki operator qo'ng'irog'i |
| INT-PAY | Payme / CLICK [16–17] | Buyurtma ID, summa, tranzaksiya natijasi, qaytarish | Bitta provayder — M | Topshirishda to'lov |
| INT-FISC | Fiskal chek | Chek ma'lumoti, fiskal belgi | Oqim alohida tasdiqlanadi (LR-05) | Hamkorning o'z kassasi |
| INT-MAP | Yandex Maps Geocoder [18] yoki muqobil | Geokodlash, manzil nuqtasi, masofa | M | Qo'lda pin |
| INT-COUR | Yandex Delivery [4] va boshqalar | Tarif so'rovi, jo'natma ID, holat, kuzatuv | Qo'lda dispetcherlik — M; API — W | O'z kuryeri |
| INT-POS | POS / ERP / oshxona | SKU, qoldiq, narx, sotuv, oshxona chiptasi | CSV yoki qo'lda — M; API — S | POS eskirsa avtomatik tasdiq to'xtaydi |
| INT-AGG | Uzum Tezkor, Yandex Eats, CRM | Agregator buyurtmasi, katalog sinxroni, rozilikka asoslangan marketing | W | — |

## 8.1. Adapter interfeysi (dasturchilar uchun)

Har bir tashqi servis bir xil shartnoma orqali ulanadi, shunda provayderni almashtirish yadroga ta'sir qilmaydi.

| Adapter | Majburiy metodlar |
| --- | --- |
| `PaymentProvider` | `create_payment(order, amount, idem_key)`, `get_status(txn_id)`, `refund(txn_id, amount, idem_key)`, `verify_webhook(request)` |
| `MessageProvider` | `send(to, template_code, params, locale)`, `get_status(message_id)` |
| `GeoProvider` | `geocode(text)`, `reverse(lat, lon)`, `distance(a, b)` |
| `CourierProvider` | `quote(shipment)`, `create(shipment)`, `cancel(id)`, `get_status(id)`, `verify_webhook(request)` |
| `PosProvider` | `pull_stock(branch)`, `pull_prices(branch)`, `push_sale(order)` |

## 8.2. Integratsiyani qabul qilish shartlari

Har bir tashqi ulanish quyidagilar yozma tasdiqlangandan keyin ishlab chiqarishga chiqadi:

1. Sinov hisobi va kalitlari olingan, ruxsat va tarif kelishilgan.
2. To'liq va qisman qaytarish imkoniyati tekshirilgan.
3. Hudud qamrovi pilot hududiga mos.
4. Uzilish ssenariylari (timeout, takroriy webhook, javob kelmasligi) sinovdan o'tgan.
5. Shartnoma va ma'lumot uzatish shartlari yuridik tomondan ko'rib chiqilgan.
