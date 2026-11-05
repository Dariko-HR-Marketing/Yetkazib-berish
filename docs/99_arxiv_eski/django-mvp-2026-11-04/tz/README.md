# Universal dostavka platformasi — Texnik topshiriq paketi v1.0

DARIKO · 04.11.2026

Bu paket texnik topshiriqni (TZ) bitta Word hujjat sifatida emas, balki **ishlab chiqish jamoasi to'g'ridan-to'g'ri foydalanadigan fayllar to'plami** sifatida beradi: talablar, arxitektura, API shartnomasi, ma'lumotlar bazasi sxemasi, backlog, sinov ro'yxati va ishga tushirish fayllari bir-biriga talab kodlari (FR-, NFR-, AC- …) orqali bog'langan.

## 1. Paket tarkibi

```
dariko-tz/
├── README.md                     ← siz shu yerdasiz: qanday ishlatish
├── DARIKO_TZ_v1.0.docx           ← butun TZ bitta Word faylda (imzolash, chop etish uchun)
├── docs/                         ← TZ bo'limlari (manba matn)
│   ├── 00_hujjat_pasporti.md
│   ├── 01_maqsad_va_qamrov.md
│   ├── 02_atamalar_va_rollar.md
│   ├── 03_tijorat_modellari.md
│   ├── 04_bozor_tahlili.md
│   ├── 05_jarayonlar_va_holatlar.md
│   ├── 06_funksional_talablar.md
│   ├── 07_arxitektura.md
│   ├── 08_integratsiyalar.md
│   ├── 09_nofunksional_talablar.md
│   ├── 10_huquqiy_va_moliyaviy.md
│   ├── 11_innovatsiya_va_iqtisod.md
│   ├── 12_joriy_etish_bosqichlari.md
│   ├── 13_qabul_va_kpi.md
│   └── 14_xavflar_qarorlar_manbalar.md
├── diagrams/                     ← sxemalar (Mermaid)
│   ├── 01_arxitektura.mmd
│   ├── 02_buyurtma_oqimi.mmd
│   ├── 03_holatlar.mmd
│   └── 04_yol_xaritasi.mmd
├── adr/                          ← arxitektura qarorlari
│   ├── ADR-001_modular_monolith.md
│   ├── ADR-002_texnologik_stek.md
│   └── ADR-003_idempotentlik_va_outbox.md
├── api/openapi.yaml              ← REST API shartnomasi (OpenAPI 3)
├── db/
│   ├── schema.sql                ← PostgreSQL + PostGIS sxemasi
│   └── seed_demo.sql             ← 2 ta demo hamkor
├── deploy/
│   ├── docker-compose.yml        ← PostgreSQL, Redis, MinIO, Swagger UI
│   ├── .env.example              ← sozlamalar namunasi
│   └── DEPLOY.md                 ← o'rnatish qo'llanmasi
├── backlog/backlog.csv           ← 30 ta user story, sprint va baho bilan
├── qa/qabul_sinovlari.csv        ← AC-01…AC-13 sinov protokoli
├── data/unit_iqtisodiyot.csv     ← buyurtma hissasi kalkulyatori
└── shablonlar/
    ├── ozgarish_sorovi.md        ← qamrov o'zgarishi uchun
    └── darvoza_dalolatnomasi.md  ← G1–G5 bosqich qabuli
```

## 2. Kim nimadan boshlaydi

