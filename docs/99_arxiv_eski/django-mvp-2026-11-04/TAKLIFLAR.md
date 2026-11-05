# Takliflar: pilotni muvaffaqiyatli o'tkazish uchun

Bu hujjat TZ va ishlab chiqilgan kodga asoslangan **tavsiyalar**. Raqamlar — taxminiy, pilotda o'lchab tasdiqlanadi.

## 1. G1 darvozasi: darhol yopilishi kerak 6 qaror (TZ 14.2)

| Qaror | Tavsiya | Nega |
| --- | --- | --- |
| Pilot hududi | Bitta tuman, ~3 km radius, bitta filial markazida | Kuryer tannarxi masofaga bog'liq; kichik hudud = tez yetkazish va o'rganish |
| Hamkor profillari | **Kichik do'kon + kafe** (supermarket — pilotdan keyin) | Ikki profil buyurtma yadrosini to'liq sinaydi; supermarketning tarozi/muqobil murakkabligi pilot xavfini oshiradi. Kod ularni allaqachon qo'llaydi |
| To'lov provayderi | **Payme** (bitta); topshirishda naqd/karta ham yoniq | Ochiq hujjatlar va Merchant API; CLICK ikkinchi bosqich. Pilotda 50%+ naqd bo'lishi kutiladi — onlayn majburlamang |
| Kuryer modeli | Hamkorning o'z kuryerlari + 1–2 platforma kuryeri; tashqi API (Yandex Delivery) — pilotdan keyin | Dispetcherlik va PIN topshirish tayyor; tashqi servis sinovsiz ulash xavfli |
| Xabarnoma | **SMS** (mahalliy provayder), Telegram — keyin | SMS barcha xaridorga yetadi; bot uchun foydalanuvchi avval botni ishga tushirishi kerak |
| Fiskal chek va oferta | Yurist bilan hozir boshlang (LR-01…08) | Eng uzoq jarayon, texnik bloker bo'lib qolishi mumkin |

## 2. Iqtisod: «yetkazish haqi» va minimal savatni qayta ko'rib chiqing

`data/unit_iqtisodiyot.csv` misolida kuryer tannarxi 18 000 → hissa **+5 000**; 24 000 bo'lsa **−1 000**. Ya'ni foyda juda nozik. Tavsiyalar:

