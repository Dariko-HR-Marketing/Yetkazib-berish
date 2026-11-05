# Dostavka SaaS platformasi — to'liq loyiha arxivi (v1, 2026-11-05)

Gibrid SaaS dostavka platformasi uchun barcha qarorlar, talablar, texnik spetsifikatsiya, huquqiy hujjat loyihalari, data strategiyasi va 100 ta UX prototip ekrani — bitta joyda, Claude Code bilan kod yozishga tayyor holatda.

## Qanday boshlash kerak

1. Yangi git repo yarating. Bu arxivdagi `CLAUDE.md` ni repo ildiziga, qolgan papkalarni `docs/` ichiga joylashtiring.
2. `00_boshlash/ZIDDIYATLAR_VA_OCHIQ_SAVOLLAR.md` dagi Z1 (S0 muddati) va O6, O7, O10, O12 savollariga javob bering.
3. Claude Code'ni repo ichida ishga tushiring va `00_boshlash/BIRINCHI_TOPSHIRIQ.md` dagi promptni bering.

## O'qish tartibi

| # | Fayl | Nima uchun |
| --- | --- | --- |
| 1 | `CLAUDE.md` | Claude Code uchun qoidalar: manbalar ustuvorligi, o'zgarmas qoidalar, stek, ish tartibi, DoD |
| 2 | `00_boshlash/QARORLAR.md` | Q1–Q8 va D1–D10 qarorlar, onlayn havolalar |
| 3 | `00_boshlash/HOLAT_HISOBOTI_2026-11-05.md` | Nima tayyor, xavflar, tavsiyalar, 2 haftalik reja |
| 4 | `00_boshlash/ZIDDIYATLAR_VA_OCHIQ_SAVOLLAR.md` | Topilgan 12 ta ziddiyat va 13 ta ochiq savol |
| 5 | `01_prd/01_PRD_va_qarorlar.md` | Gibrid model, 21 funksiya kaliti, 4 paket, kuryer yechimi, 40 ta v1 ekrani, 9 sprint |
| 6 | `01_prd/02_Texnik_spetsifikatsiya.md` | Stek, 18 modul, ma'lumot modeli, API qoidalari, tezlik, adaptivlik, xavfsizlik, testlar |
| 7 | `01_prd/03_S0_spetsifikatsiya_va_hodisalar.md` | Birinchi sprint: 21 qabul mezoni, API, hodisalar lug'ati |
| 8 | `05_spetsifikatsiya_json/` | Kod uchun: flaglar, paketlar, hodisalar, rollar, kuryer, ball, dizayn tokenlari, ekranlar |
| 9 | `04_prototip/EKRANLAR.md` + `skrinshotlar/` | Har ekranning rasmi va v1 ekranlariga moslik |
| 10 | `02_huquqiy/` | Ma'lumotlar reyestri (59 tur), 13 hujjat xaritasi, oferta, DPA, kuryer shartnomasi, maxfiylik siyosati (yurist tasdiqlashi kerak) |
| 11 | `03_data_va_marketing/` | 33 kompaniya tajribasi, 53 ta ma'lumot turi, reklama kanallari, SWOT, hard/soft skills |
| 12 | `01_prd/04_…`, `05_…`, `06_…` | Raqobat va unit-iqtisodiyot, suhbat va pilot rejasi, diagrammalar (Mermaid) |

## Tuzilma

```
dostavka-v1/
├── README.md                      ← shu fayl
├── CLAUDE.md                      ← Claude Code ko'rsatmasi (repo ildiziga)
├── 00_boshlash/                   qarorlar, holat hisoboti, ziddiyatlar, birinchi topshiriq
├── 01_prd/                        PRD, texnik spetsifikatsiya, S0, raqobat, pilot, diagrammalar
├── 02_huquqiy/                    reyestr, xaridor/do'kon/kuryer hujjatlari, maxfiylik
├── 03_data_va_marketing/          mijoz ma'lumotlari va data/reklama strategiyasi
├── 04_prototip/
│   ├── EKRANLAR.md                100 ta ekran ro'yxati + v1 moslik jadvali
│   ├── KORISH.md                  lokal ochish yo'riqnomasi
│   ├── ekranlar/                  101 ta .dc.html + canvas.json + support.js (lokal renderer)
│   └── skrinshotlar/              101 ta PNG
├── 05_spetsifikatsiya_json/       feature_flags, plans, events, roles_permissions,
│                                  courier_dispatch_rules, loyalty_rules, design_tokens, screens
└── 99_arxiv_eski/                 eski TZ paketi, qisman backend, asl PDF (ishlatilmaydi)
```

## Asosiy raqamlar

- MVP: O'zbekiston, uz/ru, Telegram mini-ilova + veb, kuryer ilovasi Android
- 40 ta v1 ekrani, 18 modul, 9 sprint (17–18 hafta), keyin 8 haftalik pilot (20 do'kon)
- 4 paket (Start 0 · Biznes 590 000 · Pro 1 290 000 · Tarmoq 3 mln+ so'm/oy — gipoteza), komissiya yo'q
- 3 kuryer kanali: o'z kuryeri → platforma puli → tashqi API (pilotda puli o'chiq)

## Onlayn versiyalar

Hujjatlar claude.ai'da tahrirlanadigan holda ham bor (havolalar `00_boshlash/QARORLAR.md` da). Arxiv — 2026-11-05 holatidagi nusxa. Onlayn hujjat o'zgarsa, arxivni qayta eksport qiling.
