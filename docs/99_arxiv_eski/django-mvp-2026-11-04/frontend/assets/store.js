import { esc, money, store, uuid, makeApi, toast, fmtTime, nameOf, ApiError } from "./shared.js";
import { T } from "./i18n-store.js";

const params = new URLSearchParams(location.search);
const state = {
  lang: store.get("lang", "uz"), slug: params.get("t") || store.get("slug", "demo-dokon"), tenant: null, branch: null, zone: null,
  addr: store.get("addr", { text: "", landmark: "", entrance: "", floor: "", apt: "", lat: 40.1049, lng: 65.3812 }),
  cat: "", q: "", catalog: null, cart: {}, view: "home", order: null, quote: null, slots: [], idem: null, channel: params.get("channel") || "web",
};
const api = makeApi({ tokenKey: "token", lang: () => state.lang });
const t = (k) => T[state.lang][k] ?? k;
const app = document.getElementById("app");
const $ = (s, r = document) => r.querySelector(s);
let poll = null;

store.set("slug", state.slug);
state.cart = store.get("cart:" + state.slug, {});
const saveCart = () => store.set("cart:" + state.slug, state.cart);
const cartCount = () => Object.values(state.cart).reduce((a, i) => a + 1, 0);

function setLang(l) { state.lang = l; store.set("lang", l); document.documentElement.lang = l; render(); }
$("#btn-lang").onclick = () => setLang(state.lang === "uz" ? "ru" : "uz");
$("#btn-orders").onclick = () => go("orders");
function go(v, extra) { clearInterval(poll); if (v !== "track" && location.search.includes("track=")) { try { history.replaceState(null, "", "/?t=" + state.slug); } catch { /* */ } } state.view = v; Object.assign(state, extra || {}); render(); window.scrollTo(0, 0); }

function err(e) {
  const code = e.code;
  toast(T[state.lang].e[code] || e.message || "Xato", "err");
}

// ---------------------------------------------------------------- boot
async function boot() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  try { state.tenant = await api.get(`/storefront/${state.slug}`); } catch { app.innerHTML = `<div class="card">Hamkor topilmadi: <code>${esc(state.slug)}</code></div>`; return; }
  $("#brand").textContent = state.tenant.name;
  document.title = state.tenant.name;
  if (state.tenant.brand?.color) document.documentElement.style.setProperty("--brand", state.tenant.brand.color);
  if (params.get("track")) return go("track", { trackToken: params.get("track") });
  if (state.addr.checked && store.get("branch:" + state.slug)) { state.branch = store.get("branch:" + state.slug); state.zone = store.get("zone:" + state.slug); await loadCatalog(); }
  render();
}

function render() {
  $("#btn-orders").textContent = t("my_orders");
  ({ home: viewHome, checkout: viewCheckout, track: viewTrack, orders: viewOrders, login: viewLogin }[state.view] || viewHome)();
  renderCartBar();
}

