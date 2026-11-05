import type { Locale } from "@dostavka/i18n";
import { getSession, setSession, updateAmr } from "./session";

export class ApiError extends Error {
  constructor(public status: number, public code: string, public message_uz: string, public message_ru: string, public details: Record<string, unknown> = {}) {
    super(message_uz);
  }
  text(locale: Locale) { return locale === "ru" ? this.message_ru : this.message_uz; }
}

export class NetworkError extends Error {}

let localeGetter: () => Locale = () => "uz";
export const bindLocale = (fn: () => Locale) => { localeGetter = fn; };

const uuid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0]! & (15 >> (Number(c) / 4)))).toString(16)));

interface Opts { method?: string; body?: unknown; tenant?: boolean; auth?: boolean; key?: string; noRetry?: boolean }

let refreshing: Promise<boolean> | null = null;
/** Yangilash tokeni httpOnly cookie'da: tanasiz so'rov, BFF uni o'zi qo'shadi. */
async function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const r = await fetch("/v1/auth/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!r.ok) { setSession(null); return false; }
      const j = (await r.json()) as { amr?: string[] };
      updateAmr(j.amr ?? []);
      return true;
    } catch { return false; }
  })().finally(() => { refreshing = null; });
  return refreshing;
}

/**
 * JSON so'rov. O'zgartiruvchi so'rovga Idempotency-Key avtomatik qo'shiladi (qayta urinishda bir xil kalit — takror yaratilmaydi).
 * 401 (kirish tokeni eskirgan) bo'lsa yangilash tokeni bilan bir marta qayta uriniladi.
 */
export async function api<T = unknown>(path: string, o: Opts = {}): Promise<T> {
  const method = o.method ?? "GET";
  const key = o.key ?? (method === "GET" ? undefined : uuid());
  const run = async (): Promise<Response> => {
    const s = getSession();
    const headers: Record<string, string> = { Accept: "application/json", "Accept-Language": localeGetter() };
    if (o.body !== undefined) headers["Content-Type"] = "application/json";
    if (o.tenant && s?.tenantId) headers["X-Tenant-Id"] = s.tenantId;
    if (key && o.auth !== false && !path.startsWith("/v1/auth/")) headers["Idempotency-Key"] = key;
    try {
      return await fetch(path, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
    } catch {
      throw new NetworkError("network");
    }
  };
  let res = await run();
  if (res.status === 401 && !o.noRetry && o.auth !== false && getSession()) {
    const body = (await res.clone().json().catch(() => null)) as { code?: string } | null;
    // Kirish tokeni cookie'si muddati o'tgach so'rov tokensiz keladi (auth.unauthorized) yoki imzo eskirgan (auth.token_invalid).
    if ((body?.code === "auth.token_invalid" || body?.code === "auth.unauthorized") && (await refresh())) res = await run();
  }
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const j = json ?? {};
    throw new ApiError(res.status, String(j.code ?? "internal_error"), String(j.message_uz ?? "Xatolik"), String(j.message_ru ?? "Ошибка"), (j.details as Record<string, unknown>) ?? {});
  }
  return json as T;
}
