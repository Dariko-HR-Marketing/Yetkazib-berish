import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError, api, bindLocale } from "./api";
import { getSession, setSession, signIn } from "./session";

const json = (status: number, body: unknown) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const unauth = (code: string) => json(401, { code, message_uz: "", message_ru: "", details: {} });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  signIn(["otp"], "t-1");
  bindLocale(() => "ru");
});
afterEach(() => { vi.unstubAllGlobals(); setSession(null); });

const sent = (i = 0) => ({ url: fetchMock.mock.calls[i]![0] as string, init: fetchMock.mock.calls[i]![1] as RequestInit & { headers: Record<string, string> } });

describe("api()", () => {
  it("GET: Accept-Language va X-Tenant-Id; Authorization va Idempotency-Key YO'Q (token cookie'da, JS ko'rmaydi)", async () => {
    fetchMock.mockResolvedValue(json(200, { ok: 1 }));
    await api("/v1/members", { tenant: true });
    const { init } = sent();
    expect(init.headers["Accept-Language"]).toBe("ru");
    expect(init.headers["X-Tenant-Id"]).toBe("t-1");
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.headers["Idempotency-Key"]).toBeUndefined();
  });

  it("o'zgartiruvchi so'rovga UUID Idempotency-Key; auth endpointlariga yo'q", async () => {
    fetchMock.mockResolvedValue(json(200, {}));
    await api("/v1/invites", { method: "POST", body: { a: 1 } });
    expect(sent(0).init.headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/i);
    await api("/v1/auth/otp/request", { method: "POST", auth: false, body: {} });
    expect(sent(1).init.headers["Idempotency-Key"]).toBeUndefined();
  });

  it("xato: {code, message_uz, message_ru, details} ApiError'ga aylanadi va joriy tilda matn beradi", async () => {
    fetchMock.mockResolvedValue(json(403, { code: "plan.limit_reached", message_uz: "uz matn", message_ru: "ru текст", details: { next_plan: "biznes" } }));
    const e = (await api("/v1/invites", { method: "POST", body: {} }).catch((x: unknown) => x)) as ApiError;
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 403, code: "plan.limit_reached", details: { next_plan: "biznes" } });
    expect(e.text("ru")).toBe("ru текст");
    expect(e.text("uz")).toBe("uz matn");
  });

  it("tarmoq uzilishi NetworkError", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(api("/v1/me")).rejects.toBeInstanceOf(NetworkError);
  });

  it.each(["auth.token_invalid", "auth.unauthorized"])("401 %s: cookie orqali yangilanadi (tanasiz /v1/auth/refresh), so'rov bir marta takrorlanadi, amr yangilanadi", async (code) => {
    fetchMock
      .mockResolvedValueOnce(unauth(code))
      .mockResolvedValueOnce(json(200, { amr: ["otp", "totp"] }))
      .mockResolvedValueOnce(json(200, { ok: true }));
    await expect(api("/v1/me")).resolves.toEqual({ ok: true });
    expect(sent(1).url).toBe("/v1/auth/refresh");
    expect(sent(1).init.body).toBe("{}"); // refresh token JS'da yo'q
    expect(getSession()).toMatchObject({ tenantId: "t-1", amr: ["otp", "totp"] });
  });

  it("yangilash ham muvaffaqiyatsiz bo'lsa sessiya tozalanadi", async () => {
    fetchMock.mockResolvedValueOnce(unauth("auth.token_invalid")).mockResolvedValueOnce(unauth("auth.refresh_invalid"));
    await expect(api("/v1/me")).rejects.toBeInstanceOf(ApiError);
    expect(getSession()).toBeNull();
  });

  it("parallel 401'lar bitta yangilashga birlashadi (single-flight)", async () => {
    let refreshed = false;
    fetchMock.mockImplementation((url: string) => {
      if (url === "/v1/auth/refresh") { refreshed = true; return Promise.resolve(json(200, { amr: ["otp"] })); }
      return Promise.resolve(refreshed ? json(200, {}) : unauth("auth.token_invalid"));
    });
    await Promise.all([api("/v1/me"), api("/v1/me")]);
    expect(fetchMock.mock.calls.filter((c) => c[0] === "/v1/auth/refresh")).toHaveLength(1);
  });

  it("204 — undefined", async () => {
    fetchMock.mockResolvedValue(json(204, null));
    await expect(api("/v1/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });

  it("sessiya holatida token yo'q (localStorage'ga faqat maxfiy bo'lmagan maydonlar)", () => {
    expect(Object.keys(getSession()!).sort()).toEqual(["amr", "signedIn", "tenantId"]);
  });
});