// ---------------------------------------------------------------- manzil + katalog
function viewHome() {
  if (!state.branch) return viewAddress();
  const items = (state.catalog?.items || []);
  const cats = state.catalog?.categories || [];
  app.innerHTML = `
    <div class="card row sp"><div><b>${esc(state.branch.name)}</b><div class="muted">${esc(state.addr.text || "")} · ${t("delivery_from")} ${money(state.zone.delivery_fee)}${state.zone.free_from ? ` · ${money(state.zone.free_from)} ${t("free_from")}` : ""} · ${t("min_order")}: ${money(state.zone.min_order)}</div></div>
      <button class="sm" id="chg">${t("address")}</button></div>
    ${state.branch.open === false ? `<div class="card"><span class="badge warn">${t("closed")}</span></div>` : ""}
    <input id="q" type="search" placeholder="${t("search")}" value="${esc(state.q)}" aria-label="${t("search")}">
    <div class="tabs" style="margin-top:10px"><button data-cat="" class="${state.cat ? "" : "on"}">${t("all")}</button>${cats.map((c) => `<button data-cat="${c.id}" class="${state.cat === c.id ? "on" : ""}">${esc(nameOf(c.name, state.lang))}</button>`).join("")}</div>
    <div class="grid">${items.map(card).join("") || `<div class="muted">—</div>`}</div>`;
  $("#chg").onclick = () => { state.branch = null; render(); };
  let tm; $("#q").oninput = (e) => { state.q = e.target.value; clearTimeout(tm); tm = setTimeout(async () => { await loadCatalog(); viewHome(); const i = $("#q"); i.focus(); i.setSelectionRange(99, 99); }, 300); };
  app.querySelectorAll("[data-cat]").forEach((b) => b.onclick = async () => { state.cat = b.dataset.cat; await loadCatalog(); viewHome(); });
  app.querySelectorAll("[data-add]").forEach((b) => b.onclick = () => changeQty(b.dataset.add, +b.dataset.d));
}
function card(i) {
  const q = state.cart[i.variant_id]?.qty || 0, step = i.is_weighted ? 0.5 : 1;
  return `<div class="card"><div style="font-weight:600">${esc(nameOf(i.name, state.lang))}</div>
    <div class="muted">${esc(i.unit === "kg" ? "kg" : "")} ${i.is_weighted ? "· " + t("weight_note") : ""}</div>
    <div class="row sp" style="margin-top:8px"><span class="price">${money(i.price)}</span>${!i.in_stock ? `<span class="badge bad">${t("out")}</span>` : q ? `<span class="qty"><button data-add="${i.variant_id}" data-d="${-step}" aria-label="-">−</button><b>${q}</b><button data-add="${i.variant_id}" data-d="${step}" aria-label="+">+</button></span>` : `<button class="primary" data-add="${i.variant_id}" data-d="${step}">${t("add")}</button>`}</div></div>`;
}
function changeQty(id, d) {
  const item = state.catalog.items.find((x) => x.variant_id === id);
  const cur = state.cart[id]?.qty || 0, n = Math.max(0, +(cur + d).toFixed(3));
  if (n === 0) delete state.cart[id]; else state.cart[id] = { qty: n, name: item.name, price: item.price, is_weighted: item.is_weighted };
  saveCart(); viewHome(); renderCartBar();
}
async function loadCatalog() {
  const qs = new URLSearchParams({ ...(state.cat && { category: state.cat }), ...(state.q && { q: state.q }) });
  state.catalog = await api.get(`/storefront/${state.slug}/branches/${state.branch.id}/catalog?${qs}`);
}

function viewAddress() {
  const a = state.addr, saved = store.get("addrs", []);
  app.innerHTML = `<div class="card"><h2 style="margin-top:0">${t("choose_address")}</h2>
    <div id="map" hidden></div>
    <button id="geo" style="margin:8px 0">📍 ${t("locate")}</button>
    <div class="row"><div style="flex:1;min-width:130px"><label for="lat">${t("lat")}</label><input id="lat" inputmode="decimal" value="${a.lat}"></div><div style="flex:1;min-width:130px"><label for="lng">${t("lng")}</label><input id="lng" inputmode="decimal" value="${a.lng}"></div></div>
    <label for="at">${t("addr_text")}</label><input id="at" value="${esc(a.text)}" autocomplete="street-address">
    <label for="lm">${t("landmark")}</label><input id="lm" value="${esc(a.landmark)}">
    <div class="row"><div style="flex:1"><label for="en">${t("entrance")}</label><input id="en" value="${esc(a.entrance)}"></div><div style="flex:1"><label for="fl">${t("floor")}</label><input id="fl" value="${esc(a.floor)}"></div><div style="flex:1"><label for="ap">${t("apt")}</label><input id="ap" value="${esc(a.apt)}"></div></div>
    <p><button class="primary" id="chk">${t("check")}</button></p><div id="zmsg"></div>
    ${saved.length ? `<h3>${t("saved")}</h3>${saved.map((s, i) => `<button class="sm" data-sv="${i}" style="margin:2px">${esc(s.text || s.lat)}</button>`).join("")}` : ""}</div>`;
  initMap();
  $("#geo").onclick = () => navigator.geolocation?.getCurrentPosition((p) => { $("#lat").value = p.coords.latitude.toFixed(6); $("#lng").value = p.coords.longitude.toFixed(6); moveMarker(); }, () => toast("Joylashuv aniqlanmadi", "err"));
  app.querySelectorAll("[data-sv]").forEach((b) => b.onclick = () => { Object.assign(state.addr, saved[+b.dataset.sv]); viewAddress(); });
  $("#chk").onclick = async () => {
    Object.assign(state.addr, { lat: +$("#lat").value, lng: +$("#lng").value, text: $("#at").value, landmark: $("#lm").value, entrance: $("#en").value, floor: $("#fl").value, apt: $("#ap").value });
    try {
      const r = await api.get(`/storefront/${state.slug}/zones/resolve?lat=${state.addr.lat}&lng=${state.addr.lng}`);
      state.branch = r.branch; state.zone = r.zone; state.addr.checked = true;
      store.set("addr", state.addr); store.set("branch:" + state.slug, r.branch); store.set("zone:" + state.slug, r.zone);
      const list = store.get("addrs", []).filter((x) => x.text !== state.addr.text); list.unshift({ ...state.addr }); store.set("addrs", list.slice(0, 5));
      await loadCatalog(); render();
    } catch (e) { $("#zmsg").innerHTML = `<div class="badge bad">${t("out_of_zone")}</div>`; }
  };
}
let map, marker;
function moveMarker() { if (map && marker) { const p = [+$("#lat").value, +$("#lng").value]; marker.setLatLng(p); map.setView(p); } }
function initMap() {
  // Xarita ixtiyoriy: yuklanmasa koordinata maydonlari ishlayveradi. Production'da Yandex Maps ulanadi (TZ 06).
  if (window.L) return mountMap();
  const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"; document.head.appendChild(css);
  const s = document.createElement("script"); s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"; s.onload = mountMap; s.onerror = () => {}; document.head.appendChild(s);
}
function mountMap() {
  const el = $("#map"); if (!el || !window.L) return; el.hidden = false;
  map = L.map(el).setView([+$("#lat").value, +$("#lng").value], 15);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
  marker = L.marker([+$("#lat").value, +$("#lng").value], { draggable: true }).addTo(map);
  const upd = (ll) => { $("#lat").value = ll.lat.toFixed(6); $("#lng").value = ll.lng.toFixed(6); marker.setLatLng(ll); };
  map.on("click", (e) => upd(e.latlng)); marker.on("dragend", () => upd(marker.getLatLng()));
}

