# 1. Loyiha maqsadi, qamrovi va chegaralari

Platforma har bir hamkorga brendli vitrina va ish paneli beradi, barcha hamkorlar esa bitta umumiy buyurtma yadrosi (OMS) ustida ishlaydi. Xaridor telefon, planshet yoki kompyuter brauzeridan buyurtma beradi; savdo qoidalarini har bir hamkor o'z biznes profili orqali boshqaradi.

## 1.1. Biznes maqsadlar

| Kod | Maqsad | O'lchov |
| --- | --- | --- |
| BR-01 | Kichik va o'rta bizneslarga o'z brendi ostida onlayn savdo va yetkazishni tez ishga tushirish | Hamkorni ulash ≤ 3 ish kuni |
| BR-02 | Turli savdo formatlarini bitta yadroda yuritish | 4 profil bitta OMSda ishlaydi |
| BR-03 | Buyurtmani va'da qilingan vaqtda va to'g'ri summada yetkazish | Pilot KPI (13-bo'lim) |
| BR-04 | Har bir buyurtmaning iqtisodiy samaradorligini ko'rsatish | O'rtacha buyurtma hissasi ≥ 0 |
| BR-05 | Agregator va kuryer xizmati modellariga kengayish imkonini saqlash | Multi-tenant, adapterli arxitektura |

## 1.2. MVP qamroviga kiradi

1. Brendli vitrina (mobil va desktop veb, PWA), o'zbek va rus tillarida.
2. Buyurtma yadrosi: katalog, savat, hudud, narx, rezerv, to'lov, yetkazish, xabarnoma, audit.
3. Hamkor portali; yig'uvchi/oshxona, dispetcher, kuryer, yordam, moliya va administrator panellari.
4. Bitta to'lov provayderi, bitta xabarnoma kanali (SMS yoki Telegram), xarita va qo'lda dispetcherlik.
5. Telegram bot orqali vitrinaga havola (Mini App — S ustuvorlik).
6. Pilot: bitta shahar yoki tuman, bitta xizmat hududi, kamida 2 xil hamkor profili.

## 1.3. MVP qamroviga kirmaydi

1. Agregator rejimi: bir savatda bir nechta sotuvchi, komissiya va o'zaro hisob-kitob.
2. Native mobil ilovalar (App Store / Google Play).
3. Tashqi kuryer xizmatlari bilan avtomatik API ulanishi (adapter interfeysi tayyorlanadi).
4. Uzum Tezkor, Yandex Eats va CRM bilan integratsiya.
5. Instagram DM, WhatsApp Business API, sodiqlik dasturi, talab prognozi.
6. Maxsus (dark store) ombor modeli.

## 1.4. Asosiy cheklovlar

- MVPda bitta savat = bitta hamkor + bitta filial.
- To'lov kartasi rekvizitlari platformada saqlanmaydi.
- Pilot hududi, hamkorlar va provayderlarni buyurtmachi belgilaydi (14-bo'lim).
