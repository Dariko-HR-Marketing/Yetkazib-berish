/** Sessiya saqlovi. localStorage mavjud bo'lmasa (maxfiy rejim) xotirada ishlaydi. */
export interface Session { access: string; refresh: string; tenantId: string | null; amr: string[] }

const KEY = "dostavka.session.v1";
let mem: Session | null = null;
const listeners = new Set<() => void>();

const safe = {
  get: () => { try { return localStorage.getItem(KEY); } catch { return null; } },
  set: (v: string) => { try { localStorage.setItem(KEY, v); } catch { /* xotirada qoladi */ } },
  del: () => { try { localStorage.removeItem(KEY); } catch { /* */ } },
};

export function decodeAmr(access: string): string[] {
  try {
    const p = JSON.parse(atob(access.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as { amr?: string[] };
    return p.amr ?? [];
  } catch { return []; }
}

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

export function updateTokens(access: string, refresh: string) {
  const cur = getSession();
  setSession({ access, refresh, tenantId: cur?.tenantId ?? null, amr: decodeAmr(access) });
}

export function setTenant(tenantId: string | null) {
  const cur = getSession();
  if (cur) setSession({ ...cur, tenantId });
}

export const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