// ---------------------------------------------------------------- savat + rasmiylashtirish
function renderCartBar() {
  const bar = $("#cartbar");
  if (state.view !== "home" || !state.branch || !cartCount()) { bar.innerHTML = ""; return; }
  const sub = Object.values(state.cart).reduce((a, i) => a + Math.round(i.price * i.qty), 0);
  bar.innerHTML = `<div class="cartbar"><span>🛒 ${cartCount()} · <b>${money(sub)}</b></span><button class="primary right" id="tocheckout">${t("checkout")}</button></div>`;
  $("#tocheckout").onclick = async () => { state.idem = uuid(); await loadQuote(); if (state.quote) go("checkout"); };
}
const cartItems = () => Object.entries(state.cart).map(([variant_id, i]) => ({ variant_id, qty: i.qty }));
async function loadQuote() {
  try {
    state.quote = await api.post(`/storefront/${state.slug}/cart/quote`, { address: state.addr, branch_id: state.branch.id, items: cartItems() });
    state.slots = await api.get(`/storefront/${state.slug}/branches/${state.branch.id}/slots`);
  } catch (e) { state.quote = null; err(e); }
}
function viewCheckout() {
  const q = state.quote, me = store.get("me"), o = store.get("form", {});
  const probs = q.problems.map((p) => p.code === "min_order" ? `${t("min_order")}: ${money(p.min_order)} (−${money(p.shortfall)})` : p.code === "out_of_stock" ? t("e").out_of_stock : p.code).join("; ");
  app.innerHTML = `<button id="bk">← ${t("back")}</button>
  <div class="card"><h2 style="margin-top:0">${t("cart")}</h2>
    ${q.lines.map((l) => `<div class="row sp"><span>${esc(nameOf(l.name, state.lang))} × ${+l.qty}${l.is_weighted ? " kg" : ""}</span><b>${money(l.line_total)}</b></div>`).join("")}
    <hr><div class="row sp"><span>${t("subtotal")}</span><span>${money(q.subtotal)}</span></div><div class="row sp"><span>${t("fee")}</span><span>${q.delivery_fee ? money(q.delivery_fee) : "0"}</span></div>
    <div class="row sp"><b>${t("total")}</b><b class="price">${money(q.total)}</b></div>
    ${q.estimated_ready_at ? `<div class="muted">${t("eta")}: ${fmtTime(q.estimated_ready_at)}</div>` : ""}
    ${probs ? `<div class="badge bad" style="margin-top:8px">${esc(probs)}</div>` : ""}</div>
  <div class="card"><label for="ph">${t("phone")}</label><input id="ph" type="tel" inputmode="tel" value="${esc(me?.phone || o.phone || "+998")}" autocomplete="tel">
    <label for="nm">${t("name")}</label><input id="nm" value="${esc(o.name || "")}" autocomplete="name">
    <label for="pm">${t("payment")}</label><select id="pm"><option value="cash_on_delivery">${t("pay_cash")}</option><option value="card_on_delivery">${t("pay_card")}</option><option value="online">${t("pay_online")}</option></select>
    <label for="sr">${t("subst")}</label><select id="sr"><option value="suggest_similar">${t("subst_similar")}</option><option value="remove">${t("subst_remove")}</option><option value="call_me">${t("subst_call")}</option></select>
    <label for="cp">${t("consent")}: <b id="cpv">10</b>%</label><input id="cp" type="range" min="0" max="30" step="5" value="10">
    <label for="sl">${t("slot")}</label><select id="sl"><option value="">${t("asap")}</option>${state.slots.map((s) => `<option value="${s.id}" ${s.full ? "disabled" : ""}>${fmtTime(s.starts_at)}–${fmtTime(s.ends_at)} (${s.left})</option>`).join("")}</select>
    <label for="cm">${t("comment")}</label><textarea id="cm" rows="2" maxlength="300"></textarea>
    <p><button class="primary" id="place" style="width:100%" ${q.problems.length ? "disabled" : ""}>${t("place")} · ${money(q.total)}</button></p></div>`;
  $("#bk").onclick = () => go("home");
  $("#cp").oninput = (e) => $("#cpv").textContent = e.target.value;
  $("#place").onclick = place;
}
async function place() {
  const btn = $("#place"); btn.disabled = true;
  const form = { phone: $("#ph").value, name: $("#nm").value }; store.set("form", form);
  const body = { tenant_slug: state.slug, branch_id: state.branch.id, customer_phone: form.phone, customer_name: form.name, address: state.addr,
    payment_method: $("#pm").value, substitution_rule: $("#sr").value, consent_increase_pct: +$("#cp").value, slot_id: $("#sl").value || undefined,
    comment: $("#cm").value, channel: state.channel, utm: Object.fromEntries([...params].filter(([k]) => k.startsWith("utm_"))), items: cartItems() };
  try {
    // Idempotency-Key checkout ochilganda bir marta yaratiladi: tarmoq uzilib qayta bosilsa ham bitta buyurtma bo'ladi.
    const o = await api.post("/orders", body, { headers: { "Idempotency-Key": state.idem } });
    const list = store.get("myorders", []); list.unshift({ id: o.id, token: o.tracking_token, number: o.number, slug: state.slug }); store.set("myorders", list.slice(0, 30));
    state.cart = {}; saveCart(); state.idem = null;
    if (o.payment_method === "online") {
      const p = await api.post(`/orders/${o.id}/payments`, {}, { headers: { "Idempotency-Key": uuid(), "X-Tracking-Token": o.tracking_token } });
      store.set("pay:" + o.id, p);
    }
    go("track", { trackToken: o.tracking_token });
  } catch (e) { btn.disabled = false; err(e); }
}

