# Diagrammalar (Mermaid)

Onlayn hujjatlardagi 5 ta chizma eksportda tushib qolgani uchun bu yerda matnli (Mermaid) ko'rinishda qayta berilgan. Mazmuni onlayn versiya bilan bir xil.

## 1. Gibrid model: uch kirish kanali, bitta do'kon

PRD, "Gibrid model" bo'limi.

```mermaid
flowchart TB
  A["Do'kon vitrinasi (veb)<br/>o'z domeni yoki subdomen<br/>trafik: do'kon marketingi"]
  B["Do'kon Telegram ilovasi<br/>do'kon boti va kanali<br/>doimiy xaridorlar uchun"]
  C["Umumiy katalog (yangi)<br/>platforma: Telegram + veb<br/>yaqin do'konlar, reyting"]
  CORE["Do'kon: bitta katalog, qoldiq, narx va buyurtmalar<br/>qaysi kanaldan kelmasin, buyurtma do'kon paneliga tushadi"]
  PAY["To'lov — do'kon hisobiga<br/>Payme, Click, Uzum, karta; naqd — o'z kuryerida<br/>xaridor puli platformadan o'tmaydi"]
  DEL["Yetkazish: 3 kuryer kanali<br/>o'z kuryeri → platforma puli → tashqi xizmat"]
  PLAT["Platforma daromadi: paket obunasi + qo'shimcha xizmatlar<br/>komissiya yo'q · umumiy katalog — Biznes paketidan"]
  A --> CORE
  B --> CORE
  C --> CORE
  CORE --> PAY
  CORE --> DEL
  DEL -- "kuryer xizmati haqi" --> PLAT
```

## 2. Kuryer tanlash tartibi

PRD, "Kuryer muammosi yechimi" bo'limi. Har kanal do'kon sozlamasida yoqiladi/o'chiriladi; o'chiq kanal tashlab o'tiladi.

```mermaid
flowchart TB
  S["Buyurtma yig'ildi"] --> Q1{"O'z kuryeri bo'shmi?"}
  Q1 -- ha --> OWN["O'z kuryeri olib ketadi<br/>naqd va onlayn to'lov"]
  Q1 -- yo'q --> Q2{"Oldindan to'langanmi?"}
  Q2 -- "yo'q (naqd)" --> WAIT["Naqd: o'z kuryerini kutadi<br/>10 daqiqadan keyin dispetcherga xabar"]
  Q2 -- ha --> POOL["Platforma kuryerlar puli<br/>yaqin kuryerlarga taklif, 3 daqiqa"]
  POOL -- "qabul qilindi" --> POK["Platforma kuryeri"]
  POOL -- topilmadi --> TP["Tashqi xizmat (API)<br/>Yandex Delivery yoki mahalliy hamkor"]
  TP -- "narx tasdiqlansa" --> TOK["Tashqi kuryer"]
```

Pilotda platforma kuryerlar puli o'chiq (yurist xulosasigacha) — u holda zanjir: o'z kuryeri → tashqi xizmat.

## 3. Ma'lumot arxitekturasi: 6 qatlam

"Mijoz ma'lumotlari: 33 kompaniya" hujjati, "Texnik asos" bo'limi.

```mermaid
flowchart TB
  subgraph Manbalar
    V["Vitrina va Telegram<br/>qidiruv, savat, to'lov"]
    K["Kuryer ilovasi<br/>GPS, topshirish, izoh"]
    P["Panel va POS<br/>yig'ish, qoldiq, chek"]
    AI["AI va agentlar<br/>so'rov va ruxsatlar"]
  end
  EV["Yagona hodisalar sxemasi va rozilik filtri<br/>kim, qaysi do'kon, nima, qachon, qaysi kanal · ruxsat yo'q bo'lsa yozilmaydi"]
  V --> EV
  K --> EV
  P --> EV
  AI --> EV
  EV --> RT["Real vaqt oqimi<br/>qoldiq, ETA, savat, to'lov holati"]
  EV --> WH["Ma'lumot ombori<br/>tarix va hisobotlar, kunlik"]
  RT --> CDP["Mijoz profili (CDP)<br/>A–J toifalar, rozilik bilan"]
  WH --> FS["Belgilar ombori<br/>sikl, RFM, topilish ehtimoli"]
  WH --> AB["A/B test (v2)"]
  CDP --> S1[Tavsiya]
  CDP --> S2[Qidiruv]
  FS --> S3["Qoldiq va ETA"]
  FS --> S4[Kampaniya]
  AB --> S5["AI yordamchi"]
  S1 & S2 & S3 & S4 & S5 --> OUT["Shaxsiy ekran: vitrina, savat, eslatma, Mijoz 360<br/>tahlil faqat kompaniya ichida; mijoz faqat natijani ko'radi"]
```

Asosiy baza O'zbekistonda (bizning tanlov); tashqi AI modelga shaxsiy ma'lumot yashirilgan holda boradi.

## 4. SWOT

"Data va reklama strategiyasi", "Kuchli va zaif tomonlar".

| | Yordam beradi | Xalaqit beradi |
| --- | --- | --- |
| **Ichki** | **Kuchli:** o'z ma'lumotimiz (buyurtma, qidiruv, GPS); do'kon, kuryer, to'lov bitta tizimda; uz/ru, Telegram, mahalliy to'lovlar; POS/ERP bilan ham, ularsiz ham ishlaydi; har do'konga o'z brendli do'koni | **Zaif:** yangi brend, ishonch hali shakllanmagan; boshida ma'lumot kam, ML uchun yetmaydi; do'konlarda marketing ko'nikmasi past; kuryerlar do'konniki — sifat har xil; kichik jamoa, data mutaxassisi kam |
| **Tashqi** | **Imkoniyatlar:** internet 89%, Instagram qamrovi 14,1 mln; 2026: ma'lumot qonuni yumshadi; Apple/Google Pay, AI agent savdosi; retail media, anonim talab hisoboti; viloyatlarda onlayn raqobat hali kam | **Xavflar:** Uzum, Korzinka GO va marketpleyslar; Meta va Google reklama narxi o'sishi; qonun va soliq talablari o'zgarishi; ma'lumot sizib chiqsa — ishonch yo'qoladi; tajribali kuryer va xodim yetishmasligi |

## 5. Data va reklamani joriy etish rejasi (4 bosqich)

Har bosqichning oxirgi qatori — keyingi bosqichga o'tish sharti.

```mermaid
flowchart LR
  P0["Tayyorgarlik (0–4 hafta)<br/>DPO tayinlash · reyestrga ariza<br/>rozilik shakli uz/ru · hodisalar lug'ati<br/><b>Shart: reyestr guvohnomasi</b>"]
  P1["O'lchash (5–10 hafta)<br/>hodisalar yozuvi · Clarity, GA4, Metrica<br/>Conversions API · UTM va promo-kodlar<br/><b>Shart: hodisalar 95% to'g'ri</b>"]
  P2["Faollashtirish (11–16 hafta, pilot)<br/>8 ta ko'rsatish qoidasi · Telegram, Instagram<br/>Google va Yandex · sodiqlik, akademiya<br/><b>Shart: CAC ≤ LTV ning 1/3</b>"]
  P3["Optimallashtirish (v2: 4–9 oy)<br/>A/B test · ML prognoz va ETA<br/>retail media · talab hisoboti<br/><b>Shart: har o'zgarish testda</b>"]
  P0 --> P1 --> P2 --> P3
```
