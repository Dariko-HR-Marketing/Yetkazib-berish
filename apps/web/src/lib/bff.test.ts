import { describe, expect, it } from "vitest";
import { AT, RT, clearCookies, decodeAmr, forwardHeaders, issuesTokens, parseCookies, sameOrigin, stripTokens, tokenCookies } from "./bff";

const jwt = (amr: string[]) => `h.${Buffer.from(JSON.stringify({ amr })).toString("base64url")}.s`;

describe("BFF yordamchilari", () => {
  it("token cookie'lari httpOnly; yangilash tokeni faqat /v1/auth yo'lida; HTTPS'da SameSite=None+Secure+Partitioned", () => {
    const [at, rt] = tokenCookies({ access_token: "A", refresh_token: "R", expires_in: 900 }, true);
    expect(at).toMatch(/^dst_at=A; Path=\/; HttpOnly; Max-Age=900; SameSite=None; Secure; Partitioned$/);
    expect(rt).toMatch(/^dst_rt=R; Path=\/v1\/auth; HttpOnly; Max-Age=2592000; SameSite=None; Secure; Partitioned$/);
    const [dev] = tokenCookies({ access_token: "A", refresh_token: "R", expires_in: 900 }, false);
    expect(dev).toContain("SameSite=Lax");
    expect(dev).not.toContain("Secure");
    expect(AT).toBe("dst_at"); expect(RT).toBe("dst_rt");
  });

  it("chiqishda ikkala cookie bekor qilinadi (Max-Age=0)", () => {
    const c = clearCookies(true);
    expect(c).toHaveLength(2);
    expect(c.every((x) => x.includes("Max-Age=0") && x.includes("HttpOnly"))).toBe(true);
  });

  it("javobdan tokenlar olib tashlanadi, amr qo'shiladi", () => {
    const out = stripTokens({ access_token: jwt(["otp", "totp"]), refresh_token: "R", expires_in: 900, is_new_user: true, user: { id: "u" } });
    expect(out).toEqual({ is_new_user: true, user: { id: "u" }, amr: ["otp", "totp"] });
    expect(JSON.stringify(out)).not.toContain("refresh");
    expect(stripTokens({ mfa_required: true, mfa_token: "m" })).toEqual({ mfa_required: true, mfa_token: "m" });
  });

  it("qaysi endpointlar token chiqaradi", () => {
    for (const p of ["auth/otp/verify", "auth/telegram", "auth/totp/verify", "auth/totp/confirm", "auth/refresh"]) expect(issuesTokens(p)).toBe(true);
    for (const p of ["auth/otp/request", "me", "tenants", "auth/logout"]) expect(issuesTokens(p)).toBe(false);
  });

  it("CSRF: Origin tekshiruvi", () => {
    expect(sameOrigin("GET", null, "app.uz")).toBe(true);
    expect(sameOrigin("POST", "https://app.uz", "app.uz")).toBe(true);
    expect(sameOrigin("POST", "https://evil.example", "app.uz")).toBe(false);
    expect(sameOrigin("PATCH", null, "app.uz")).toBe(false);
    expect(sameOrigin("POST", "https://app.uz", "internal:3000", "app.uz")).toBe(true);
    expect(sameOrigin("DELETE", "not a url", "app.uz")).toBe(false);
  });

  it("cookie tahlili va amr dekodlash", () => {
    expect(parseCookies("a=1; dst_at=x%20y; b=2")).toEqual({ a: "1", dst_at: "x y", b: "2" });
    expect(parseCookies(null)).toEqual({});
    expect(decodeAmr("garbage")).toEqual([]);
  });

  it("API'ga faqat ruxsat etilgan sarlavhalar uzatiladi; Authorization cookie'dan", () => {
    const inH = new Headers({ cookie: "dst_at=A", "x-tenant-id": "t", "idempotency-key": "k", accept: "application/json", authorization: "Bearer EVIL", "x-forwarded-for": "9.9.9.9" });
    const out = forwardHeaders(inH, "A", "1.2.3.4");
    expect(out.get("authorization")).toBe("Bearer A"); // mijoz yuborgan Authorization hisobga olinmaydi
    expect(out.get("cookie")).toBeNull();
    expect(out.get("x-tenant-id")).toBe("t");
    expect(out.get("x-forwarded-for")).toBe("1.2.3.4");
    expect(forwardHeaders(inH, undefined, null).get("authorization")).toBeNull();
  });
});
