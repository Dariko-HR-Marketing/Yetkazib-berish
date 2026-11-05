# 12. Joriy etish bosqichlari

Loyiha 6 bosqichda, 5 ta tasdiq darvozasi (G1–G5) bilan amalga oshiriladi. Taxminiy umumiy muddat 25–29 hafta; pilot 19–21-haftada boshlanadi. Aniq muddat backlog va smetadan keyin belgilanadi. Sxema: `diagrams/04_yol_xaritasi.mmd`.

| № | Bosqich | Davomiyligi | Mas'ul | Chiqish natijasi | Darvoza |
| --- | --- | --- | --- | --- | --- |
| 1 | Diagnostika va qamrov | ≈2 hafta | Mahsulot egasi, operatsion rahbar | Qamrov va ochiq qarorlar bayonnomasi | G1 |
| 2 | UX va ma'lumot modeli | ≈3 hafta | Dizayner, texnik rahbar | Prototiplar, holatlar modeli, OpenAPI, backlog, smeta | G2 |
| 3 | MVP ishlab chiqish | ≈10–12 hafta | Dasturlash jamoasi | Staging'da ishlaydigan MVP | — |
| 4 | Integratsiya va QA | ≈3 hafta | QA, texnik rahbar | Qabul sinovlari dalolatnomasi | G3 |
| 5 | Pilot | ≈6–8 hafta | Operatsiyalar, QA | Haftalik KPI hisobotlari | G4 |
| 6 | Kengaytirish qarori | ≈1 hafta | Mahsulot egasi, moliya | Kengaytirish qarori va keyingi backlog | G5 |

## 12.1. Bosqichlar tafsiloti

1. **Diagnostika va qamrov (≈2 hafta)**
    - Pilot hududi, 2 hamkor va ularning profillari tanlanadi.
    - Assortiment hajmi, qoldiq manbasi (POS yoki qo'lda), transport, qaytarish javobgari belgilanadi.
    - To'lov provayderi, xabarnoma kanali va kuryer modeli tanlanadi.
    - Huquqiy bandlar (LR-01…LR-08) bo'yicha ish boshlanadi.
    - **G1:** qamrov va ochiq qarorlar bayonnomasi imzolanadi.
2. **UX va ma'lumot modeli (≈3 hafta)**
    - Xaridor, hamkor, yig'uvchi, dispetcher, kuryer prototiplari (Figma) va foydalanuvchi sinovi (5–7 kishi).
    - Holatlar modeli, ma'lumot sxemasi va OpenAPI shartnomalari yakunlanadi (paketdagi `api/` va `db/` asos qilinadi).
    - Backlog (epik → user story → qabul sharti) va smeta.
    - **G2:** prototip, API shartnomasi va smeta tasdiqlanadi.
3. **MVP ishlab chiqish (≈10–12 hafta, 2 haftalik sprintlar)**
    - Sprint 1: infratuzilma, CI/CD, auth, tenant/filial.
    - Sprint 2: katalog, qoldiq, CSV import.
    - Sprint 3: hudud, savat, slot, narx hisoblash.
    - Sprint 4: rezerv, buyurtma holatlari, outbox.
    - Sprint 5: to'lov, xabarnoma, hamkor portali.
    - Sprint 6: yig'uvchi, dispetcher, kuryer, yordam, moliya panellari.
    - Har sprint oxirida staging'da demo va mahsulot egasi qabuli.
4. **Integratsiya va QA (≈3 hafta)**
    - To'lov, SMS/Telegram, xarita sinov hisoblari bilan; yuklama va xavfsizlik sinovi; zaxiradan tiklash mashqi.
    - Qabul sinovlari 13-bo'lim bo'yicha.
    - **G3:** staging qabul dalolatnomasi.
5. **Pilot (≈6–8 hafta)**
    - Yopiq pilot (xodimlar va tanish xaridorlar, ≈1 hafta), keyin ochiq pilot.
    - Har kuni kechikish, to'lov, qoldiq va murojaatlar solishtiriladi; haftalik KPI hisoboti.
    - **G4:** ishlab chiqarishga chiqish (go-live) qarori; huquqiy bandlar yopilgan bo'lishi shart.
6. **Kengaytirish qarori (≈1 hafta)**
    - KPI, buyurtma hissasi va hamkor yuklamasi baholanadi.
    - **G5:** KPI bajarilsa — yangi filial va hamkorlar ulanadi; keyingi bosqich backlogi ustuvorlashtiriladi.

## 12.2. Jamoa tarkibi (taklif)

| Rol | Soni | Bandlik |
| --- | --- | --- |
| Mahsulot egasi | 1 | To'liq |
| Texnik rahbar / arxitektor | 1 | To'liq |
| UX/UI dizayner | 1 | 1–2 bosqichda to'liq, keyin qisman |
| Backend dasturchi | 2–3 | To'liq |
| Frontend dasturchi | 2 | To'liq |
| QA muhandis | 1 | 3-bosqichdan to'liq |
| DevOps | 1 | Qisman |
| Operatsion rahbar / dispetcher | 1–2 | Pilotda to'liq |
