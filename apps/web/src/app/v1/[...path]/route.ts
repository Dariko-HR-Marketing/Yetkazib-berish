import { NextResponse, type NextRequest } from "next/server";
import { AT, RT, clearCookies, forwardHeaders, issuesTokens, parseCookies, sameOrigin, stripTokens, tokenCookies } from "@/lib/bff";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RESPONSE_HEADERS = ["content-type", "retry-after", "x-request-id", "idempotent-replayed"];

/**
 * Backend-for-frontend proksi: brauzer faqat shu origin bilan gaplashadi (/v1/*). Tokenlar httpOnly cookie'da;
 * Authorization sarlavhasi shu yerda qo'shiladi, token chiqaruvchi endpointlar javobidan tokenlar cookie'ga o'tkaziladi.
 */
async function handle(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await params;
  const sub = path.join("/");
  const secure = req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  if (!sameOrigin(req.method, req.headers.get("origin"), req.headers.get("host"), req.headers.get("x-forwarded-host"))) {
    return NextResponse.json({ code: "permission.denied", message_uz: "So'rov boshqa saytdan keldi", message_ru: "Запрос пришёл с другого сайта", details: { reason: "csrf" } }, { status: 403 });
  }

  const cookies = parseCookies(req.headers.get("cookie"));
  const api = process.env.API_URL ?? "http://127.0.0.1:4000";
  const headers = forwardHeaders(req.headers, cookies[AT], req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null);

  let body: BodyInit | undefined;
  if (sub === "auth/refresh") {
    // Yangilash tokeni faqat cookie'dan olinadi (brauzer JS ko'rmaydi).
    if (!cookies[RT]) return NextResponse.json({ code: "auth.refresh_invalid", message_uz: "Sessiya tugagan. Qaytadan kiring", message_ru: "Сессия завершена. Войдите заново", details: {} }, { status: 401 });
    headers.set("content-type", "application/json");
    body = JSON.stringify({ refresh_token: cookies[RT] });
  } else if (!["GET", "HEAD"].includes(req.method)) {
    body = await req.text();
  }

  let up: Response;
  try {
    up = await fetch(`${api}/v1/${sub}${req.nextUrl.search}`, { method: req.method, headers, body: body || undefined, redirect: "manual", cache: "no-store" });
  } catch {
    return NextResponse.json({ code: "internal_error", message_uz: "Xizmat vaqtincha mavjud emas", message_ru: "Сервис временно недоступен", details: {} }, { status: 502 });
  }

  if (sub === "auth/refresh" && !up.ok) console.error("BFF refresh rad etildi", up.status, await up.clone().text());
  const out = new Headers();
  for (const k of RESPONSE_HEADERS) { const v = up.headers.get(k); if (v) out.set(k, v); }
  out.set("cache-control", "no-store");

  if (issuesTokens(sub) && up.ok) {
    const json = (await up.json()) as Record<string, unknown>;
    if (typeof json.access_token === "string" && typeof json.refresh_token === "string") {
      for (const c of tokenCookies(json as { access_token: string; refresh_token: string; expires_in: number }, secure)) out.append("set-cookie", c);
    }
    return NextResponse.json(stripTokens(json), { status: up.status, headers: out });
  }
  if ((sub === "auth/logout") || (sub === "auth/refresh" && up.status === 401)) {
    for (const c of clearCookies(secure)) out.append("set-cookie", c);
  }
  return new Response(up.status === 204 ? null : await up.arrayBuffer(), { status: up.status, headers: out });
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
