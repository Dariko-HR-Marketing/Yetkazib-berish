# 2. Atamalar va ishtirokchilar

| Atama | Ta'rif |
| --- | --- |
| Hamkor (tenant) | Platformaga ulangan mustaqil biznes; bir yoki bir nechta filialga ega |
| Filial | Hamkorning savdo yoki tayyorlash nuqtasi; o'z hududi, ish vaqti, qoldig'i va sig'imiga ega |
| Biznes profili | Savdo formati shabloni: kichik do'kon, supermarket, restoran/kafe, nooziq-ovqat |
| Xaridor | Mahsulot yoki taomga buyurtma beruvchi jismoniy shaxs |
| Platforma operatori | Hamkorni ulash, sozlash va texnik nazoratga javobgar tomon |
| OMS | Order Management System — buyurtma, rezerv, to'lov va yetkazish holatlarini yurituvchi yadro |
| SKU | Mahsulotning noyob savdo birligi (variant darajasida) |
| Rezerv | Buyurtma uchun qoldiq yoki vaqt sig'imini vaqtincha band qilish |
| Xizmat hududi | Filial yetkazib beradigan geografik zona (poligon yoki radius) |
| Vaqt oralig'i (slot) | Yetkazish yoki olib ketish uchun sig'imi cheklangan vaqt oynasi |
| Jo'natma | Buyurtmani yetkazish bo'yicha kuryer topshirig'i |
| Topshirish dalili (PoD) | PIN-kod, surat yoki boshqa ruxsat etilgan tasdiq |
| Rozilik chegarasi | Xaridor oldindan ruxsat bergan summa o'sishi (masalan, +10%) |
| Idempotentlik kaliti | Takroriy so'rov ikkinchi marta natija yaratmasligini kafolatlovchi identifikator |
| Outbox | Hodisalarni tranzaksiya bilan birga yozib, keyin ishonchli yuboradigan jadval |

## 2.1. Tomonlar javobgarligi (RACI)

R — bajaruvchi, A — javobgar, C — maslahat beradi, I — xabardor qilinadi.

| Jarayon | Hamkor | Platforma operatori | Kuryer xizmati | To'lov provayderi |
| --- | --- | --- | --- | --- |
| Katalog, narx, qoldiq | A/R | C | — | — |
| Savdoni rasmiylashtirish, fiskal chek | A (ochiq qaror) | R (texnik) | — | C |
| Yetkazish | A | R (dispetcherlik vositasi) | R | — |
| Qaytarish va pulni qaytarish | A | R | C | R |
| Shaxsiy ma'lumotlar | A (ochiq qaror) | R | I | I |
| Platforma ishlashi va xavfsizligi | I | A/R | — | — |
