# 0. Hujjat pasporti

Ushbu paket DARIKO TZ v0.1 (04.11.2026) asosida qayta ishlangan **Universal dostavka platformasi** texnik topshirig'ining 1.0 versiyasidir. U backlog, smeta, dizayn va dasturlash uchun yagona manba hisoblanadi.

| Parametr | Qiymat |
| --- | --- |
| Loyiha nomi | Universal dostavka platformasi (ishchi nomi) |
| Buyurtmachi | DARIKO |
| Hujjat turi | Texnik topshiriq (TZ): MVP va pilot bosqichi |
| Versiya | 1.0 (v0.1 asosida qayta tuzilgan) |
| Sana | 04.11.2026 |
| Holat | Kelishuv uchun loyiha |
| O'quvchilar | Mahsulot egasi, operatsion rahbar, texnik rahbar, dizayner, dasturlash va QA jamoasi, yuridik va moliya |
| Tasdiqlovchilar | Mahsulot egasi, operatsion rahbar, texnik rahbar |

## 0.1. Talablarni belgilash qoidasi

Har bir talab noyob kodga ega. Shu kod backlog (`backlog/backlog.csv`), sinov ssenariysi va qabul dalolatnomasida ishlatiladi.

| Prefiks | Ma'nosi |
| --- | --- |
| BR | Biznes talab |
| FR | Funksional talab |
| NFR | Nofunksional talab (unumdorlik, xavfsizlik, ishonchlilik) |
| INT | Integratsiya talabi |
| LR | Huquqiy va moliyaviy talab |
| AC | Qabul sharti |
| ADR | Arxitektura qarori |

Ustuvorlik MoSCoW bo'yicha:

- **M (Must)** — MVPda majburiy;
- **S (Should)** — MVPda bo'lishi kerak, ammo kechiktirish mumkin;
- **C (Could)** — imkon bo'lsa;
- **W (Won't now)** — keyingi bosqich.

## 0.2. Versiyalar tarixi

| Versiya | Sana | O'zgarish |
| --- | --- | --- |
| 0.1 | 04.11.2026 | Dastlabki qisqa TZ (9 sahifa) |
| 1.0 | 04.11.2026 | Talablar kodlandi va ustuvorlashtirildi; rollar matritsasi, holatlar modeli, NFR, huquqiy bo'lim, bosqichlar, xavflar, API, DB sxema va deploy fayllari qo'shildi |

## 0.3. v0.1 ga nisbatan asosiy o'zgarishlar

1. Talablar kodlandi va ustuvorlik berildi — smeta va qabulni bir-biriga bog'lash uchun.
2. Rollar va ruxsatlar matritsasi, holatlar modeli va o'tish qoidalari aniqlashtirildi.
3. Nofunksional talablar sonli qiymatlar bilan alohida bo'limga chiqarildi.
4. Shaxsiy ma'lumotlarni O'zbekiston hududida saqlash talabi va fiskal chek oqimi huquqiy bo'limga qo'shildi.
5. Joriy etish bosqichlari muddat, natija, mas'ul va tasdiq darvozalari (G1–G5) bilan berildi.
6. Dasturchilar uchun boshlang'ich texnik artefaktlar: OpenAPI, PostgreSQL sxemasi, docker-compose, backlog.