// ---------------------------------------------------------------- kuzatuv
async function viewTrack() {
  const tok = state.trackToken;
  try { history.replaceState(null, "", "/?track=" + tok); } catch { /* file:// */ }
  const draw = async () => {
    let d; try { d = await api.get(`/tracking/${tok}`); } catch (e) { app.innerHTML = `<div class="card">${e.status === 410 ? "⏱ " : ""}${esc(e.message)}</div>`; clearInterval(poll); return; }
    const idx = d.stages.indexOf(d.status), pay = store.get("pay:" + d.id);
    const needsApproval = d.approval_state === "pending", proposals = d.items.filter((i) => i.status === "substitution_proposed");
    app.innerHTML = `<div class="card"><div class="row sp"><h2 style="margin:0">${t("order_n")} №${esc(d.number)}</h2><span class="badge ${d.status === "cancelled" ? "bad" : d.status === "completed" ? "ok" : "warn"}">${t("st")[d.status] || d.status}</span></div>
      <div class="stages" aria-hidden="true">${d.stages.map((_, i) => `<i class="${i <= idx ? "on" : ""}"></i>`).join("")}</div>
      ${d.eta ? `<div>${t("eta")}: <b>${fmtTime(d.eta)}</b></div>` : ""}${d.cancel_reason ? `<div class="muted">${esc(d.cancel_reason)}</div>` : ""}
      ${d.delivery_pin ? `<p class="muted">${t("pin_hint")}</p><div class="pin" aria-label="PIN">${esc(d.delivery_pin)}</div>` : ""}
      ${d.courier ? `<div class="row">${t("courier")}: <b>${esc(d.courier.name)}</b> <a class="btn sm" href="tel:${esc(d.courier.phone)}">📞 ${t("call")}</a></div>` : ""}
      ${d.status === "created" && pay ? `<p><a class="btn primary" href="${esc(pay.checkout_url)}" target="_blank" rel="noopener">${t("pay_now")}</a> ${location.hostname === "localhost" || location.hostname === "127.0.0.1" ? `<button id="devpay">${t("dev_pay")}</button>` : ""}</p>` : ""}
      <div class="row sp"><span>${t("total")}</span><b>${money(d.final_total ?? d.total)}</b></div></div>
    ${needsApproval ? `<div class="card" style="border-color:var(--warn)"><b>${t("approve_needed")}</b><div class="row" style="margin-top:8px"><button class="primary" data-ap="1">${t("approve")}</button><button data-ap="0">${t("decline")}</button></div></div>` : ""}
    ${proposals.map((i) => `<div class="card" style="border-color:var(--warn)"><b>${t("sub_offer")}:</b> ${esc(nameOf(i.name, state.lang))} → ${i.proposed_price ? money(i.proposed_price) : "?"}<div class="row" style="margin-top:8px"><button class="primary" data-sub="${i.id}" data-ok="1">${t("accept")}</button><button data-sub="${i.id}" data-ok="0">${t("reject")}</button></div></div>`).join("")}
    <div class="card">${d.items.map((i) => `<div class="row sp"><span>${esc(nameOf(i.name, state.lang))} × ${+(i.actual_qty ?? i.requested_qty)} <span class="muted">(${t("item")[i.status] || i.status})</span></span><span class="row"><b>${money(i.line_total)}</b> <button class="sm" data-help="${i.id}" aria-label="${t("help")}">⚠</button></span></div>`).join("")}</div>
    <div class="row">${["created", "pending_confirmation", "accepted"].includes(d.status) ? `<button class="danger" id="cancel">${t("cancel")}</button>` : ""}<button id="help">${t("help")}</button></div>`;
    const H = { "X-Tracking-Token": tok };
    app.querySelectorAll("[data-ap]").forEach((b) => b.onclick = async () => { try { await api.post(`/tracking/${tok}/approve-changes`, { approve: b.dataset.ap === "1" }); draw(); } catch (e) { err(e); } });
    app.querySelectorAll("[data-sub]").forEach((b) => b.onclick = async () => { try { await api.post(`/tracking/${tok}/approve-changes`, { items: [{ item_id: b.dataset.sub, accept: b.dataset.ok === "1" }] }); draw(); } catch (e) { err(e); } });
    $("#cancel")?.addEventListener("click", async () => { if (!confirm(t("cancel_ask"))) return; try { await api.post(`/tracking/${tok}/cancel`, { reason: "customer" }); draw(); } catch (e) { err(e); } });
    $("#devpay")?.addEventListener("click", async () => { try { await api.post(`/dev/pay/${pay.id}`, {}); draw(); } catch (e) { err(e); } });
    $("#help")?.addEventListener("click", () => ticketModal(d, null, H));
    app.querySelectorAll("[data-help]").forEach((b) => b.onclick = () => ticketModal(d, b.dataset.help, H));
  };
  await draw(); poll = setInterval(draw, 10000);
}
function ticketModal(d, itemId, H) {
  const m = document.createElement("div"); m.className = "modal";
  m.innerHTML = `<div role="dialog" aria-modal="true"><h3 style="margin-top:0">${t("help")}</h3><label>${t("ticket_type")}</label><select id="tt"><option value="damaged">${t("damaged")}</option><option value="missing">${t("missing")}</option><option value="late">${t("late")}</option><option value="other">${t("other")}</option></select>
    <label>${t("message")}</label><textarea id="tm" rows="3"></textarea><label>${t("photo")}</label><input id="tf" type="file" accept="image/*" capture="environment">
    <div class="row" style="margin-top:12px"><button class="primary" id="ts">${t("send")}</button><button id="tc">${t("back")}</button></div></div>`;
  document.body.appendChild(m); $("#tc", m).onclick = () => m.remove();
  $("#ts", m).onclick = async () => {
    try {
      const att = []; const f = $("#tf", m).files[0];
      if (f) { const fd = new FormData(); fd.append("file", f); att.push((await api.post("/uploads", fd, { headers: H })).url); }
      await api.post("/support/tickets", { order_id: d.id, order_item_id: itemId || undefined, type: $("#tt", m).value, message: $("#tm", m).value, attachments: att }, { headers: H });
      toast("✔", "ok"); m.remove();
    } catch (e) { err(e); }
  };
}

