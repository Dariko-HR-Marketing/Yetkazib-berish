/**
 * Brauzer tomonidagi sessiya HOLATI (token EMAS). Tokenlar httpOnly cookie'da (BFF), JavaScript ularni ko'rmaydi.
 * Bu yerda faqat maxfiy bo'lmagan ma'lumot: kirgan-kirmagan belgisi, tanlangan do'kon va ikkinchi omil (amr).
 */
export interface Session { signedIn: true; tenantId: string | null; amr: string[] }

const KEY = "dostavka.session.v2";
let mem: Session | null = null;
const listeners = new Set<() => void>();

const safe = {
  get: () => { try { return localStorage.getItem(KEY); } catch { return null; } },
  set: (v: string) => { try { localStorage.setItem(KEY, v); } catch { /* xotirada qoladi */ } },
  del: () => { try { localStorage.removeItem(KEY); localStorage.removeItem("dostavka.session.v1"); } catch { /* */ } },
};

export function getSession(): Session | null {
  if (mem) return mem;
  const raw = safe.get();
  if (!raw) return null;
  try { mem = JSON.parse(raw) as Session; return mem; } catch { return null; }
}

export function setSession(s: Session | null) {
  mem = s;
  if (s) safe.set(JSON.stringify(s)); else safe.del();
  listeners.forEach((l) => l());
}

export function signIn(amr: string[], tenantId: string | null = null) { setSession({ signedIn: true, tenantId, amr }); }
export function updateAmr(amr: string[]) { const cur = getSession(); setSession({ signedIn: true, tenantId: cur?.tenantId ?? null, amr }); }
export function setTenant(tenantId: string | null) { const cur = getSession(); if (cur) setSession({ ...cur, tenantId }); }

export const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
