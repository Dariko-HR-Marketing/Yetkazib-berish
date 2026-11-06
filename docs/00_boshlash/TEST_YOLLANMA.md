# Test yo'riqnomasi: rollar, hisoblar va sahifalar

Sayt: **https://yetkazish.tajriba24.uz**

## 1. Kirish haqida (muhim)

Hozir kirish soddalashtirilgan (`OPEN_LOGIN=on`): **parol yo'q, SMS kod yo'q, ikkinchi omil yo'q**. Faqat telefon raqami yoziladi, "Kirish" bosiladi. Quyidagi demo raqamlar oldindan tayyorlangan, har biri o'z roli bilan kiradi.

> Xavfsiz emas: istalgan raqam bilan istalgan hisobga kiriladi. Haqiqiy ma'lumot kiritmang. Rasmiy ishga tushirishda `OPEN_LOGIN=off` va `DEMO_SEED=off` qilinadi.

### Demo hisoblar (do'kon: «Demo Do'kon», paket: Tarmoq, 2 filial, 12 mahsulot)

| Rol | Telefon raqami | Birinchi ochiladigan sahifa |
| --- | --- | --- |
| Egasi (owner) | `+998 90 100 00 01` | /katalog |
| Menejer (manager) | `+998 90 100 00 02` | /katalog |
| Yig'uvchi (picker) | `+998 90 100 00 03` | /katalog (faqat qoldiq) |
| Kassir (cashier) | `+998 90 100 00 04` | /katalog (faqat qoldiq, o'qish) |
| Dispetcher (dispatcher) | `+998 90 100 00 05` | /paket |
| Buxgalter (accountant) | `+998 90 100 00 06` | /katalog (o'qish) |
| Marketolog (marketer) | `+998 90 100 00 07` | /katalog (o'qish) |
| Kuryer (courier) | `+998 90 100 00 08` | /paket |
| **Begona do'kon egasi** («Boshqa Do'kon», paket: Start) | `+998 90 100 00 09` | /katalog |
| Platforma admini | `+998 90 100 00 00` | (admin ekrani hali yo'q, faqat API) |

Telefon maydoniga `90 100 00 01` yozish yetarli (+998 o'zi qo'yiladi).

Bir vaqtda bir nechta rolni ko'rish uchun har rolni **alohida brauzer oynasida (inkognito)** oching, aks holda bir brauzerda bitta sessiya bo'ladi.

### Demo ma'lumotlarni ishga tushirish (serverda, bir marta)
Demo ma'lumotlar `DEMO_SEED=on` bo'lsa API har ishga tushganda (ma'lumot bo'lmasa) avtomatik yaratadi. Qo'lda:
```bash
docker compose -f deploy/docker-compose.yml exec api node dist/db/demo-cli.js
```
Jarayon takrorlansa ham ma'lumot ikkilanmaydi.

## 2. Hozir mavjud va hali mavjud bo'lmagan sahifalar

**Bor:** `/kirish`, `/dokon-yaratish`, `/katalog` (katalog + qoldiq), `/import`, `/jamoa`, `/paket`, `/taklif/<token>`, `/hujjat/<kalit>`.
**Hali yo'q (keyingi sprintlar):** xaridor vitrinasi va savat, buyurtmalar, yig'ish ekrani, dispetcher va kuryer ekranlari, to'lov, kassa, ball/sodiqlik, hisobotlar, admin paneli. Dispetcher va kuryer hozircha faqat «Paket va funksiyalar» sahifasini ko'ra oladi; ularning ish ekranlari yo'qligi **xato emas**.

Har sahifada o'ng yuqorida **UZ / RU** tugmasi va **Chiqish** bor. Telefonda ham tekshiring (matn va tugmalar sig'ishi kerak).

## 3. Sahifalar bo'yicha: nimalar bor va nimani tekshirish kerak

### /kirish
- Maydon: telefon. Tugma: «Kirish». Noto'g'ri raqam (qisqa) — tugma o'chiq.
- Tekshiring: yangi (noma'lum) raqam bilan kirsangiz → /dokon-yaratish; demo raqam bilan → /katalog yoki /paket.

### /dokon-yaratish (faqat do'koni yo'q foydalanuvchi)
- Maydonlar: «Do'kon nomi», «STIR».
- Holatlar: STIR 9 raqam bo'lmasa xato («STIR 9 ta raqamdan iborat…»); bo'sh nom — tugma o'chiq.
- Natija: do'kon yaratiladi (egasi siz), /katalog ga o'tadi, avval «Avval filial qo'shing» chiqadi.

### /katalog — «Katalog va qoldiq»
Ko'rinadigan elementlar:
- Yuqorida 4 raqam: Mahsulotlar / Tugayapti / Tugagan / MXIK yo'q (faqat katalog o'qish huquqi borlarda).
- Qidiruv (nomi, artikul, shtrix-kod), filial tanlash (2+ filial bo'lsa), filtrlar: Hammasi / Tugayapti / Tugagan / MXIK yo'q.
- Har mahsulot: nomi, artikul·shtrix-kod·birlik, narx, holat nishoni (**Bor / Kam qoldi (≤5) / Tugadi**), Qoldiq / Band / Sotuvda, qoldiq kiritish maydoni, «Tugadi deb belgilash» / «Sotuvga qaytarish», «Tahrirlash».
- «Mahsulot qo'shish» formasi: nomi (uz/ru), narx (so'mda, masalan `12 500`), birlik (dona/kg/litr), artikul, shtrix-kod (6–14 raqam), MXIK (17 raqam), kategoriya, holat, boshlang'ich qoldiq.

Nimani sinab ko'rish:
1. Demo: «Qatiq» — **Tugadi** (0), «Kefir» — **Kam qoldi** (4), «Pomidor» — **stop-listda** (qoldiq bor, lekin Tugadi), «Olma» — 1,08 kg (kasr).
2. Mahsulot qo'shing; shtrix-kodni takrorlang → «Bu shtrix-kodli mahsulot allaqachon bor».
3. Qoldiqni o'zgartirib «Saqlash»; sahifani yangilang — saqlangan bo'lishi kerak.
4. «Tugadi deb belgilash» → nishon darhol «Tugadi»; «Sotuvga qaytarish» → qaytadi. «Tugagan» filtrida ro'yxat yangilanishi.
5. Narxni o'zgartiring (tahrirlash) — o'zgarish auditga yoziladi (hozir ko'rsatilmaydi, bazada).
6. Tilni RU ga almashtiring — barcha matn ruscha bo'lishi kerak.
7. Filialni almashtiring (Yunusobod filialida demo qoldiq yo'q → hammasi «Tugadi»).

### /import — Excel/CSV
- «Fayl tanlash» (.xlsx yoki .csv, 8 MB, 5 000 qator), «Shablonni yuklab olish», filial tanlash (qoldiq ustuni uchun).
- Avval **ko'rib chiqish**: Yangi / Yangilanadi / O'zgarmaydi / Xato; xato jadvali (qator raqami + sabab); «Xatolar faylini yuklab olish».
- Narxi 30% dan ko'p o'zgargan qatorlar uchun alohida tasdiq katagi. Keyin «Importni boshlash».
- O'ng tomonda: oxirgi yuklashlar tarixi.
- Sinab ko'rish: shablonni yuklab, bir-ikki qatorni buzing (narx «abc», takror shtrix-kod) → xatolar ro'yxatda chiqadi, qolganlari yoziladi. Ustun nomlari uz/ru/en bo'lishi mumkin (nomi, narx, shtrix-kod, qoldiq, birlik, kategoriya).
- Faqat Egasi va Menejer kira oladi; boshqa rollar /katalog ga qaytariladi.

### /jamoa — xodimlar (Egasi: to'liq; Menejer: faqat ko'rish)
- Jadval: a'zolar (telefon maskalangan), rol tanlash (faqat egasi), to'xtatish/yoqish tugmasi, kutilayotgan takliflar.
- O'ngda «Taklif» formasi (faqat egasi): telefon + rol → SMS orqali havola (hozir SMS ketmaydi, havola serverda yaratiladi).
- Limit nishoni: «Xodimlar: N / M». **Start paketli «Boshqa Do'kon»** (`+998 90 100 00 09`) da 3 tadan oshirib taklif qiling → «Paket limiti to'ldi» va «Paketni oshirish» havolasi.
- Boshqa rollar bu sahifani ko'rmaydi (menyuda yo'q); to'g'ridan-to'g'ri ochilsa — ruxsat xatosi.

### /paket — «Paket va funksiyalar» (hamma rol ko'radi, o'zgartirish faqat Egasi)
- Funksiya kalitlari ro'yxati guruhlar bilan, har birida yoqish/o'chirish tugmasi.
- Holatlar: **qulf** («Biznes paketida» kabi nishon — paket yetmaydi), «platforma o'chirgan», bog'liqlik («… yoqilgan bo'lishi kerak»).
- O'ngda limitlar (xodim, filial, buyurtma/oy).
- Sinab ko'rish: Demo Do'kon (Tarmoq) — deyarli hammasi ochiq; Boshqa Do'kon (Start) — ko'p funksiya qulflangan. «Naqd to'lov» yoqiq bo'lsa «O'z kuryerlari»ni o'chirib bo'lmaydi (xato xabari).
- Egasi bo'lmagan rollarda tugmalar o'chiq.

### /taklif/<token>
- Taklif havolasi ochilsa: kirish so'raladi, so'ng taklif qabul qilinadi va xodim do'konga qo'shiladi. Noto'g'ri/eskirgan havola — xato.

### /hujjat/<kalit> (ochiq, kirish shart emas)
- `customer_offer`, `privacy_policy`, `shop_saas_offer`, `shop_dpa`, `courier_agreement`. Hozir matnlarda `[...]` to'ldirilmagan joylar bor (yurist tasdig'i kutilmoqda).

## 4. Rollar bo'yicha: nima ko'rinadi, nima mumkin

Ruxsatlar `roles_permissions.json` jadvalidan (✅ to'liq, 👁 faqat ko'rish, ⛔ yo'q). Sizning sahifalar uchun:

| Rol | Katalog (ko'rish) | Katalog (tahrir, import) | Qoldiq (ko'rish) | Qoldiq (o'zgartirish, «Tugadi») | Jamoa (ko'rish) | Jamoa (taklif, rol) | Paket (ko'rish) | Paket (yoqish/o'chirish) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Egasi | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Menejer | ✅ | ✅ | ✅ | ✅ | 👁 | ⛔ | ✅ | ⛔ |
| Yig'uvchi | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ✅ | ⛔ |
| Kassir | ⛔ | ⛔ | 👁 | ⛔ | ⛔ | ⛔ | ✅ | ⛔ |
| Dispetcher | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ✅ | ⛔ |
| Buxgalter | 👁 | ⛔ | 👁 | ⛔ | ⛔ | ⛔ | ✅ | ⛔ |
| Marketolog | 👁 | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ✅ | ⛔ |
| Kuryer | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ✅ | ⛔ |

Rol bo'yicha kutilgan ko'rinish:
- **Egasi** — hamma narsa; menyu: Katalog va qoldiq, Import, Jamoa, Paket.
- **Menejer** — Egasi bilan bir xil, faqat Jamoada o'zgartira olmaydi va paket funksiyalarini yoqolmaydi (tugmalar o'chiq).
- **Yig'uvchi** — menyuda faqat «Katalog va qoldiq» (qoldiq rejimi: statistika va «Tahrirlash»/«Mahsulot qo'shish» yo'q); qoldiq kiritishi va «Tugadi» belgilashi mumkin; Paket.
- **Kassir** — qoldiqni faqat ko'radi (kiritish maydoni va «Tugadi» tugmalari yo'q).
- **Buxgalter / Marketolog** — katalog statistikasi va ro'yxat bor, lekin tahrir/qoldiq tugmalari yo'q. (Ikkalasida ham qoldiq raqamlari ro'yxatda ko'rinadi, chunki katalog ro'yxati qoldiq ma'lumotini ham qaytaradi; Marketologda qoldiq huquqi yo'q, shuning uchun bu — kuzatiladigan nomuvofiqlik: keyingi tuzatish nomzodi.)
- **Dispetcher / Kuryer** — menyuda faqat «Paket»; ularning ish ekranlari hali yo'q.

**Do'kon nomidan kirish** = Egasi hisobi (`+998 90 100 00 01`). **Yangi do'kon** ochish uchun yangi raqam bilan kiring → «Do'kon yaratish».
**Xodim qo'shish**: Egasi → /jamoa → telefon va rol → «Taklif yuborish». Xodim shu raqam bilan kirib, taklif havolasini ochadi (hozir SMS ketmaydi; havola kerak bo'lsa bazadan olinadi yoki demo hisoblardan foydalaning).

## 5. Izolyatsiya (xavfsizlik) tekshiruvi
1. Ikki oynada: `+998 90 100 00 01` (Demo) va `+998 90 100 00 09` (Boshqa).
2. Har birida faqat o'z do'koni mahsulotlari ko'rinishi kerak («Boshqa do'kon mahsuloti» faqat ikkinchisida).
3. Bir do'konning mahsulot havolasini (id) boshqa hisob bilan ochish — «Topilmadi» (404) bo'lishi kerak, ruxsat xatosi emas.

## 6. Nima topsangiz menga yozing
Har topilmada: sahifa manzili, rol (qaysi raqam), nima qildingiz, nima kutdingiz, nima chiqdi (skrinshot bilan) — shu ma'lumot bilan tez tuzataman.
