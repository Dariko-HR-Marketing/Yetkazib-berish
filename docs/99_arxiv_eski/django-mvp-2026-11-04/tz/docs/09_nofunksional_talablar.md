# 9. Nofunksional talablar

Quyidagi sonli qiymatlar taklif; ular pilot boshlanishidan oldin texnik rahbar va mahsulot egasi tomonidan tasdiqlanadi.

| Kod | Yo'nalish | Talab |
| --- | --- | --- |
| NFR-01 | Unumdorlik | 50 parallel sessiyada katalog API p95 ≤ 800 ms; buyurtma yaratish p95 ≤ 1,5 s (tashqi servis vaqtisiz, u alohida o'lchanadi) |
| NFR-02 | Vitrina tezligi | Mobil 4G'da birinchi sahifa LCP ≤ 2,5 s |
| NFR-03 | Mavjudlik | Pilotda xizmat ish vaqtida ≥ 99,5% |
| NFR-04 | Zaxira nusxa | Kunlik to'liq va uzluksiz WAL zaxira; RPO ≤ 15 daqiqa, RTO ≤ 4 soat; tiklash mashqi dalolatnoma bilan |
| NFR-05 | Muhitlar | Development, staging va production alohida; staging'da real shaxsiy ma'lumot ishlatilmaydi |
| NFR-06 | Transport xavfsizligi | Faqat HTTPS (TLS 1.2+), HSTS |
| NFR-07 | Autentifikatsiya | Xodimlar: parol + MFA (admin, moliya — majburiy); xaridor: OTP; sessiya muddati cheklangan |
| NFR-08 | Avtorizatsiya | RBAC, tenant izolyatsiyasi serverda va RLS |
| NFR-09 | To'lov xavfsizligi | Karta rekvizitlari saqlanmaydi va loglanmaydi; to'lov provayder sahifasida |
| NFR-10 | Loglar | Korrelyatsiya ID (`X-Request-Id`) va buyurtma raqami bo'yicha qidiruv; shaxsiy ma'lumotlar niqoblanadi |
| NFR-11 | Monitoring | Xatolar, kechikish, navbat uzunligi, to'lov va webhook muvaffaqiyatsizligi bo'yicha ogohlantirish |
| NFR-12 | Audit | Narx, qoldiq, holat, qaytarish va rol o'zgarishlari o'zgarmas audit jurnalida |
| NFR-13 | Moslashuvchanlik | Android, iOS va desktop brauzerlarning oxirgi 2 versiyasi; 360 px kenglikdan |
| NFR-14 | Qulaylik | Asosiy ssenariyda buyurtma ≤ 3 ekran; WCAG 2.1 AA ga yaqin kontrast va shrift |
| NFR-15 | Masshtablash | Yangi hamkorni kod o'zgartirmasdan sozlamalar orqali ulash |
| NFR-16 | Hujjatlash | OpenAPI, arxitektura sxemasi, deploy va tiklash runbooki, ADR |
| NFR-17 | Kod sifati | Avtomatik testlar qamrovi ≥ 70% (yadro modullari ≥ 85%), CI'da linter va testlar majburiy |
| NFR-18 | Lokalizatsiya | Barcha matnlar tarjima fayllarida; sana, valyuta (so'm) va telefon formati O'zbekiston uchun |
