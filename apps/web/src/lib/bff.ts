/**
 * BFF yordamchilari (server tomoni): tokenlar brauzer JavaScript'iga HECH QACHON berilmaydi — httpOnly cookie'da turadi.
 * - dst_at: kirish tokeni (15 daq), Path=/
 * - dst_rt: yangilash tokeni (30 kun), Path=/v1/auth (faqat auth endpointlariga yuboriladi)
 */
export const AT = "dst_at";
export const RT = "dst_rt";
const TOKEN_PATHS = new Set(["auth/otp/verify", "auth/telegram", "auth/totp/verify", "auth/totp/confirm", "auth/refresh"]);

export const issuesTokens = (path: string) => TOKEN_PATHS.has(path);

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function decodeAmr(access: string): string[] {
  try {
    const p = JSON.parse(Buffer.from(access.split(".")[1]!, "base64url").toString("utf8")) as { amr?: string[] };
    return Array.isArray(p.amr) ? p.amr : [];
  } catch { return []; }
}

/**
 * HTTPS: SameSite=None; Secure; Partitioned — Telegram Web mini-ilovani cross-site iframe'da ochadi, Lax cookie u yerda yuborilmaydi.
 * CSRF himoyasi: Origin tekshiruvi (sameOrigin), CSP frame-ancestors (faqat Telegram) va JSON-only API.
 * Oddiy HTTP (dev): SameSite=Lax.
 */
const attrs = (secure: boolean, path: string, maxAge: number) => `Path=${path}; HttpOnly; Max-Age=${maxAge}; ${secure ? "SameSite=None; Secure; Partitioned" : "SameSite=Lax"}`;

export function tokenCookies(t: { access_token: string; refresh_token: string; expires_in: number }, secure: boolean): string[] {
  return [
    `${AT}=${encodeURIComponent(t.access_token)}; ${attrs(secure, "/", t.expires_in)}`,
    `${RT}=${encodeURIComponent(t.refresh_token)}; ${attrs(secure, "/v1/auth", 30 * 24 * 3600)}`,
  ];
}

export const clearCookies = (secure: boolean): string[] => [`${AT}=; ${attrs(secure, "/", 0)}`, `${RT}=; ${attrs(secure, "/v1/auth", 0)}`];

/** Tokenlar javobdan olib tashlanadi; o'rniga ikkinchi omil ma'lumoti (amr) beriladi. */
export function stripTokens<T extends Record<string, unknown>>(body: T): Omit<T, "access_token" | "refresh_token" | "expires_in"> & { amr?: string[] } {
  const { access_token, refresh_token: _r, expires_in: _e, ...rest } = body as T & { access_token?: string; refresh_token?: string; expires_in?: number };
  return access_token ? { ...rest, amr: decodeAmr(access_token) } : rest;
}

/** CSRF: holatni o'zgartiruvchi so'rovlarda Origin (bo'lsa) shu saytniki bo'lishi shart. SameSite=Lax qo'shimcha qatlam. */
export function sameOrigin(method: string, origin: string | null, host: string | null, forwardedHost?: string | null): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return true;
  if (!origin) return false; // brauzer POST/PATCH/PUT/DELETE'da Origin yuboradi; yo'q bo'lsa — shubhali
  try {
    const o = new URL(origin).host;
    return o === host || (!!forwardedHost && o === forwardedHost);
  } catch { return false; }
}

const FORWARD = ["accept", "accept-language", "content-type", "idempotency-key", "x-tenant-id", "x-request-id", "user-agent"];
export function forwardHeaders(req: Headers, access: string | undefined, clientIp: string | null): Headers {
  const h = new Headers();
  for (const k of FORWARD) { const v = req.get(k); if (v) h.set(k, v); }
  if (access) h.set("authorization", `Bearer ${access}`);
  if (clientIp) h.set("x-forwarded-for", clientIp);
  return h;
}
