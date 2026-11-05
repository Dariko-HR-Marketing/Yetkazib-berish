# 6. Funksional talablar

Barcha formatlar uchun buyurtma karkasi bitta; katalog, yig'ish, topshirish va qaytarish qoidalari biznes profili va filial sozlamalarida yuritiladi. Har bir talab `backlog/backlog.csv` dagi epik va user storyga bog'langan.

## 6.1. Biznes profillari

| Kod | Profil | Maxsus talablar | Sinov misoli | Ust. |
| --- | --- | --- | --- | --- |
| FR-P01 | Kichik do'kon | Qo'lda mavjudlik va band qilish, ish vaqti, minimal savat, oddiy yig'ish ro'yxati, sotuvchining qo'lda tasdig'i | Sotuvchi tasdiqlamaguncha xaridorga yakuniy «qabul qilindi» xabari ketmaydi | M |
| FR-P02 | Supermarket | SKU, shtrix-kod, filial qoldig'i, tarozili mahsulot, muqobil, paketlar, sovuq mahsulot yig'ish tartibi | 1 kg olma 1,08 kg chiqadi; yakuniy narx rozilik chegarasi va to'lov qoidasiga ko'ra yangilanadi | M |
| FR-P03 | Restoran / kafe | Menyu, porsiya, modifikatorlar, stop-list, oshxona navbati, tayyorlash vaqti | Tushlikda oshxona band bo'lsa, tizim yangi vaqtni taklif qiladi | M |
| FR-P04 | Nooziq-ovqat | Rang/o'lcham varianti, og'irlik va hajm, mo'rt bayrog'i, qaytarish sababi, zarur toifada seriya raqami | Katta quti uchun faqat mos transport chiqadi; qatorda aniq variant saqlanadi | S |

## 6.2. Xaridor vitrinasi

| Kod | Talab | Ust. |
| --- | --- | --- |
| FR-ADR | Manzilni xaritada pin, mo'ljal, podyezd, qavat, xonadon bilan kiritish; saqlangan manzillar | M |
| FR-ZONE | Manzil bo'yicha xizmat hududi va mos filialni aniqlash; hududdan tashqarida aniq xabar | M |
| FR-CAT | Kategoriya, qidiruv, filtr, mahsulot kartochkasi; mavjudlik filial bo'yicha | M |
| FR-CART | Savat: minimal summa, yetkazish haqi, chegirma, paket; bitta savat = bitta filial | M |
| FR-SLOT | «Imkon qadar tez» yoki slot tanlash, sig'imga qarab | M |
| FR-SUB | Almashtirish qoidasi: «o'xshashini taklif qil» / «olib tashla» / «qo'ng'iroq qiling»; rozilik chegarasi | M |
| FR-PAY | To'lov usuli: onlayn (bitta provayder), topshirishda naqd yoki karta | M |
| FR-AUTH | Telefon raqami va OTP bilan kirish; mehmon sifatida buyurtma | M |
| FR-TRK | Holat sahifasi: bosqichlar, taxminiy vaqt, kuryer bilan bog'lanish; tokenli havola | M |
| FR-SUP | Holat sahifasidan mahsulot qatori bo'yicha murojaat, surat ilova qilish | M |
| FR-HIST | Buyurtmalar tarixi, takroriy savat (narx va qoldiq qayta tekshiriladi) | S |
| FR-LANG | O'zbek (lotin) va rus tillari; mobil va desktop; PWA | M |

## 6.3. Hamkor portali

| Kod | Talab | Ust. |
| --- | --- | --- |
| FR-PT01 | Hamkor va filiallar profili, brend (logotip, rang), domen yoki yo'l | M |
| FR-PT02 | Katalog/menyu: CRUD, variant, modifikator, rasm, CSV import/eksport | M |
| FR-PT03 | Filial bo'yicha narx, qoldiq, stop-list, ish vaqti, bayram jadvali | M |
| FR-PT04 | Xizmat hududi (poligon/radius), tarif, minimal savat, slot sig'imi | M |
| FR-PT05 | Buyurtmalar ro'yxati, qo'lda tasdiq, bekor qilish sababi | M |
| FR-PT06 | Hisobotlar: sotuv, o'rtacha chek, bekor sabablari, kanal bo'yicha buyurtmalar, buyurtma hissasi | S |
| FR-PT07 | Xodimlar va rollarni boshqarish | M |

