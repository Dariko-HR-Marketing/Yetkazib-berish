# ADR-003. Idempotentlik va transactional outbox

- **Holat:** Qabul qilingan
- **Sana:** 04.11.2026

## Kontekst

Mobil tarmoq uzilishlari va provayder webhooklarining takroriy yuborilishi ikki marta buyurtma yoki ikki marta undirishga olib kelishi mumkin. Qabul sharti AC-03 va KPI «takroriy undirish = 0» buni taqiqlaydi.

## Qaror

1. Buyurtma, to'lov va qaytarish yaratuvchi barcha `POST` so'rovlar `Idempotency-Key` (UUID) sarlavhasini talab qiladi. Kalit va javob `idempotency_keys` jadvalida 24 soat saqlanadi; takroriy so'rov saqlangan javobni qaytaradi.
2. Kiruvchi webhooklar `(provider, external_event_id)` noyob indeksi orqali bir marta qayta ishlanadi.
3. Biznes o'zgarishi va unga oid hodisa bitta tranzaksiyada yoziladi (`outbox_events`). Worker hodisani yuboradi, muvaffaqiyatda `sent_at` qo'yadi, xatoda eksponensial kechikish bilan qayta urinadi, 10 urinishdan keyin dead-letter holatiga o'tkazadi va operatorga ogohlantirish beradi.

## Oqibatlar

- (+) Takroriy buyurtma va undirish texnik jihatdan imkonsiz.
- (+) Xabarnoma va webhooklar tranzaksiya yo'qolsa ham yo'qolmaydi.
- (−) Hodisalar biroz kechikish bilan (soniyalar) yetkaziladi.