// ---------------------------------------------------------------- tarix va kirish
async function viewOrders() {
  const me = store.get("me"); let list = store.get("myorders", []);
  if (me) { try { const srv = await api.get("/me/orders"); list = srv.map((o) => ({ id: o.id, token: null, number: o.number, status: o.status, total: o.total })); } catch { /* token eskirgan */ } }
  app.innerHTML = `<div class="row sp"><h2>${t("my_orders")}</h2>${me ? `<button class="sm" id="lo">${t("logout")} (${esc(me.phone)})</button>` : `<button class="sm primary" id="li">${t("login")}</button>`}</div>
    ${list.map((o) => `<div class="card row sp"><div><b>№${esc(o.number)}</b> ${o.status ? `<span class="badge">${t("st")[o.status] || o.status}</span>` : ""}</div><span class="row">${o.token ? `<button class="sm" data-t="${o.token}">→</button>` : ""}<button class="sm" data-re="${o.id}" data-tok="${o.token || ""}">${t("reorder")}</button></span></div>`).join("") || `<div class="muted">—</div>`}
    <button id="hb">← ${t("back")}</button>`;
  $("#hb").onclick = () => go("home"); $("#li")?.addEventListener("click", () => go("login"));
  $("#lo")?.addEventListener("click", () => { store.del("token"); store.del("me"); viewOrders(); });
  app.querySelectorAll("[data-t]").forEach((b) => b.onclick = () => go("track", { trackToken: b.dataset.t }));
  app.querySelectorAll("[data-re]").forEach((b) => b.onclick = async () => {
    try {
      const r = await api.post(`/orders/${b.dataset.re}/reorder`, {}, { headers: b.dataset.tok ? { "X-Tracking-Token": b.dataset.tok } : {} });
      state.cart = {}; r.lines.forEach((l) => state.cart[l.variant_id] = { qty: +l.qty, name: l.name, price: l.unit_price, is_weighted: l.is_weighted }); saveCart();
      if (r.problems.length) toast(t("e").out_of_stock, "err");
      go("home"); await loadCatalog(); render();
    } catch (e) { err(e); }
  });
}
function viewLogin() {
  app.innerHTML = `<div class="card"><h2 style="margin-top:0">${t("login")}</h2><label for="lp">${t("phone")}</label><input id="lp" type="tel" value="+998"><p><button class="primary" id="sc">${t("send_code")}</button></p>
    <div id="cb" hidden><label for="lc">${t("code")}</label><input id="lc" inputmode="numeric" maxlength="6" autocomplete="one-time-code"><p><button class="primary" id="vc">${t("verify")}</button></p></div></div>`;
  $("#sc").onclick = async () => { try { await api.post("/auth/otp/request", { phone: $("#lp").value }); $("#cb").hidden = false; } catch (e) { toast(e.message, "err"); } };
  $("#vc").onclick = async () => { try { const r = await api.post("/auth/otp/verify", { phone: $("#lp").value, code: $("#lc").value }); store.set("token", r.access_token); store.set("me", r.user); go("orders"); } catch (e) { toast(e.message, "err"); } };
}

boot();