1. **Minimal savat ≥ 50 000 so'm**, bepul yetkazish ≥ 150 000 (kod sozlamalari: `min_order`, `free_from`). Hozirgi demo qiymatlar shu mantiqda.
2. Yetkazish haqini **masofa/hudud bo'yicha pog'onali** qiling (bir filialda bir nechta hudud — kod qo'llaydi): yaqin 8 000, uzoq 14 000.
3. **Slotli buyurtmalarni rag'batlantiring** (tinch soatlarga arzonroq yetkazish): kuryer bandligi o'sadi — tannarx tushadi.
4. Hisobotdagi **«manfiy hissali buyurtmalar ulushi»** (`/partner/reports`) ni pilotning asosiy KPI'si qiling; > 20% bo'lsa tarifni o'zgartiring.
5. Hamkor paketlari: Start (vitrina + panel) bepul/arzon, Pro (POS, slot, analitika) — pilot natijasidan keyin narxlang; kuryer xizmatini alohida «Delivery» paketi sifatida.

## 3. Mahsulot: pilotda nimaga e'tibor

- **Birinchi 30 buyurtmani qo'lda kuzating.** Dispetcher panelida `attention` belgili jo'natmalar va `/ops/attention` navbati kundalik ritual bo'lsin.
- **Taymautlar sozlamalari** (`SUBSTITUTION_REPLY_TIMEOUT_SEC`, `CONSENT_INCREASE_PCT_DEFAULT`, `NO_RECIPIENT_WAIT_MIN`) — real xatti-harakatga qarab 2 haftada qayta sozlang.
- **Yig'uvchiga shaxsiy ma'lumot ko'rsatilmaydi**, kuryerga telefon faqat topshirgunga qadar — bu qoidani hamkor shartnomasiga ham kiriting.
- **«Qo'ng'iroq qiling» qoidasi** operatorga yuk: pilotda standart qiymat sifatida `suggest_similar` qoldiring.
- Kichik do'konlar uchun eng katta xavf — **qoldiq to'g'riligi**. CSV import + «stop-list» tugmasi kundalik ish; sotuvchiga 15 daqiqalik o'rgatish va kunlik qoldiq eslatmasini rejalang.

## 4. Texnik tavsiyalar (pilotdan oldin)

| # | Ish | Hajm |
| --- | --- | --- |
| 1 | Staging server (O'zbekiston hududida, LR-03), HTTPS, `docker compose` + zaxira (`pg_dump` + WAL) va **tiklash mashqi** | 3–4 kun |
| 2 | Payme integratsiyasi (`apps/payments/providers.py`: `create_checkout`, `refund`, `check_status`) + sinov hisobi bilan AC-03/06 qayta | 4–5 kun |
| 3 | SMS provayder (`SmsGatewaySender`) ulash va shablonlarni yurist/marketing bilan tasdiqlash | 1–2 kun |
| 4 | PostgreSQL RLS (`tenant_id`) ikkinchi qatlam sifatida; kritik jadvallarga | 0,5 kun |
| 5 | Sentry + `/health` monitoring, outbox `dead-letter` va to'lov `needs_attention` bo'yicha ogohlantirish | 1 kun |
| 6 | AC-11 ni staging'da (alohida yuk generatori) qayta o'lchash; katalog p95 maqsaddan oshsa — qisqa muddatli kesh (3–5 s) | 1 kun |
| 7 | OWASP skaneri va tashqi pentest (AC-13); admin MFA'ni production'da majburiy tekshirish | 3–5 kun |
| 8 | Yandex Maps (geokodlash + poligon chizgich) | 3–4 kun |

## 5. Xavflar va ularning yengillashtirilishi

| Xavf | Ehtimol | Yengillashtirish |
| --- | --- | --- |
| Qoldiq noto'g'ri → ko'p «tugadi» | Yuqori | Stop-list, kunlik CSV, `online_quota`, POS eskirsa qo'lda tasdiq (kodda) |
| Kuryer yetishmaydi/kechikadi | O'rta | Zaxira kuryer, dispetcher ogohlantirishi, slot sig'imini kuryer soniga bog'lash |
| To'lov webhook'i kelmaydi | O'rta | Davriy `check_status` + operator navbati (kodda) |
| Hamkor shaxsiy ma'lumotni noto'g'ri ishlatadi | O'rta | Rol cheklovlari, audit, oferta shartlari (LR) |
| Pilot hajmi kam → xulosa chiqmaydi | O'rta | 100 topshirilgan buyurtma + 4 hafta chegarasi (TZ 13); marketingni oldindan rejalang |
| Provayder/yurist kechikishi | Yuqori | G1 ni hozir boshlash; shu vaqtda mock bilan ichki demo |

## 6. Tavsiya etilgan keyingi 6 hafta

| Hafta | Maqsad |
| --- | --- |
| 1 | G1 qarorlari imzolanadi; staging ko'tariladi; demo hamkorlar bilan ichki sinov (shu repozitoriy kodi) |
| 2 | Payme + SMS ulanadi; real qurilmalarda AC-01; hamkor/kuryer o'rgatish materiallari |
| 3 | Yopiq pilot: 1–2 hamkor, 20–30 buyurtma, kundalik tahlil; xatolar tuzatiladi |
| 4 | RLS, monitoring, tiklash mashqi (AC-12), yuk sinovi (AC-11) |
| 5 | Pentest (AC-13) tuzatishlari; ochiq pilot (G3 qabul sinovlari) |
| 6 | KPI (TZ 13) bo'yicha G5: kengaytirish yoki to'xtatish qarori |
