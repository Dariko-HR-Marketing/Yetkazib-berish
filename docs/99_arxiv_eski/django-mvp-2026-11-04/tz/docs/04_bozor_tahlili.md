# 4. Bozor tahlili va olinadigan yechimlar

Taqqoslash ochiq manbalardagi funksional kuzatuvlarga asoslanadi (manbalar 04.11.2026 holatiga ko'rib chiqilgan). U raqobatchilarning ichki arxitekturasini yoki bizga beriladigan API ruxsatini tasdiqlamaydi.

| Servis · bozor | Kuzatilgan model yoki funksiya | TZga olinadigan yechim | Talab |
| --- | --- | --- | --- |
| Korzinka Go · UZ [1] | Tarmoqning onlayn supermarketi, bir nechta viloyatda | Filial kesimida mavjudlik va xizmat hududi; eshik oldida qoldirish — xaridor tanlovi | FR-CAT, FR-POD |
| Uzum Tezkor · UZ [2] | Vitrinada avval manzil tanlanadi | Manzilga mos hamkor, filial va katalog | FR-ADR |
| Yandex Eats · UZ [3] | Buyurtma bosqichlari va kuryerni kuzatish | Holat va yetib kelish vaqti bitta sahifada | FR-TRK |
| Yandex Delivery · UZ [4] | Ekspress yetkazish, biznes uchun API | Tashqi kuryer adapteri | INT-COUR |
| Uzum Market · UZ [5] | Topshirish punkti yoki kuryer | Nooziq-ovqatda hajmga qarab yetkazish usuli | FR-P04 |
| Instacart · Shim. Amerika [6] | Yig'ishda almashtirish tanlovlari | Mahsulot darajasida muqobil, tasdiq va javob kelmasa qoida | FR-SUB |
| DoorDash / Uber Direct · AQSH [7–8, 22] | O'z sayti + tashqi kuryer; kuzatuv havolasi, PIN yoki surat | Savdo kanali va kuryer tizimini alohida ulash; PoD buyurtmaga bog'lanadi | FR-POD |
| Shopify · global [9] | Masofa yoki indeks bo'yicha mahalliy yetkazish | Filial bo'yicha hudud, tarif, shartlar | FR-ZONE |
| Grab / Meituan · Osiyo [10–11] | Yirik buyurtmani bir necha kuryerga bo'lish; o'z ombor supermarketi | Dispetcherlikda yuk sig'imini tekshirish; ombor modeli keyin | FR-DSP |
| Delivery Hero · global [12] | Hamkor do'konlar va maxsus omborlar | Bitta platformada turli yig'ish manbalari | ADR-001 |

**Xulosa.** Mahalliy bozorda yirik agregatorlar mavjud. Loyihaning raqobat ustunligi — hamkorning o'z brendi, o'z mijoz bazasi va o'z kanallari (QR, Instagram, Telegram) orqali agregator komissiyasisiz savdo qilishi.
