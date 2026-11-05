import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import { boot, call, type Harness } from "./helpers";

/** VAQTINCHA sinov rejimi (OPEN_LOGIN=on). Alohida ilova nusxasi; qolgan testlar rejim o'chiq holatda. */
let h: Harness;
beforeAll(async () => { process.env.OPEN_LOGIN = "on"; h = await boot(); });
afterAll(async () => { await h.close(); delete process.env.OPEN_LOGIN; });
beforeEach(async () => { await h.reset(); });

const PHONE = "+998901000001";

describe("OPEN_LOGIN: telefon raqami bilan to'g'ridan-to'g'ri kirish", () => {
  it("config: rejim yoqilgani ma'lum qilinadi", async () => {
    expect((await call(h, "get", "/v1/auth/config").expect(200)).body).toEqual({ open_login: true });
  });

  it("SMS kodsiz, rozilik so'ralmasdan kiradi; soxta rozilik yozuvi yaratilmaydi; audit yoziladi", async () => {
    const r = await call(h, "post", "/v1/auth/open", { body: { phone: PHONE } }).expect(200);
    expect(r.body).toMatchObject({ is_new_user: true });
    expect(h.sms.outbox).toHaveLength(0);
    expect((await h.admin.query("select count(*)::int as n from consents")).rows[0].n).toBe(0);
    expect((await h.admin.query("select count(*)::int as n from audit_log where action = 'auth.open_login'")).rows[0].n).toBe(1);
    const again = await call(h, "post", "/v1/auth/open", { body: { phone: PHONE } }).expect(200);
    expect(again.body.is_new_user).toBe(false);
    expect(again.body.user.id).toBe(r.body.user.id);
  });

  it("noto'g'ri telefon — 400", async () => {
    await call(h, "post", "/v1/auth/open", { body: { phone: "123" } }).expect(400);
    await call(h, "post", "/v1/auth/open", { body: { phone: PHONE, extra: 1 } }).expect(400);
  });

  it("do'kon yaratish: oferta akcepti va TOTP'siz ishlaydi, egasi do'kon amallarini bajaradi", async () => {
    const s = (await call(h, "post", "/v1/auth/open", { body: { phone: PHONE } }).expect(200)).body;
    const t = await call(h, "post", "/v1/tenants", { token: s.access_token, body: { name: "Sinov Do'kon", tin: "123456789" } }).expect(201);
    const T = { token: s.access_token, tenant: t.body.id as string };
    await call(h, "post", "/v1/branches", { ...T, body: { name: "Markaz", address: "Toshkent, Chilonzor" } }).expect(201); // egasi: 2FA kerak edi
    await call(h, "get", "/v1/members", T).expect(200);
    await call(h, "post", "/v1/products", { ...T, body: { name_uz: "Non", price_tiyin: 400000 } }).expect(201);
  });

  it("TOTP yoqilgan foydalanuvchi ham ikkinchi omilsiz kiradi", async () => {
    const first = (await call(h, "post", "/v1/auth/open", { body: { phone: PHONE } }).expect(200)).body;
    await h.admin.query("update users set totp_enabled = true where id = $1", [first.user.id]);
    const r = await call(h, "post", "/v1/auth/open", { body: { phone: PHONE } }).expect(200);
    expect(r.body.mfa_required).toBeUndefined();
    expect(r.body.access_token).toBeTruthy();
  });

  it("yangilash tokeni ishlaydi va sinov sessiyasi saqlanadi", async () => {
    const s = (await call(h, "post", "/v1/auth/open", { body: { phone: PHONE } }).expect(200)).body;
    const r = await call(h, "post", "/v1/auth/refresh", { key: null, body: { refresh_token: s.refresh_token } }).expect(200);
    const t = await call(h, "post", "/v1/tenants", { token: r.body.access_token, body: { name: "Sinov Do'kon", tin: "123456789" } }).expect(201);
    await call(h, "post", "/v1/branches", { token: r.body.access_token, tenant: t.body.id, body: { name: "Markaz", address: "Toshkent, Chilonzor" } }).expect(201);
  });
});

describe("OPEN_LOGIN: konfiguratsiya himoyasi", () => {
  const base = { NODE_ENV: "production", JWT_SECRET: "x".repeat(40), DATA_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"), PHONE_HASH_PEPPER: "prod-pepper-xxxxxxxx", TELEGRAM_BOT_TOKEN: "1:abc", DATABASE_URL: "postgres://x", APP_DATABASE_URL: "postgres://x", REDIS_URL: "redis://x" } as NodeJS.ProcessEnv;
  it("productionda ikki marta ongli tasdiqsiz yoqilmaydi", () => {
    expect(() => loadConfig({ ...base, OPEN_LOGIN: "on" })).toThrow(/OPEN_LOGIN_CONFIRM/);
    expect(() => loadConfig({ ...base, OPEN_LOGIN: "on", OPEN_LOGIN_CONFIRM: "yes" })).toThrow(/OPEN_LOGIN_CONFIRM/);
    expect(loadConfig({ ...base, OPEN_LOGIN: "on", OPEN_LOGIN_CONFIRM: "I-UNDERSTAND-NO-AUTH" }).OPEN_LOGIN).toBe("on");
  });
  it("standart holatda o'chiq", () => {
    expect(loadConfig({ ...base }).OPEN_LOGIN).toBe("off");
  });
});
