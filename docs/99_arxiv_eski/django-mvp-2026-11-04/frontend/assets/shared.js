// Umumiy yordamchilar: API, til, pul formati, xavfsiz HTML.
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const money = (tiyin) => new Intl.NumberFormat("ru-RU").format(Math.round((tiyin || 0) / 100)) + " so'm";
export const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* */ } },
};
export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));
}

export class ApiError extends Error {
  constructor(status, body) { super(body?.error?.message || `HTTP ${status}`); this.status = status; this.code = body?.error?.code; this.body = body?.error || {}; }
}

export function makeApi({ tokenKey, lang }) {
  async function call(method, path, body, { headers = {}, raw = false } = {}) {
    const h = { Accept: "application/json", "Accept-Language": lang(), ...headers };
    const tok = store.get(tokenKey);
    if (tok) h.Authorization = "Bearer " + tok;
    let payload = body;
    if (body && !(body instanceof FormData) && typeof body !== "string") { h["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
    const r = await fetch("/api/v1" + path, { method, headers: h, body: payload });
    if (raw && r.ok) return r;
    let data = null;
    try { data = r.status === 204 ? null : await r.json(); } catch { /* bo'sh javob */ }
    if (!r.ok) throw new ApiError(r.status, data);
    return data;
  }
  return {
    get: (p, o) => call("GET", p, null, o), post: (p, b, o) => call("POST", p, b, o), put: (p, b, o) => call("PUT", p, b, o),
    patch: (p, b, o) => call("PATCH", p, b, o), del: (p, b, o) => call("DELETE", p, b, o),
  };
}

export function toast(msg, kind = "info") {
  let box = document.getElementById("toasts");
  if (!box) { box = document.createElement("div"); box.id = "toasts"; document.body.appendChild(box); }
  const t = document.createElement("div");
  t.className = "toast " + kind; t.textContent = msg; t.setAttribute("role", "status");
  box.appendChild(t); setTimeout(() => t.remove(), 4500);
}

export function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; g.gain.value = 0.15;
    o.start(); setTimeout(() => { o.stop(); ctx.close(); }, 350);
  } catch { /* audio ruxsat yo'q */ }
}

export const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" }) : "";
export const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString("uz-UZ", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
export const nameOf = (obj, lang) => (obj && (obj[lang] || obj.uz || Object.values(obj)[0])) || "";
