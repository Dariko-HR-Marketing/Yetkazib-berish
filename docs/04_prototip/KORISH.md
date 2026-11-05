# Prototiplarni ko'rish

## Eng oson yo'l

- **Rasm:** `skrinshotlar/<Fayl>.png` — har ekranning to'liq rasmi (101 ta, Index bilan).
- **Interaktiv, onlayn:** https://claude.ai/artifact/6gAzZYgso9FUAZ6khmEcYy — barcha ekranlar bitta kanvasda, Index navigatsiyasi bilan.

## Lokal ochish (interaktiv)

`ekranlar/support.js` — oddiy lokal renderer: `{{ }}` qiymatlari, `sc-for`, `sc-if` va bosish hodisalarini qo'llab-quvvatlaydi. Fayllar `fetch` bilan o'qilgani uchun lokal server kerak:

```bash
cd 04_prototip/ekranlar
python3 -m http.server 8080
# brauzerda: http://localhost:8080/Index.dc.html
#            http://localhost:8080/Owner-Plan.dc.html  va h.k.
```

Index'dagi havolalar onlayn kanvas uchun mo'ljallangan. Lokalda faylni to'g'ridan-to'g'ri oching. O'lchamlar `canvas.json` da: mobil 390×844, desktop 1440×900, sxemalar 1440–1600 px.

## Fayl tuzilishi

Har `.dc.html` faylida:

- `<x-dc>` ichida — HTML shablon (inline style, `{{ qiymat }}`, `<sc-for list as>`, `<sc-if value>`);
- `<script type="text/x-dc">` ichida — `class Component extends DCLogic`: `this.state` (interaktiv holat) va `renderVals()` (ekranda ko'rinadigan barcha namunaviy ma'lumot).

Kod yozishda bu fayllar **talab manbai**: matnlar, maydonlar, holatlar, tugmalar va oqim. UI kodi `packages/ui` komponentlari va `design_tokens.json` bilan qayta yoziladi.