## 6.4. Ishchi panellar

| Kod | Panel | MVPdagi amallar | Ust. |
| --- | --- | --- | --- |
| FR-PK | Yig'uvchi / oshxona | Navbat, mahsulotni belgilash, shtrix-kod (kamera), vazn va muqobil, «tayyor», «qadoqlandi», oshxona chiptasi | M |
| FR-DSP | Dispetcher | Jo'natmalar xaritasi, biriktirish va qayta biriktirish, yuk sig'imi va transport turi, kechikish ogohlantirishi | M |
| FR-CR | Kuryer (mobil veb) | Topshiriqni qabul qilish, olib ketish, navigatsiyaga havola, qo'ng'iroq, PIN yoki surat, muvaffaqiyatsiz topshirish sababi | M |
| FR-POD | Topshirish dalili | 4 xonali PIN; ruxsat bo'lsa — eshik oldidagi surat; dalil buyurtmaga bog'lanadi | M |
| FR-CS | Yordam xizmati | Murojaatlar navbati, buyurtma va to'lov tarixi, qisman yoki to'liq qaytarish so'rovi | M |
| FR-FIN | Moliya | Kun yakuni solishtiruvi: buyurtmalar ↔ to'lovlar ↔ qaytarishlar; eksport | M |
| FR-ADM | Administrator | Hamkor ulash, profil shablonlari, rollar, audit jurnali, tizim sozlamalari | M |

## 6.5. Rollar va ruxsatlar matritsasi

| Rol (`role` kodi) | Ko'radi | O'zgartiradi | Cheklov |
| --- | --- | --- | --- |
| Xaridor (`customer`) | O'z buyurtmalari | Savat, manzil, murojaat | Faqat o'z ma'lumotlari |
| Hamkor egasi (`tenant_owner`) | Barcha filiallari | Hamkor sozlamalari, xodimlar | Faqat o'z tenanti |
| Filial menejeri (`branch_manager`) | O'z filiali | Katalog, qoldiq, jadval, buyurtma | Faqat biriktirilgan filial |
| Yig'uvchi / oshxona (`picker`) | Filial navbati | Yig'ish holatlari | Narx va katalogni o'zgartira olmaydi |
| Dispetcher (`dispatcher`) | Hudud jo'natmalari | Biriktirish | To'lov ma'lumotisiz |
| Kuryer (`courier`) | Faqat o'z topshirig'i | Yetkazish holati | Xaridor aloqasi topshirilgunga qadar va minimal |
| Yordam (`support`) | Murojaatga oid buyurtma | Murojaat, qaytarish so'rovi | Qaytarish limiti rol bo'yicha |
| Moliya (`finance`) | To'lov va qaytarishlar | Qaytarishni tasdiqlash | — |
| Administrator (`platform_admin`) | Hammasi | Platforma sozlamalari | MFA majburiy, har amal auditga |

## 6.6. Xabarnomalar

| Hodisa | Xaridor | Hamkor / filial | Kuryer |
| --- | --- | --- | --- |
| Buyurtma qabul qilindi | SMS/Telegram | Panel + ovozli signal | — |
| Almashtirish tasdiqi kerak | SMS/Telegram + holat sahifasi | — | — |
| Kuryer yo'lga chiqdi | Kuzatuv havolasi | Panel | — |
| Yangi topshiriq | — | — | Panel + push (PWA) |
| Topshirildi | Chek va baholash havolasi | Panel | — |
| Bekor qilindi / qaytarish | SMS/Telegram | Panel | Panel |
