import { esc, money, store, uuid, makeApi, toast, beep, fmtTime, fmtDateTime, nameOf } from "/assets/shared.js";

let lang = store.get("lang", "uz");
const api = makeApi({ tokenKey: "staff_token", lang: () => lang });
const $ = (s, r = document) => r.querySelector(s);
const main = $("#main");
const S = { user: null, tenants: [], branch: null, tab: null, timer: null, seen: new Set() };
const L = {
  uz: { login: "Kirish", phone: "Telefon", password: "Parol", mfa: "MFA kodi (Google Authenticator)", orders: "Buyurtmalar", picking: "Yig'ish", catalog: "Katalog", zones: "Hudud va slotlar", staff: "Xodimlar", reports: "Hisobotlar",
    dispatch: "Dispetcher", courier: "Topshiriqlarim", tickets: "Murojaatlar", finance: "Moliya", admin: "Platforma", accept: "Qabul qilish", cancel: "Bekor qilish", reason: "Sabab?", prepare: "Tayyorlashni boshlash", ready: "Tayyor",
    picked: "Yig'ildi", unavailable: "Tugagan", weight: "Haqiqiy vazn (kg)", substitute: "Muqobil", save: "Saqlash", none: "—", new_order: "Yangi buyurtma!", assign: "Biriktirish", pickup: "Olib ketdim", on_the_way: "Yo'ldaman",
    deliver: "Topshirdim (PIN)", fail: "Topshirib bo'lmadi", reject: "Rad etish", contact: "Bog'landim", pin: "4 xonali PIN", enroll: "MFA ni sozlash kerak. Kalitni authenticator ilovasiga kiriting va kodni tasdiqlang:" },
  ru: { login: "Вход", phone: "Телефон", password: "Пароль", mfa: "Код MFA", orders: "Заказы", picking: "Сборка", catalog: "Каталог", zones: "Зоны и слоты", staff: "Сотрудники", reports: "Отчёты",
    dispatch: "Диспетчер", courier: "Мои задания", tickets: "Обращения", finance: "Финансы", admin: "Платформа", accept: "Принять", cancel: "Отменить", reason: "Причина?", prepare: "Начать сборку", ready: "Готов",
    picked: "Собрано", unavailable: "Нет в наличии", weight: "Фактический вес (кг)", substitute: "Замена", save: "Сохранить", none: "—", new_order: "Новый заказ!", assign: "Назначить", pickup: "Забрал", on_the_way: "Еду",
    deliver: "Вручил (PIN)", fail: "Не удалось вручить", reject: "Отказаться", contact: "Связался", pin: "PIN из 4 цифр", enroll: "Нужно настроить MFA. Добавьте ключ в приложение и подтвердите код:" },
};
const t = (k) => L[lang][k] || k;
const ST = { created: "to'lov kutilmoqda", pending_confirmation: "tasdiq kutilmoqda", accepted: "qabul qilindi", preparing: "tayyorlanmoqda", ready: "tayyor", in_delivery: "yetkazilmoqda", completed: "yakunlandi", cancelled: "bekor" };
const roles = () => new Set((S.user?.roles || []).map((r) => r.role));
const has = (...r) => r.some((x) => roles().has(x)) || roles().has("platform_admin");
const err = (e) => toast(e.message || "Xato", "err");
const bind = (sel, ev, fn, root = main) => root.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, () => fn(el)));
async function download(path, name) {
  const r = await api.get(path, { raw: true }); const b = await r.blob(); const a = document.createElement("a");
  a.href = URL.createObjectURL(b); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$("#lang").onclick = () => { lang = lang === "uz" ? "ru" : "uz"; store.set("lang", lang); $("#lang").textContent = lang === "uz" ? "RU" : "UZ"; start(); };
$("#logout").onclick = () => { store.del("staff_token"); S.user = null; clearInterval(S.timer); start(); };
$("#branch").onchange = (e) => { S.branch = e.target.value; store.set("branch", S.branch); show(S.tab); };

// ------------------------------------------------------------------ kirish
function loginView(extra = "") {
  $("#logout").hidden = true; $("#branch").hidden = true;
  main.innerHTML = `<div class="card" style="max-width:420px;margin:24px auto"><h2 style="margin-top:0">${t("login")}</h2>${extra}
    <label for="lp">${t("phone")}</label><input id="lp" type="tel" value="${esc(store.get("last_phone", "+998"))}" autocomplete="username">
    <label for="lw">${t("password")}</label><input id="lw" type="password" autocomplete="current-password">
    <label for="lm">${t("mfa")}</label><input id="lm" inputmode="numeric" maxlength="6" autocomplete="one-time-code">
    <p><button class="primary" id="go" style="width:100%">${t("login")}</button></p><div id="lmsg"></div></div>`;
  const go = async () => {
    const body = { phone: $("#lp").value, password: $("#lw").value, mfa_code: $("#lm").value || undefined };
    try { const r = await api.post("/auth/staff/login", body); store.set("last_phone", body.phone); store.set("staff_token", r.access_token); S.user = r.user; await afterLogin(); }
    catch (e) {
      if (e.code === "mfa_enrollment_required") {
        try {
          const s = await api.post("/auth/mfa/setup", { phone: body.phone, password: body.password });
          $("#lmsg").innerHTML = `<div class="card"><p>${t("enroll")}</p><code style="word-break:break-all">${esc(s.secret)}</code><label for="mc">Kod</label><input id="mc" inputmode="numeric" maxlength="6"><p><button id="mcb" class="primary">OK</button></p></div>`;
          $("#mcb").onclick = async () => { try { await api.post("/auth/mfa/confirm", { ...body, code: $("#mc").value }); toast("MFA yoqildi — qayta kiring", "ok"); $("#lmsg").innerHTML = ""; } catch (x) { err(x); } };
        } catch (x) { err(x); }
      } else err(e);
    }
  };
  $("#go").onclick = go; main.addEventListener("keydown", (e) => e.key === "Enter" && go(), { once: true });
}
async function afterLogin() {
  S.tenants = await api.get("/partner/tenant").catch(() => []);
  const branches = S.tenants.flatMap((t) => t.branches);
  const sel = $("#branch"); sel.innerHTML = branches.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join("");
  S.branch = branches.find((b) => b.id === store.get("branch"))?.id || branches[0]?.id || null; sel.value = S.branch;
  sel.hidden = branches.length < 2; $("#logout").hidden = false;
  $("#ptitle").textContent = `${S.user.full_name || S.user.phone}`;
  nav();
}
function tabsFor() {
  const tabs = [];
  if (has("tenant_owner", "branch_manager")) tabs.push("orders", "catalog", "zones", "reports");
  if (has("tenant_owner")) tabs.push("staff");
  if (has("picker") && !has("tenant_owner", "branch_manager")) tabs.push("picking"); else if (has("tenant_owner", "branch_manager", "picker")) tabs.push("picking");
  if (has("dispatcher", "branch_manager", "tenant_owner")) tabs.push("dispatch");
  if (has("courier")) tabs.push("courier");
  if (has("support")) tabs.push("tickets");
  if (has("finance")) tabs.push("finance");
  if (roles().has("platform_admin")) tabs.push("admin");
  return [...new Set(tabs)];
}
function nav() {
  const tabs = tabsFor();
  if (!tabs.length) { main.innerHTML = `<div class="card">Rol topilmadi</div>`; return; }
  S.tab = tabs.includes(S.tab) ? S.tab : tabs[0];
  main.innerHTML = `<div class="tabs" role="tablist">${tabs.map((k) => `<button role="tab" data-tab="${k}" class="${k === S.tab ? "on" : ""}">${t(k)}</button>`).join("")}</div><div id="tab"></div>`;
  bind("[data-tab]", "click", (b) => { S.tab = b.dataset.tab; nav(); });
  show(S.tab);
}
function show(tab) {
  clearInterval(S.timer); S.seen = new Set();
  const v = { orders, picking, catalog, zones, staff, reports, dispatch, courier, tickets, finance, admin }[tab];
  v && v();
}
const body = () => $("#tab");
function every(fn, ms = 5000) { fn(); S.timer = setInterval(fn, ms); }

// ------------------------------------------------------------------ buyurtmalar (FR-PT05, ovozli signal)
function orders() {
  let first = true;
  every(async () => {
    if (!S.branch) return;
    let d; try { d = await api.get(`/partner/branches/${S.branch}/orders?status=pending_confirmation,accepted,preparing,ready,in_delivery`); } catch (e) { return; }
    const fresh = d.orders.filter((o) => !S.seen.has(o.id)); d.orders.forEach((o) => S.seen.add(o.id));
    if (!first && fresh.length) { beep(); toast(t("new_order"), "ok"); } first = false;
    if (!body()) return;
    body().innerHTML = d.orders.map(orderCard).join("") || `<div class="muted">${t("none")}</div>`;
    bind("[data-to]", "click", async (b) => {
      let reason = ""; if (b.dataset.to === "cancelled") { reason = prompt(t("reason")); if (!reason) return; }
      try { await api.post(`/partner/orders/${b.dataset.id}/transition`, { to: b.dataset.to, reason }); orders(); } catch (e) { err(e); }
    }, body());
  });
}
function orderCard(o) {
  const next = { pending_confirmation: ["accepted", t("accept")], accepted: ["preparing", t("prepare")], preparing: ["ready", t("ready")] }[o.status];
  const late = o.confirm_deadline && new Date(o.confirm_deadline) < new Date() && o.status === "pending_confirmation";
  return `<div class="card"><div class="row sp"><b>№${esc(o.number)}</b><span class="badge ${late ? "bad" : "warn"}">${ST[o.status]}${late ? " · SLA!" : ""}</span><span class="muted">${fmtDateTime(o.created_at)}</span><b class="price">${money(o.final_total ?? o.total)}</b></div>
    <div class="muted">${esc(o.address.text || "")} ${esc(o.address.landmark || "")} · ${esc(o.customer_name || "")} ${esc(o.customer_phone || "")} · ${o.payment_method}${o.manual_reason ? " · " + o.manual_reason : ""}${o.approval_state === "pending" ? " · ⏳ xaridor tasdig'i" : ""}</div>
    <ul style="margin:6px 0">${o.items.map((i) => `<li>${esc(nameOf(i.name, lang))} × ${+(i.actual_qty ?? i.requested_qty)} <span class="muted">${i.status}</span></li>`).join("")}</ul>
    <div class="row">${next ? `<button class="primary" data-id="${o.id}" data-to="${next[0]}">${next[1]}</button>` : ""}${["pending_confirmation", "accepted", "preparing", "ready", "in_delivery"].includes(o.status) ? `<button class="danger" data-id="${o.id}" data-to="cancelled">${t("cancel")}</button>` : ""}</div></div>`;
}

// ------------------------------------------------------------------ yig'ish / oshxona (FR-PK)
let stockList = [];
function picking() {
  api.get(`/partner/branches/${S.branch}/stock`).then((s) => stockList = s).catch(() => {});
  every(async () => {
    let d; try { d = await api.get(`/picking/branches/${S.branch}/queue`); } catch (e) { return; }
    if (!body() || document.activeElement?.closest?.("#tab input,#tab select")) return;
    body().innerHTML = `<div class="card row"><input id="bc" placeholder="Shtrix-kod" inputmode="numeric" style="max-width:240px"><button id="scan" class="sm">📷</button></div>` + (d.orders.map(pickCard).join("") || `<div class="muted">${t("none")}</div>`);
    bind("[data-act]", "click", async (b) => {
      const card = b.closest("[data-item]"); const payload = { action: b.dataset.act };
      if (b.dataset.act === "pick") { const w = $("input.w", card); if (w) { if (!w.value) return toast(t("weight"), "err"); payload.actual_qty = w.value; } const sn = $("input.sn", card); if (sn?.value) payload.serial = sn.value; }
      if (b.dataset.act === "unavailable") { const s = $("select.sub", card); if (s?.value) payload.substitute_variant_id = s.value; }
      try { await api.patch(`/picking/orders/${card.dataset.order}/items/${card.dataset.item}`, payload); picking(); } catch (e) { err(e); }
    }, body());
    bind("[data-to]", "click", async (b) => { try { await api.post(`/partner/orders/${b.dataset.id}/transition`, { to: b.dataset.to }); picking(); } catch (e) { err(e); } }, body());
    bind("[data-prep]", "click", async (b) => { const m = prompt("Daqiqa?", "15"); if (m) try { await api.post(`/picking/orders/${b.dataset.prep}/prep-time`, { minutes: +m }); toast("OK", "ok"); } catch (e) { err(e); } }, body());
    $("#bc").onkeydown = (e) => { if (e.key === "Enter") scanCode(e.target.value, d.orders); };
    $("#scan").onclick = () => cameraScan((c) => scanCode(c, d.orders));
  });
}
function scanCode(code, orders) {
  const it = orders.flatMap((o) => o.items.map((i) => ({ ...i, order: o.id }))).find((i) => stockList.find((s) => s.variant_id === i.variant_id)?.barcode === code || false);
  toast(it ? "✔ " + nameOf(it.name, lang) : "Topilmadi: " + code, it ? "ok" : "err");
}
async function cameraScan(cb) {
  if (!("BarcodeDetector" in window)) return toast("Kamera skaneri bu brauzerda yo'q — kodni qo'lda kiriting", "err");
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).catch(() => null); if (!stream) return;
  const v = document.createElement("video"); v.srcObject = stream; v.playsInline = true; await v.play();
  const m = document.createElement("div"); m.className = "modal"; m.innerHTML = `<div></div>`; m.firstChild.append(v, Object.assign(document.createElement("button"), { textContent: "×", onclick: () => stop() })); document.body.append(m);
  const det = new BarcodeDetector(); let on = true;
  const stop = () => { on = false; stream.getTracks().forEach((x) => x.stop()); m.remove(); };
  (async function loop() { while (on) { try { const r = await det.detect(v); if (r[0]) { stop(); cb(r[0].rawValue); return; } } catch { /* kadr */ } await new Promise((r) => setTimeout(r, 300)); } })();
}
function pickCard(o) {
  const subs = stockList.map((s) => `<option value="${s.variant_id}">${esc(nameOf(s.name, lang))}</option>`).join("");
  return `<div class="card"><div class="row sp"><b>№${esc(o.number)}</b><span class="badge warn">${ST[o.status]}</span>${o.estimated_ready_at ? `<span class="muted">⏱ ${fmtTime(o.estimated_ready_at)}</span>` : ""}${o.approval_state === "pending" ? `<span class="badge bad">⏳ xaridor tasdig'i</span>` : ""}</div>
    ${o.items.map((i) => `<div class="row" data-order="${o.id}" data-item="${i.id}" style="border-top:1px solid var(--line);padding:8px 0"><div style="flex:1;min-width:150px"><b>${esc(nameOf(i.name, lang))}</b> × ${+i.requested_qty} <span class="badge">${i.status}</span></div>
      ${["pending", "picked", "substituted"].includes(i.status) ? `${i.is_weighted ? `<input class="w" inputmode="decimal" placeholder="${t("weight")}" style="width:120px" value="${i.actual_qty ?? ""}">` : ""}<input class="sn" placeholder="seriya №" style="width:110px"><button class="primary sm" data-act="pick">${t("picked")}</button>
      <select class="sub" style="width:150px"><option value="">${t("substitute")}: —</option>${subs}</select><button class="sm danger" data-act="unavailable">${t("unavailable")}</button>` : ""}</div>`).join("")}
    <div class="row" style="margin-top:8px"><button class="primary" data-id="${o.id}" data-to="${o.status === "accepted" ? "preparing" : "ready"}" ${o.status === "ready" ? "disabled" : ""}>${o.status === "accepted" ? t("prepare") : t("ready")}</button>${o.estimated_ready_at ? `<button class="sm" data-prep="${o.id}" title="Tayyorlik vaqti">⏱</button>` : ""}</div></div>`;
}

// ------------------------------------------------------------------ katalog (FR-PT02/03)
async function catalog() {
  body().innerHTML = `<div class="card row"><input type="file" id="csv" accept=".csv,text/csv" style="max-width:260px"><button id="imp">CSV import</button><button id="exp">CSV eksport</button></div>
    <div class="card"><h3 style="margin-top:0">+ Mahsulot</h3><div class="row"><input id="nu" placeholder="Nomi (uz)" style="flex:1"><input id="nr" placeholder="Название (ru)" style="flex:1"><input id="sk" placeholder="SKU" style="width:120px"><input id="pr" placeholder="Narx, so'm" inputmode="decimal" style="width:120px"><input id="qt" placeholder="Qoldiq" inputmode="decimal" style="width:90px"><button id="addp" class="primary">+</button></div></div><div id="stk"></div>`;
  $("#exp").onclick = () => download(`/partner/catalog/export?branch_id=${S.branch}`, "catalog.csv").catch(err);
  $("#imp").onclick = async () => {
    const f = $("#csv").files[0]; if (!f) return; const fd = new FormData(); fd.append("file", f);
    try { const r = await api.post(`/partner/catalog/import?branch_id=${S.branch}`, fd); toast(`Import: ${r.imported}`, "ok"); drawStock(); }
    catch (e) { if (e.body?.errors) alert(JSON.stringify(e.body.errors, null, 1)); err(e); }
  };
  $("#addp").onclick = async () => {
    try { await api.post("/partner/products", { name: { uz: $("#nu").value, ru: $("#nr").value || undefined }, variants: [{ sku: $("#sk").value, stock: [{ branch_id: S.branch, price: Math.round(+$("#pr").value * 100), available_qty: $("#qt").value || 0 }] }] }); toast("OK", "ok"); drawStock(); } catch (e) { err(e); }
  };
  drawStock();
}
async function drawStock() {
  const rows = await api.get(`/partner/branches/${S.branch}/stock`).catch(() => []); if (!$("#stk")) return;
  $("#stk").innerHTML = `<table><thead><tr><th>SKU</th><th>Nomi</th><th>Narx</th><th>Qoldiq</th><th>Band</th><th>Stop</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr data-v="${r.variant_id}"><td>${esc(r.sku)}</td><td>${esc(nameOf(r.name, lang))}</td><td><input class="pr" value="${r.price / 100}" style="width:100px" inputmode="decimal"></td><td><input class="qt" value="${r.available_qty}" style="width:90px" inputmode="decimal"></td><td>${r.reserved_qty}</td><td><input class="st" type="checkbox" ${r.is_stopped ? "checked" : ""} style="width:24px;min-height:24px"></td><td><button class="sm primary" data-sv>${t("save")}</button></td></tr>`).join("")}</tbody></table>`;
  bind("[data-sv]", "click", async (b) => { const tr = b.closest("tr"); try { await api.put(`/partner/branches/${S.branch}/stock`, [{ variant_id: tr.dataset.v, price: Math.round(+$(".pr", tr).value * 100), available_qty: $(".qt", tr).value, is_stopped: $(".st", tr).checked }]); toast("✔", "ok"); drawStock(); } catch (e) { err(e); } }, $("#stk"));
}

