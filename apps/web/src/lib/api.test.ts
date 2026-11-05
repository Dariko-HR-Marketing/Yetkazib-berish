import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError, api, bindLocale } from "./api";
import { decodeAmr, getSession, setSession } from "./session";

const jwt = (amr: string[]) => `h.${Buffer.from(JSON.stringify({ amr })).toString("base64url")}.s`;
const json = (status: number, body: unknown) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  setSession({ access: jwt(["otp"]), refresh: "r1", tenantId: "t-1", amr: ["otp"] });
  bindLocale(() => "ru");
});
afterEach(() => { vi.unstubAllGlobals(); setSession(null); });

const sent = (i = 0) => ({ url: fetchMock.mock.calls[i]![0] as string, init: fetchMock.mock.calls[i]![1] as RequestInit & { headers: Record<string, string> } });

describe("api()", () => {
  it("GET: Authorization, Accept-Language va X-Tenant-Id yuboriladi; Idempotency-Key yo'q", async () => {
    fetchMock.mockResolvedValue(json(200, { ok: 1 }));
    await api("/v1/members", { tenant: true });
    const { init } = sent();
    expect(init.headers.Authorization).toMatch(/^Bearer /);
    expect(init.headers["Accept-Language"]).toBe("ru");
    expect(init.headers["X-Tenant-Id"]).toBe("t-1");
    expect(init.headers["Idempotency-Key"]).toBeUndefined();
  });

  it("o'zgartiruvchi so'rovga UUID Idempotency-Key qo'shiladi; auth endpointlariga yo'q", async () => {
    fetchMock.mockResolvedValue(json(200, {}));
    await api("/v1/invites", { method: "POST", body: { a: 1 } });
    expect(sent(0).init.headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/i);
    await api("/v1/auth/otp/request", { method: "POST", auth: false, body: {} });
    expect(sent(1).init.headers["Idempotency-Key"]).toBeUndefined();
    expect(sent(1).init.headers.Authorization).toBeUndefined();
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

  it("401 auth.token_invalid: yangilash tokeni bilan bir marta qayta uriniladi, yangi tokenlar saqlanadi", async () => {
    const fresh = jwt(["otp", "totp"]);
    fetchMock
      .mockResolvedValueOnce(json(401, { code: "auth.token_invalid", message_uz: "", message_ru: "", details: {} }))
      .mockResolvedValueOnce(json(200, { access_token: fresh, refresh_token: "r2", expires_in: 900 }))
      .mockResolvedValueOnce(json(200, { ok: true }));
    await expect(api("/v1/me")).resolves.toEqual({ ok: true });
    expect(sent(1).url).toBe("/v1/auth/refresh");
    expect(JSON.parse(sent(1).init.body as string)).toEqual({ refresh_token: "r1" });
    expect(sent(2).init.headers.Authorization).toBe(`Bearer ${fresh}`);
    expect(getSession()).toMatchObject({ refresh: "r2", tenantId: "t-1", amr: ["otp", "totp"] });
  });

  it("yangilash ham muvaffaqiyatsiz bo'lsa sessiya tozalanadi", async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, { code: "auth.token_invalid", message_uz: "", message_ru: "", details: {} }))
      .mockResolvedValueOnce(json(401, { code: "auth.refresh_invalid", message_uz: "", message_ru: "", details: {} }));
    await expect(api("/v1/me")).rejects.toBeInstanceOf(ApiError);
    expect(getSession()).toBeNull();
  });

  it("parallel 401'lar bitta yangilashga birlashadi (single-flight)", async () => {
    const fresh = jwt(["otp", "totp"]);
    fetchMock.mockImplementation((url: string, init: { headers: Record<string, string> }) => {
      if (url === "/v1/auth/refresh") return Promise.resolve(json(200, { access_token: fresh, refresh_token: "r2" }));
      const auth = init.headers.Authorization;
      return Promise.resolve(auth === `Bearer ${fresh}` ? json(200, {}) : json(401, { code: "auth.token_invalid", message_uz: "", message_ru: "", details: {} }));
    });
    await Promise.all([api("/v1/me"), api("/v1/me")]);
    expect(fetchMock.mock.calls.filter((c) => c[0] === "/v1/auth/refresh")).toHaveLength(1);
  });

  it("204 — undefined", async () => {
    fetchMock.mockResolvedValue(json(204, null));
    await expect(api("/v1/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });
});

describe("session", () => {
  it("decodeAmr: tokendan amr olinadi; buzuq token — bo'sh", () => {
    expect(decodeAmr(jwt(["otp", "totp"]))).toEqual(["otp", "totp"]);
    expect(decodeAmr("garbage")).toEqual([]);
  });
});
