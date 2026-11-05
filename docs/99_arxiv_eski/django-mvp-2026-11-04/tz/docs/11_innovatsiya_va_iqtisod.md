# 11. Innovatsion xizmatlar va unit-iqtisodiyot

Har bir innovatsiya pilotda o'lchanadigan ko'rsatkich bilan tekshiriladi; murakkab funksiyalar asosiy jarayon barqarorlashgandan keyin kengaytiriladi.

| Funksiya | Mexanizm | Qiymatni tekshirish ko'rsatkichi | Ust. |
| --- | --- | --- | --- |
| Brendli vitrina va QR | Har filialga alohida sahifa; peshtaxta QR yoki Instagram havolasi kerakli katalogga olib boradi | Kanal bo'yicha tasdiqlangan buyurtmalar va konversiya | M |
| Aqlli almashtirish | Xaridor oldindan qoida tanlaydi; muqobil narxi rozilik chegarasiga solishtiriladi | Yetishmovchilikdan bekorlar, tasdiq vaqti | M (qoidali) |
| Sig'imga bog'langan vaqt | Oshxona/yig'uvchi vaqti va kuryer yuklamasi asosida slot taklifi | Va'dadagi yetkazish ulushi, kechikish daqiqalari | M (limit), W (prognoz) |
| Yagona yordam oynasi | Holat sahifasidan aniq mahsulot bo'yicha murojaat; operator to'liq tarixni ko'radi | Birinchi javob va hal qilish vaqti | M |
| Gibrid kuryer | O'z kuryeri band bo'lsa — hamkor xizmati; keyin narx/vaqt bo'yicha avtomatik tanlov | Qabul qilinmagan jo'natmalar, tannarx, sifat | C / W |
| Takroriy savat | Avvalgi savatni qayta ochish, narx va qoldiq qayta tekshiriladi | Takroriy buyurtma ulushi | S |
| Baholash | Topshirilgandan keyin 1–5 baho va izoh | CSAT | S |

## 11.1. Bir buyurtmaning iqtisodiy hissasi

Hissa = Yalpi foyda + Yetkazish haqi − Yig'ish − Qadoq − Kuryer − To'lov komissiyasi − Boshqa o'zgaruvchan xarajatlar (chegirma, qaytarish zarari, xizmat).

Platforma modeli tanlansa, uning komissiya va xizmat daromadi alohida hisoblanadi. Hisob-kitob kalkulyatori: `data/unit_iqtisodiyot.csv`.

| Modda | Misol, so'm | Kuryer +6 000 bo'lsa, so'm |
| --- | --- | --- |
| Mahsulot yalpi foydasi | +26 000 | +26 000 |
| Xaridordan yetkazish haqi | +10 000 | +10 000 |
| Yig'ish | −5 000 | −5 000 |
| Qadoq | −2 000 | −2 000 |
| Kuryer | −18 000 | −24 000 |
| To'lov komissiyasi | −2 000 | −2 000 |
| Boshqa o'zgaruvchan xarajatlar | −4 000 | −4 000 |
| **Hissa** | **+5 000** | **−1 000** |

Misol bozor narxi emas; u kuryer narxining hissaga sezgirligini ko'rsatadi. Tizim har bir buyurtma bo'yicha shu moddalarni hisobotda ko'rsatadi (FR-PT06).
