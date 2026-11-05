# S1 reja: katalog, qoldiq, Excel/CSV import, MXIK

Manba: PRD §sprintlar (S1), Texnik spetsifikatsiya §3 (`products`, `stock`), prototiplar `Panel-Catalog`, `Panel-Stock`, `Data-ImportExport`.
Qabul mezonlari: **1 000 mahsulot 60 soniyada import**; **«Tugadi» 5 soniyada** xaridor o'qishida ko'rinadi.
S1 maxsus spetsifikatsiya paketi yo'q edi (S0 hisobotida «S0 tugashi bilan tayyorlanadi» deyilgan). Foydalanuvchi ruxsati bilan (2026-11-05) quyidagi qarorlar mustaqil qabul qilindi. Ziddiyat chiqsa — `ZIDDIYATLAR_VA_OCHIQ_SAVOLLAR.md` §D.

## Qarorlar (S1-D)

| # | Qaror | Sabab |
| --- | --- | --- |
| D1 | S0 → S1 o'tish foydalanuvchi ko'rsatmasi bilan; O7 (texnik mas'ul ko'rib chiqishi) ochiq qoladi, har PR'da «inson ko'rib chiqishi» belgisi saqlanadi | foydalanuvchi: «qarorlarni o'zing qabul qil» |
| D2 | Miqdor butun son: **mingdan bir** birlikda (`*_milli`; 1 dona = 1000, 1,08 kg = 1080). Float yo'q | kg/l bilan ishlash, CLAUDE.md §3 |
| D3 | Birliklar: `piece` (dona), `kg`, `l`. Ruscha `шт`, `кг`, `л` import'da taniladi | prototip |
| D4 | Narx — tiyin (butun). Importda matn ko'rinishidan qo'lda ajratiladi (`12 500`, `12500,50`) | float yo'q |
| D5 | Kategoriya tekis (ierarxiyasiz), `sort` bilan; ierarxiya S2+ | oddiylik |
| D6 | Qoldiq filial darajasida (jami). Zal/ombor bo'linishi keyinga qoldirildi | S1 mezoniga kerak emas |
| D7 | `stock_movements` — o'zgarmas jurnal (har o'zgarish: sabab, oldingi/keyingi, kim). `stock` — joriy holat | CLAUDE.md §3 ledger |
| D8 | «Tugadi» = `out_marked` bayrog'i (stop-list) yoki mavjud ≤ 0. Mavjud = `max(0, qoldiq − band)`; hodisa `stock.out_marked` | prototip, events.json |
| D9 | Ommaviy o'qish uchun keshlanmaydi (yoki kesh bekor qilinadi) — «Tugadi» 5 s talabi | S1 mezoni |
| D10 | Import: JSON `{format, content_base64, mode}`; `preview` (hech narsa yozilmaydi) va `apply`. Xato qatorlar o'tkaziladi, qolganlari yoziladi (prototip: «xato — o'tkaziladi»). Moslik kaliti: shtrix-kod, so'ng artikul | prototip |
| D11 | XLSX o'qish: `fflate` (bog'liqliksiz) + o'z XML o'qigichi; xotira/zip-bomba chegarasi. CSV: o'z RFC 4180 o'qigichi (`;` va `,`, BOM) | audit xavfini kamaytirish |
| D12 | Narx 30% dan ko'p o'zgarsa — `confirm_price_jumps: true` bo'lmaguncha qator o'tkazib yuboriladi | prototip |
| D13 | Import chegarasi: 5 000 qator, 8 MB. «Bekor qilish» (undo) S1 doirasida emas — audit yoziladi | vaqt |
| D14 | MXIK: 17 raqam; bo'sh bo'lishi mumkin, panelda «MXIK yo'q» hisobi chiqadi (qo'shimcha xizmat `catalog_mxik` uchun asos). AI to'ldirish S7 | plans.json |
| D15 | Ruxsatlar: `catalog:read/write`, `stock:read/write` (matritsa); egasi/menejer yozadi, yig'uvchi qoldiqni o'qiydi | roles_permissions.json |
| D16 | Yangi funksiya kaliti qo'shilmaydi: katalog — asosiy imkoniyat. `stock.visible` S2 vitrinasida ishlatiladi | feature_flags.json |
| D17 | Ommaviy o'qish endpointi S2 (vitrina) bilan birga; S1'da ichki `StockService.availability()` va panel API | doira |

## Bo'laklar
1. Migratsiya 0009 (kategoriya, mahsulot, qoldiq, harakat, import ishlari) + RLS
2. OpenAPI shartnomasi
3. API: kategoriyalar, mahsulotlar (CRUD, qidiruv, kursor), qoldiq (belgilash, tuzatish, «Tugadi»), import
4. Testlar (qabul mezonlari, RLS, ruxsat, import, 1 000 qator ishlash)
5. Veb: katalog, qoldiq, import sahifalari (uz/ru, 360–1440, a11y), E2E
6. Hisobot, CI yashil