| Rol | Birinchi o'qiydi | Keyin ishlatadi |
| --- | --- | --- |
| Mahsulot egasi | `docs/01`, `docs/12`, `docs/14` (ochiq qarorlar) | `backlog/backlog.csv`, `shablonlar/` |
| Operatsion rahbar | `docs/05` (jarayon va istisnolar), `docs/13` (KPI) | `qa/qabul_sinovlari.csv` |
| Texnik rahbar | `docs/07`, `adr/`, `docs/09` | `api/openapi.yaml`, `db/schema.sql`, `deploy/` |
| Dizayner | `docs/05`, `docs/06` (ekranlar va rollar) | `diagrams/02_buyurtma_oqimi.mmd` |
| Backend dasturchi | `docs/07`, `adr/ADR-003` | `api/`, `db/`, `deploy/` |
| Frontend dasturchi | `docs/06`, `api/openapi.yaml` | Swagger UI (http://localhost:8081) |
| QA muhandis | `docs/13`, `docs/05.3` (istisnolar) | `qa/qabul_sinovlari.csv` |
| Yurist / moliya | `docs/10`, `docs/11` | `data/unit_iqtisodiyot.csv` |

## 3. Ish tartibi (bosqichma-bosqich)

1. **Ochiq qarorlarni yoping (G1).** `docs/14_xavflar_qarorlar_manbalar.md` §14.2 dagi 11 ta bandni mahsulot egasi va operatsion rahbar to'ldiradi. Natija `shablonlar/darvoza_dalolatnomasi.md` bilan imzolanadi.
2. **Texnik stekni tanlang.** `adr/ADR-002` dagi holatni «Qabul qilingan» ga o'zgartiring.
3. **Infratuzilmani ko'taring.** `deploy/DEPLOY.md` bo'yicha `docker compose up -d` — baza sxema va demo ma'lumot bilan avtomatik tayyor bo'ladi.
4. **API shartnomasini kelishing (G2).** Frontend va backend `api/openapi.yaml` ni birga ko'rib chiqadi, kerakli o'zgarishlarni kiritadi va tasdiqlaydi.
5. **Backlogni vazifalar tizimiga yuklang.** `backlog/backlog.csv` ni Jira, YouTrack, Trello yoki Linear'ga CSV import qiling; baholarni jamoa bilan qayta ko'rib chiqing.
6. **Sprintlarni boshlang.** `docs/12` §12.1 dagi sprint rejasi bo'yicha; har sprint oxirida staging'da demo.
7. **Qabul sinovlarini o'tkazing (G3).** `qa/qabul_sinovlari.csv` ni to'ldiring; barcha AC o'tgach dalolatnoma imzolanadi.
8. **Pilot va go-live (G4).** `deploy/DEPLOY.md` §5 cheklisti va `docs/13` KPI bo'yicha.
9. **O'zgarishlar.** Qamrovga har qanday qo'shimcha faqat `shablonlar/ozgarish_sorovi.md` orqali.

## 4. Fayllarni qanday ochish

| Fayl turi | Qanday ochiladi |
| --- | --- |
| `.md` | Istalgan matn muharriri, VS Code, GitHub/GitLab (chiroyli ko'rinadi), Obsidian |
| `.docx` | Microsoft Word, Google Docs, LibreOffice |
| `.mmd` (sxemalar) | https://mermaid.live ga nusxa qo'ying; GitHub/GitLab'da avtomatik chiziladi; VS Code uchun «Mermaid Preview» kengaytmasi |
| `openapi.yaml` | https://editor.swagger.io yoki `docker compose up` dan keyin http://localhost:8081 |
| `.sql` | DBeaver, pgAdmin yoki `psql` |
| `.csv` | Excel, Google Sheets (UTF-8 kodlash bilan oching) |

## 5. Hujjatni yangilash qoidasi

- Matnning yagona manbasi — `docs/` papkasi. Word fayl undan avtomatik yig'iladi:

  ```bash
  pandoc docs/*.md -o DARIKO_TZ_v1.0.docx --toc
  ```

- Har bir o'zgarishda `docs/00_hujjat_pasporti.md` §0.2 versiyalar jadvaliga qator qo'shing.
- Paketni Git repozitoriyada saqlash tavsiya etiladi — kim, qachon, nimani o'zgartirgani ko'rinadi.

## 6. Arxitektura qisqacha

Bitta buyurtma yadrosi (OMS) — modular monolith, PostgreSQL + PostGIS, Redis, S3-mos fayl saqlash. Barcha kanallar (veb-vitrina, Telegram, QR) va panellar faqat API orqali ishlaydi; tashqi servislar (to'lov, SMS, xarita, POS, kuryer) adapterlar va outbox navbati orqali ulanadi. Batafsil: `docs/07_arxitektura.md`, `diagrams/01_arxitektura.mmd`.