// ------------------------------------------------------------------ hudud, slot, xodim, hisobot
async function zones() {
  const z = await api.get(`/partner/branches/${S.branch}/zones`).catch(() => []);
  const br = S.tenants.flatMap((x) => x.branches).find((b) => b.id === S.branch) || {};
  body().innerHTML = `<div class="card"><h3 style="margin-top:0">Filial sozlamalari</h3><div class="row"><label><input type="checkbox" id="mc" ${br.manual_confirm ? "checked" : ""} style="width:24px;min-height:24px"> Qo'lda tasdiq</label><input id="sla" type="number" value="${br.confirm_sla_sec}" style="width:100px" aria-label="SLA sek"><button id="bs" class="sm primary">${t("save")}</button></div></div>
    <div class="card"><h3 style="margin-top:0">Xizmat hududlari</h3>${z.map((x) => `<div class="row sp"><span>${esc(x.name)} · ${x.radius_m ? x.radius_m + " m" : "poligon"} · ${money(x.delivery_fee)} · min ${money(x.min_order)}</span><button class="sm danger" data-dz="${x.id}">×</button></div>`).join("")}
    <h4>+ Doira hudud</h4><div class="row"><input id="zn" placeholder="Nomi" style="width:130px"><input id="zr" placeholder="Radius, m" inputmode="numeric" style="width:100px"><input id="zf" placeholder="Yetkazish, so'm" inputmode="decimal" style="width:130px"><input id="zm" placeholder="Min, so'm" inputmode="decimal" style="width:110px"><input id="zfr" placeholder="Bepul dan, so'm" inputmode="decimal" style="width:130px"><button id="za" class="primary">+</button></div>
    <p class="muted">Poligon hududni API orqali (<code>polygon: [[lng,lat],...]</code>) yuboring; xarita chizgichi Yandex Maps ulangach qo'shiladi.</p></div>
    <div class="card"><h3 style="margin-top:0">Slotlar</h3><div class="row"><input id="sd" type="date" style="width:160px"><input id="ss" type="time" value="09:00" style="width:110px"><input id="se" type="time" value="21:00" style="width:110px"><input id="sp" type="number" value="60" style="width:80px" aria-label="qadam, daq"><input id="sc" type="number" value="10" style="width:80px" aria-label="sig'im"><button id="sg" class="primary">Yaratish</button></div></div>`;
  $("#bs").onclick = async () => { try { await api.patch(`/partner/branches/${S.branch}`, { manual_confirm: $("#mc").checked, confirm_sla_sec: +$("#sla").value }); toast("✔", "ok"); } catch (e) { err(e); } };
  $("#za").onclick = async () => { const br2 = br; try { await api.post(`/partner/branches/${S.branch}/zones`, { name: $("#zn").value || "Hudud", center_lat: br2.lat, center_lng: br2.lng, radius_m: +$("#zr").value, delivery_fee: Math.round(+$("#zf").value * 100), min_order: Math.round(+$("#zm").value * 100), free_from: $("#zfr").value ? Math.round(+$("#zfr").value * 100) : null }); zones(); } catch (e) { err(e); } };
  bind("[data-dz]", "click", async (b) => { try { await api.del(`/partner/zones/${b.dataset.dz}`); zones(); } catch (e) { err(e); } });
  $("#sg").onclick = async () => { try { const r = await api.post(`/partner/branches/${S.branch}/slots/generate`, { date: $("#sd").value, start: $("#ss").value, end: $("#se").value, step_min: +$("#sp").value, capacity: +$("#sc").value }); toast(`Yaratildi: ${r.created}`, "ok"); } catch (e) { err(e); } };
}
async function staff() {
  const rows = await api.get("/partner/staff").catch(() => []);
  const tid = S.tenants[0]?.id;
  body().innerHTML = `<div class="card"><table><thead><tr><th>Telefon</th><th>Ism</th><th>Rol</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.phone)}</td><td>${esc(r.full_name)}</td><td>${r.role}</td><td><button class="sm danger" data-rm="${r.user_id}" data-role="${r.role}">×</button></td></tr>`).join("")}</tbody></table></div>
    <div class="card"><h3 style="margin-top:0">+ Xodim</h3><div class="row"><input id="sp" placeholder="+998..." style="width:150px"><input id="sn" placeholder="Ism" style="width:150px"><input id="spw" type="password" placeholder="Parol" style="width:140px"><select id="sr" style="width:150px">${["branch_manager", "picker", "dispatcher", "courier", "support", "finance"].map((r) => `<option>${r}</option>`).join("")}</select><button id="sa" class="primary">+</button></div></div>`;
  $("#sa").onclick = async () => { try { await api.post("/partner/staff", { tenant_id: tid, phone: $("#sp").value, full_name: $("#sn").value, password: $("#spw").value, role: $("#sr").value, branch_id: ["branch_manager", "picker"].includes($("#sr").value) ? S.branch : undefined }); staff(); } catch (e) { err(e); } };
  bind("[data-rm]", "click", async (b) => { try { await api.del("/partner/staff", { user_id: b.dataset.rm, role: b.dataset.role }); staff(); } catch (e) { err(e); } });
}
async function reports() {
  const d = await api.get(`/partner/reports?branch_id=${S.branch}`).catch((e) => { err(e); return null; }); if (!d) return;
  body().innerHTML = `<div class="grid"><div class="card"><div class="muted">Buyurtmalar</div><b class="price">${d.orders_completed} / ${d.orders_total}</b></div><div class="card"><div class="muted">Sotuv</div><b class="price">${money(d.sales)}</b></div><div class="card"><div class="muted">O'rtacha chek</div><b class="price">${money(d.avg_check)}</b></div><div class="card"><div class="muted">Bekor %</div><b class="price">${(d.cancel_rate * 100).toFixed(1)}%</b></div><div class="card"><div class="muted">O'rtacha buyurtma hissasi</div><b class="price">${money(d.contribution.avg_per_order)}</b><div class="muted">manfiy: ${d.contribution.negative_orders}</div></div></div>
    <div class="card"><h3 style="margin-top:0">Kanallar</h3>${Object.entries(d.by_channel).map(([k, v]) => `<div class="row sp"><span>${k}</span><b>${v}</b></div>`).join("")}<h3>Bekor sabablari</h3>${Object.entries(d.cancel_reasons).map(([k, v]) => `<div class="row sp"><span>${esc(k)}</span><b>${v}</b></div>`).join("") || t("none")}</div>
    <div class="card"><h3 style="margin-top:0">Kunlar</h3><table>${d.by_day.map((x) => `<tr><td>${x.date}</td><td>${x.orders}</td><td>${money(x.sales)}</td></tr>`).join("")}</table></div>`;
}

// ------------------------------------------------------------------ dispetcher / kuryer (FR-DSP, FR-CR)
async function dispatch() {
  const couriers = await api.get("/delivery/couriers").catch(() => []);
  every(async () => {
    let list; try { list = await api.get("/delivery/shipments"); } catch (e) { return; }
    if (!body() || document.activeElement?.closest?.("#tab select")) return;
    body().innerHTML = list.map((s) => `<div class="card" style="${s.attention ? "border-color:var(--bad)" : ""}"><div class="row sp"><b>№${esc(s.order_number)}</b><span class="badge ${s.attention ? "bad" : "warn"}">${s.status}${s.attention ? " · " + s.attention : ""}</span><span class="muted">🚲 ${s.vehicle_type}</span><span class="muted">${esc(s.address.text || "")} ${esc(s.address.landmark || "")}</span></div>
      ${["created", "assigned"].includes(s.status) ? `<div class="row"><select class="cr" style="max-width:240px">${couriers.map((c) => `<option value="${c.id}" ${s.courier?.id === c.id ? "selected" : ""}>${esc(c.name || c.phone)}${c.busy ? " (band)" : ""}</option>`).join("")}</select><button class="sm primary" data-as="${s.id}">${t("assign")}</button></div>` : s.courier ? `<div class="muted">🧑 ${esc(s.courier.name)} ${esc(s.courier.phone)}</div>` : ""}
      ${s.status === "failed" ? `<div class="row"><span class="muted">${esc(s.failure_reason)}</span><button class="sm" data-rs="${s.id}" data-a="redeliver">Qayta yetkazish</button><button class="sm danger" data-rs="${s.id}" data-a="return">Qaytarish</button></div>` : ""}
      <button class="sm" data-rs="${s.id}" data-a="unlock_pin">PIN blokini ochish</button></div>`).join("") || `<div class="muted">${t("none")}</div>`;
    bind("[data-as]", "click", async (b) => { try { await api.post(`/delivery/shipments/${b.dataset.as}/assign`, { courier_id: $("select.cr", b.closest(".card")).value }); dispatch(); } catch (e) { err(e); } }, body());
    bind("[data-rs]", "click", async (b) => { try { await api.post(`/delivery/shipments/${b.dataset.rs}/resolve`, { action: b.dataset.a }); dispatch(); } catch (e) { err(e); } }, body());
  });
}
async function courier() {
  every(async () => {
    let list; try { list = await api.get("/courier/shipments"); } catch { return; }
    if (!body() || document.activeElement?.closest?.("#tab input")) return;
    const ids = list.map((s) => s.id); if (S.seen.size && ids.some((i) => !S.seen.has(i))) beep(); ids.forEach((i) => S.seen.add(i));
    body().innerHTML = list.map((s) => `<div class="card"><div class="row sp"><b>№${esc(s.order_number)}</b><span class="badge warn">${s.status}</span><b>${s.amount_to_collect ? money(s.amount_to_collect) : "to'langan"}</b></div>
      <div>📦 ${esc(s.branch.name)}: ${esc(s.branch.address)}</div><div>🏠 ${esc(s.address.text || "")} ${esc(s.address.landmark || "")} ${esc(s.address.entrance ? "pod." + s.address.entrance : "")} ${esc(s.address.floor ? "qav." + s.address.floor : "")} ${esc(s.address.apartment ? "xon." + s.address.apartment : "")}</div>
      <div class="row"><a class="btn sm" href="${esc(s.navigation_url)}" target="_blank" rel="noopener">🧭</a><a class="btn sm" href="tel:${esc(s.customer_phone)}">📞 ${esc(s.customer_phone)}</a></div>
      <div class="row" style="margin-top:8px" data-sh="${s.id}">${s.status === "assigned" ? `<button class="primary" data-c="pickup">${t("pickup")}</button><button class="danger" data-c="reject">${t("reject")}</button>` : ""}
      ${s.status === "picked_up" ? `<button class="primary" data-c="on_the_way">${t("on_the_way")}</button>` : ""}
      ${["picked_up", "on_the_way"].includes(s.status) ? `<input class="pinin" inputmode="numeric" maxlength="4" placeholder="${t("pin")}" style="width:160px;font-size:20px"><button class="primary" data-c="deliver">${t("deliver")}</button><button data-c="contact">${t("contact")} (${s.contact_attempts})</button><button class="danger" data-c="fail">${t("fail")}</button>` : ""}</div></div>`).join("") || `<div class="muted">${t("none")}</div>`;
    bind("[data-c]", "click", async (b) => {
      const box = b.closest("[data-sh]"), a = b.dataset.c, data = { action: a };
      if (a === "deliver") data.pin = $("input.pinin", box).value; if (a === "fail") { data.reason = prompt(t("reason")); if (!data.reason) return; }
      try { await api.post(`/delivery/shipments/${box.dataset.sh}/status`, data); courier(); } catch (e) { err(e); }
    }, body());
  });
}

// ------------------------------------------------------------------ yordam, moliya, admin
async function tickets() {
  const list = await api.get("/support/tickets?status=open,in_progress").catch(() => []);
  body().innerHTML = list.map((x) => `<div class="card"><div class="row sp"><b>№${esc(x.order_number)}</b><span class="badge warn">${x.type} · ${x.status}</span><span class="muted">${fmtDateTime(x.created_at)}</span></div>${x.item_name ? `<div>${esc(nameOf(x.item_name, lang))}</div>` : ""}<p>${esc(x.message)}</p>${x.attachments.map((a) => `<a href="${esc(a)}" target="_blank" rel="noopener">📎</a>`).join(" ")}
    <div class="row"><button class="sm" data-tk="${x.id}" data-s="in_progress">Ishga olish</button><button class="sm primary" data-tk="${x.id}" data-s="resolved">Hal qilindi</button><input class="ra" placeholder="Qaytarish, so'm" inputmode="decimal" style="width:130px"><input class="rr" placeholder="Sabab" style="width:150px"><button class="sm danger" data-rf="${x.order_id}">Qaytarish</button></div></div>`).join("") || `<div class="muted">${t("none")}</div>`;
  bind("[data-tk]", "click", async (b) => { try { await api.patch(`/support/tickets/${b.dataset.tk}`, { status: b.dataset.s }); tickets(); } catch (e) { err(e); } });
  bind("[data-rf]", "click", async (b) => { const c = b.closest(".card"); try { const r = await api.post(`/support/orders/${b.dataset.rf}/refunds`, { amount: Math.round(+$(".ra", c).value * 100), reason: $(".rr", c).value }, { headers: { "Idempotency-Key": uuid() } }); toast(r.state === "requested" ? "Moliya tasdig'i kutilmoqda" : "Qaytarish yuborildi", "ok"); } catch (e) { err(e); } });
}
async function finance() {
  const today = new Date().toISOString().slice(0, 10);
  body().innerHTML = `<div class="card row"><input type="date" id="fd" value="${today}" style="width:170px"><button id="fl" class="primary">Solishtirish</button><button id="fc">CSV</button></div><div id="fr"></div><div id="fq"></div>`;
  const load = async () => {
    const d = await api.get(`/finance/reconciliation?date=${$("#fd").value}`).catch((e) => { err(e); return null; }); if (!d) return;
    $("#fr").innerHTML = `<div class="card"><b>${d.orders}</b> buyurtma · to'langan ${money(d.totals.paid)} · qaytarilgan ${money(d.totals.refunded)}<table><thead><tr><th>№</th><th>Holat</th><th>Kutilgan</th><th>Sof to'lov</th><th>Muammo</th></tr></thead><tbody>${d.rows.map((r) => `<tr style="${r.issues.length ? "background:rgba(185,28,28,.1)" : ""}"><td>${esc(r.number)}</td><td>${r.status}</td><td>${money(r.expected)}</td><td>${money(r.net)}</td><td>${r.issues.join(", ")}</td></tr>`).join("")}</tbody></table></div>`;
    const rf = await api.get("/finance/refunds?state=requested").catch(() => []);
    $("#fq").innerHTML = `<div class="card"><h3 style="margin-top:0">Tasdiq kutayotgan qaytarishlar</h3>${rf.map((r) => `<div class="row sp"><span>№${esc(r.order_number)} · ${money(r.amount)} · ${esc(r.reason)}</span><button class="sm primary" data-ra="${r.id}">Tasdiqlash</button></div>`).join("") || t("none")}</div>`;
    bind("[data-ra]", "click", async (b) => { try { await api.post(`/finance/refunds/${b.dataset.ra}/approve`, {}); load(); } catch (e) { err(e); } }, $("#fq"));
  };
  $("#fl").onclick = load; $("#fc").onclick = () => download(`/finance/reconciliation?date=${$("#fd").value}&format=csv`, "reconciliation.csv").catch(err); load();
}
async function admin() {
  const list = await api.get("/platform/tenants").catch(() => []);
  body().innerHTML = `<div class="card"><h3 style="margin-top:0">Hamkorlar</h3>${list.map((x) => `<div class="row sp"><b>${esc(x.name)}</b><span class="muted">${x.slug} · ${x.profile} · ${x.package}</span></div>`).join("")}</div>
    <div class="card"><h3 style="margin-top:0">+ Yangi hamkor (kodsiz)</h3><div class="row"><input id="an" placeholder="Nomi" style="width:150px"><input id="as" placeholder="slug" style="width:120px"><select id="ap" style="width:140px"><option>small_shop</option><option>supermarket</option><option>restaurant</option><option>non_food</option></select><input id="aop" placeholder="Egasi telefoni" style="width:150px"><input id="aow" type="password" placeholder="Egasi paroli" style="width:140px"></div>
    <div class="row" style="margin-top:8px"><input id="ba" placeholder="Filial manzili" style="flex:1"><input id="bla" placeholder="lat" style="width:100px"><input id="bln" placeholder="lng" style="width:100px"><button id="ac" class="primary">Yaratish</button></div><p class="muted">Audit jurnali va barcha modellar: <a href="/admin/">/admin/</a></p></div>`;
  $("#ac").onclick = async () => { try { await api.post("/platform/tenants", { name: $("#an").value, slug: $("#as").value, profile: $("#ap").value, owner_phone: $("#aop").value, owner_password: $("#aow").value, branch: { address: $("#ba").value, lat: +$("#bla").value, lng: +$("#bln").value } }); toast("✔", "ok"); admin(); } catch (e) { err(e); } };
}

async function start() {
  $("#lang").textContent = lang === "uz" ? "RU" : "UZ";
  if (store.get("staff_token")) { try { S.user = await api.get("/me"); return afterLogin(); } catch { store.del("staff_token"); } }
  loginView();
}
start();
