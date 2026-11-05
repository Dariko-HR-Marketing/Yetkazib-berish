import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { boot, call, CONSENTS, lastCode, makeOwner, signUp, telegramInitData, totpCode, type Harness } from "./helpers";

let h: Harness;
const PHONE = "+998901234567";
beforeAll(async () => { h = await boot(); });
afterAll(async () => { await h.close(); });
beforeEach(async () => { await h.reset(); });

const requestOtp = (phone = PHONE) => call(h, "post", "/v1/auth/otp/request", { body: { phone } });
const verify = (code: string, extra: object = {}, phone = PHONE) => call(h, "post", "/v1/auth/otp/verify", { body: { phone, code, ...extra } });

describe("I-1: SMS kod so'rash", () => {
  it("to'g'ri +998 raqamga 6 xonali kod yuboriladi, 5 daqiqa amal qiladi", async () => {
    const r = await requestOtp().expect(202);
    expect(r.body).toEqual({ expires_in: 300, retry_after: 60 });
    expect(lastCode(h, PHONE)).toMatch(/^\d{6}$/);
    const row = (await h.admin.query("select expires_at, created_at, code_hash from otp_codes")).rows[0];
    expect(row.expires_at.getTime() - row.created_at.getTime()).toBe(5 * 60 * 1000);
    expect(row.code_hash).not.toContain(lastCode(h, PHONE)); // kod ochiq saqlanmaydi
  });

  it("5 daqiqadan keyin kod ishlamaydi", async () => {
    await requestOtp().expect(202);
    const code = lastCode(h, PHONE);
    h.clock.advance(5 * 60 * 1000 + 1000);
    const r = await verify(code, { consents: CONSENTS }).expect(401);
    expect(r.body.code).toBe("auth.otp_expired");
  });

  it("60 soniyada ikkinchi so'rov 429; 60 soniyadan keyin ruxsat", async () => {
    await requestOtp().expect(202);
    const r = await requestOtp().expect(429);
    expect(r.body.code).toBe("auth.otp_rate_limited");
    expect(r.body.details.retry_after).toBeGreaterThan(0);
    h.clock.advance(61_000);
    await requestOtp().expect(202);
  });

  it.each(["+99890123", "998901234567", "+1234567890123", "abc", ""])("noto'g'ri raqam rad etiladi: %s", async (bad) => {
    const r = await requestOtp(bad).expect(400);
    expect(r.body.code).toBe("validation.phone_invalid");
    expect(r.body.message_uz).toContain("+998");
    expect(r.body.message_ru).toContain("+998");
  });

  it("bo'shliq va tire bilan yozilgan raqam normallashtiriladi", async () => {
    await requestOtp("+998 90 123-45-67").expect(202);
    expect(h.sms.outbox[0]!.phone).toBe(PHONE);
  });
});

describe("I-2: 5 xato -> 15 daqiqa blok", () => {
  it("6-urinishda raqam bloklanadi, auth.otp_locked hodisasi yoziladi (telefon xeshi bilan, ochiq raqamsiz)", async () => {
    await requestOtp().expect(202);
    const real = lastCode(h, PHONE);
    const wrong = real === "000000" ? "111111" : "000000";
    for (let i = 1; i <= 5; i++) {
      const r = await verify(wrong, { consents: CONSENTS }).expect(401);
      expect(r.body.code).toBe("auth.otp_invalid");
      expect(r.body.details.attempts_left).toBe(5 - i);
    }
    const sixth = await verify(real, { consents: CONSENTS }).expect(423); // to'g'ri kod ham o'tmaydi
    expect(sixth.body.code).toBe("auth.otp_locked");
    const ev = (await h.admin.query("select properties, tenant_id from events where name = 'auth.otp_locked'")).rows;
    expect(ev).toHaveLength(1);
    expect(ev[0].properties.phone_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(ev[0].properties)).not.toContain("998");
  });

  it("blok davomida yangi kod so'rab bo'lmaydi; 15 daqiqadan keyin bo'ladi", async () => {
    await requestOtp().expect(202);
    for (let i = 0; i < 6; i++) await verify("000000", { consents: CONSENTS });
    expect((await requestOtp().expect(423)).body.code).toBe("auth.otp_locked");
    h.clock.advance(14 * 60 * 1000);
    await requestOtp().expect(423);
    h.clock.advance(61 * 1000 + 60 * 1000);
    await requestOtp().expect(202);
    const ok = await verify(lastCode(h, PHONE), { consents: CONSENTS }).expect(200);
    expect(ok.body.access_token).toBeTruthy();
  });

  it("muvaffaqiyatli kod qayta ishlatilmaydi", async () => {
    await requestOtp().expect(202);
    const code = lastCode(h, PHONE);
    await verify(code, { consents: CONSENTS }).expect(200);
    await verify(code, { consents: CONSENTS }).expect(401);
  });
});

describe("I-3: Telegram initData", () => {
  const BOT = "123456:TEST-BOT-TOKEN";
  const now = () => Math.floor(h.clock.now().getTime() / 1000);
  const tg = (initData: string, extra: object = {}) => call(h, "post", "/v1/auth/telegram", { body: { init_data: initData, ...extra } });

  it("imzo to'g'ri bo'lsa kiradi va foydalanuvchi telegram_id bilan yaratiladi", async () => {
    const r = await tg(telegramInitData(BOT, { id: 777001, language_code: "ru" }, now()), { consents: CONSENTS }).expect(200);
    expect(r.body.is_new_user).toBe(true);
    expect(r.body.user.locale).toBe("ru");
    expect(r.body.user.telegram_linked).toBe(true);
    const again = await tg(telegramInitData(BOT, { id: 777001 }, now())).expect(200); // mavjud foydalanuvchiga rozilik shart emas
    expect(again.body.is_new_user).toBe(false);
  });

  it("buzilgan imzo rad etiladi", async () => {
    const r = await tg(telegramInitData(BOT, { id: 1 }, now(), true), { consents: CONSENTS }).expect(401);
    expect(r.body.code).toBe("auth.telegram_invalid");
  });

  it("imzo oxiriga ortiqcha belgi qo'shilsa ham rad etiladi (qat'iy hex)", async () => {
    const good = telegramInitData(BOT, { id: 1 }, now());
    await tg(good + "zz", { consents: CONSENTS }).expect(401);
    await tg(good.replace(/hash=[0-9a-f]+/, (m) => m + "g"), { consents: CONSENTS }).expect(401);
  });

  it("boshqa bot tokeni bilan imzolangan rad etiladi", async () => {
    await tg(telegramInitData("999:OTHER", { id: 1 }, now()), { consents: CONSENTS }).expect(401);
  });

  it("24 soatdan eski initData rad etiladi; 23 soat 59 daqiqa — o'tadi", async () => {
    const old = telegramInitData(BOT, { id: 5 }, now() - 24 * 3600 - 5);
    const r = await tg(old, { consents: CONSENTS }).expect(401);
    expect(r.body.code).toBe("auth.telegram_expired");
    await tg(telegramInitData(BOT, { id: 5 }, now() - 23 * 3600 - 59 * 60), { consents: CONSENTS }).expect(200);
  });

  it("kelajakdagi auth_date rad etiladi", async () => {
    await tg(telegramInitData(BOT, { id: 5 }, now() + 3600), { consents: CONSENTS }).expect(401);
  });

  it("yangi telegram foydalanuvchi rozilik bermasa 422", async () => {
    const r = await tg(telegramInitData(BOT, { id: 9 }, now())).expect(422);
    expect(r.body.code).toBe("consent.required");
  });
});

describe("I-4: birinchi kirishda oferta va maxfiylik akcepti", () => {
  it("rozilik berilmasa 422 consent.required, kod saqlanadi va foydalanuvchi yaratilmaydi", async () => {
    await requestOtp().expect(202);
    const code = lastCode(h, PHONE);
    const r = await verify(code).expect(422);
    expect(r.body.code).toBe("consent.required");
    expect(r.body.details.documents).toEqual(CONSENTS);
    expect((await h.admin.query("select count(*)::int as n from users")).rows[0].n).toBe(0);
    await verify(code, { consents: CONSENTS }).expect(200); // xuddi shu kod bilan davom etish mumkin
  });

  it("eskirgan versiya bilan akcept qabul qilinmaydi", async () => {
    await requestOtp().expect(202);
    await verify(lastCode(h, PHONE), { consents: [{ document: "customer_offer", version: "1999-01-01" }, { document: "privacy_policy", version: "1999-01-01" }] }).expect(422);
  });

  it("akcept consents jadvaliga hujjat, versiya, kanal, IP va matn xeshi bilan yoziladi; marketing alohida", async () => {
    await requestOtp().expect(202);
    await verify(lastCode(h, PHONE), { consents: CONSENTS, marketing_consent: true }).expect(200);
    const rows = (await h.admin.query("select document, version, action, channel, text_hash, ip from consents order by document")).rows;
    expect(rows.map((r) => r.document)).toEqual(["customer_offer", "marketing", "privacy_policy"]);
    expect(rows.every((r) => r.action === "accepted" && r.channel === "sms" && /^[0-9a-f]{64}$/.test(r.text_hash))).toBe(true);
    expect((await h.admin.query("select count(*)::int as n from events where name = 'consent.accepted'")).rows[0].n).toBe(3);
  });

  it("marketing roziligi bermasa yozilmaydi (xizmat va marketing roziligi alohida)", async () => {
    await requestOtp().expect(202);
    await verify(lastCode(h, PHONE), { consents: CONSENTS }).expect(200);
    expect((await h.admin.query("select count(*)::int as n from consents where document = 'marketing'")).rows[0].n).toBe(0);
  });

  it("consents jadvali o'zgarmas: UPDATE/DELETE rad etiladi", async () => {
    await signUp(h, PHONE);
    await expect(h.admin.query("update consents set version = 'x'")).rejects.toThrow(/o'zgarmas/);
    await expect(h.admin.query("delete from consents")).rejects.toThrow(/o'zgarmas/);
  });

  it("mavjud foydalanuvchi qayta kirganda akcept so'ralmaydi", async () => {
    await signUp(h, PHONE);
    h.clock.advance(61_000);
    await requestOtp().expect(202);
    const r = await verify(lastCode(h, PHONE)).expect(200);
    expect(r.body.is_new_user).toBe(false);
  });
});

describe("I-5: egasi, buxgalter, admin uchun ikkinchi omil", () => {
  it("TOTP'siz egasi do'kon endpointlariga kira olmaydi (403 auth.mfa_required)", async () => {
    const s = await signUp(h, PHONE);
    const t = await call(h, "post", "/v1/tenants", { token: s.token, body: { name: "Do'kon", tin: "123456789" } }).expect(201);
    const r = await call(h, "get", `/v1/members`, { token: s.token, tenant: t.body.id }).expect(403);
    expect(r.body.code).toBe("auth.mfa_required");
  });

  it("TOTP yoqilgach kirish ikki bosqichli: avval mfa_token, keyin kod", async () => {
    const o = await makeOwner(h, PHONE);
    h.clock.advance(61_000);
    await requestOtp().expect(202);
    const r1 = await verify(lastCode(h, PHONE)).expect(200);
    expect(r1.body).toEqual({ mfa_required: true, mfa_token: expect.any(String) });
    expect(r1.body.access_token).toBeUndefined();

    h.clock.advance(30_000);
    const bad = await call(h, "post", "/v1/auth/totp/verify", { key: null, body: { mfa_token: r1.body.mfa_token, code: "000000" } }).expect(401);
    expect(bad.body.code).toBe("auth.mfa_invalid");
    const ok = await call(h, "post", "/v1/auth/totp/verify", { key: null, body: { mfa_token: r1.body.mfa_token, code: totpCode(o.secret, h) } }).expect(200);
    const members = await call(h, "get", "/v1/members", { token: ok.body.access_token, tenant: o.tenantId }).expect(200);
    expect(members.body.items).toHaveLength(1);
  });

  it("TOTP kodi qayta ishlatilmaydi (replay)", async () => {
    const o = await makeOwner(h, PHONE);
    h.clock.advance(61_000);
    await requestOtp().expect(202);
    const r1 = await verify(lastCode(h, PHONE)).expect(200);
    h.clock.advance(30_000);
    const code = totpCode(o.secret, h);
    await call(h, "post", "/v1/auth/totp/verify", { key: null, body: { mfa_token: r1.body.mfa_token, code } }).expect(200);
    await call(h, "post", "/v1/auth/totp/verify", { key: null, body: { mfa_token: r1.body.mfa_token, code } }).expect(401);
  });

  it("TOTP'da 5 xato urinishdan keyin bloklanadi", async () => {
    const o = await makeOwner(h, PHONE);
    h.clock.advance(61_000);
    await requestOtp().expect(202);
    const r1 = await verify(lastCode(h, PHONE)).expect(200);
    for (let i = 0; i < 5; i++) await call(h, "post", "/v1/auth/totp/verify", { key: null, body: { mfa_token: r1.body.mfa_token, code: "000000" } }).expect(401);
    h.clock.advance(30_000);
    const r = await call(h, "post", "/v1/auth/totp/verify", { key: null, body: { mfa_token: r1.body.mfa_token, code: totpCode(o.secret, h) } }).expect(423);
    expect(r.body.code).toBe("auth.otp_locked");
  });

  it("TOTP kaliti bazada shifrlangan holda saqlanadi", async () => {
    const s = await signUp(h, PHONE);
    const e = await call(h, "post", "/v1/auth/totp/enroll", { token: s.token, key: null }).expect(200);
    const enc = (await h.admin.query("select totp_secret_enc from users")).rows[0].totp_secret_enc as string;
    expect(enc.startsWith("v1.")).toBe(true);
    expect(enc).not.toContain(e.body.secret);
  });

  it("mfa_token bilan do'kon endpointlariga kirib bo'lmaydi; access token mfa_token sifatida yaramaydi", async () => {
    const o = await makeOwner(h, PHONE);
    h.clock.advance(61_000);
    await requestOtp().expect(202);
    const r1 = await verify(lastCode(h, PHONE)).expect(200);
    await call(h, "get", "/v1/me", { token: r1.body.mfa_token }).expect(401);
    await call(h, "post", "/v1/auth/totp/verify", { key: null, body: { mfa_token: o.token, code: "123456" } }).expect(401);
  });

  it("yig'uvchi kabi rollar uchun 2FA majburiy emas", async () => {
    // t.test (tenancy) da to'liq tekshiriladi; bu yerda faqat egasi bo'lmagan oddiy foydalanuvchi /me ga 2FA'siz kiradi
    const s = await signUp(h, PHONE);
    await call(h, "get", "/v1/me", { token: s.token }).expect(200);
  });
});

describe("I-6: sessiya", () => {
  it("kirish tokeni 15 daqiqa amal qiladi", async () => {
    const s = await signUp(h, PHONE);
    await call(h, "get", "/v1/me", { token: s.token }).expect(200);
    h.clock.advance(14 * 60 * 1000);
    await call(h, "get", "/v1/me", { token: s.token }).expect(200);
    h.clock.advance(61 * 1000);
    const r = await call(h, "get", "/v1/me", { token: s.token }).expect(401);
    expect(r.body.code).toBe("auth.token_invalid");
  });

  it("yangilash tokeni har ishlatilganda aylanadi; eskisi ishlamaydi", async () => {
    const s = await signUp(h, PHONE);
    const r1 = await call(h, "post", "/v1/auth/refresh", { key: null, body: { refresh_token: s.refresh } }).expect(200);
    expect(r1.body.refresh_token).not.toBe(s.refresh);
    expect(r1.body.expires_in).toBe(900);
    await call(h, "get", "/v1/me", { token: r1.body.access_token }).expect(200);
    const reuse = await call(h, "post", "/v1/auth/refresh", { key: null, body: { refresh_token: s.refresh } }).expect(401);
    expect(reuse.body.code).toBe("auth.refresh_invalid");
  });

  it("eski yangilash tokeni qayta ishlatilsa butun oila bekor qilinadi (o'g'irlikdan himoya)", async () => {
    const s = await signUp(h, PHONE);
    const r1 = await call(h, "post", "/v1/auth/refresh", { key: null, body: { refresh_token: s.refresh } }).expect(200);
    await call(h, "post", "/v1/auth/refresh", { key: null, body: { refresh_token: s.refresh } }).expect(401); // reuse
    await call(h, "post", "/v1/auth/refresh", { key: null, body: { refresh_token: r1.body.refresh_token } }).expect(401); // yangisi ham bekor
    await call(h, "get", "/v1/me", { token: r1.body.access_token }).expect(401);
  });

  it("30 kun faolsizlikdan keyin sessiya tugaydi; muntazam foydalanishda uzayadi", async () => {
    const s = await signUp(h, PHONE);
    h.clock.advance(29 * 24 * 3600 * 1000);
    const r1 = await call(h, "post", "/v1/auth/refresh", { key: null, body: { refresh_token: s.refresh } }).expect(200);
    h.clock.advance(29 * 24 * 3600 * 1000); // yangi token bilan yana 29 kun — hali amal qiladi
    const r2 = await call(h, "post", "/v1/auth/refresh", { key: null, body: { refresh_token: r1.body.refresh_token } }).expect(200);
    h.clock.advance(30 * 24 * 3600 * 1000 + 1000);
    await call(h, "post", "/v1/auth/refresh", { key: null, body: { refresh_token: r2.body.refresh_token } }).expect(401);
  });

  it("chiqish sessiyani darhol tugatadi (kirish tokeni ham)", async () => {
    const s = await signUp(h, PHONE);
    await call(h, "post", "/v1/auth/logout", { token: s.token, key: null }).expect(204);
    await call(h, "get", "/v1/me", { token: s.token }).expect(401);
    await call(h, "post", "/v1/auth/refresh", { key: null, body: { refresh_token: s.refresh } }).expect(401);
  });

  it("yangilash tokeni bazada xesh sifatida saqlanadi", async () => {
    const s = await signUp(h, PHONE);
    const row = (await h.admin.query("select token_hash from refresh_tokens")).rows[0];
    expect(row.token_hash).not.toBe(s.refresh);
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("autentifikatsiyasiz va buzilgan token — 401 (xato formati bilan)", async () => {
    const a = await call(h, "get", "/v1/me").expect(401);
    expect(a.body).toMatchObject({ code: "auth.unauthorized", message_uz: expect.any(String), message_ru: expect.any(String), details: {} });
    await call(h, "get", "/v1/me", { token: "abc.def.ghi" }).expect(401);
  });
});

describe("/v1/me", () => {
  it("telefon maskalangan holda qaytadi", async () => {
    const s = await signUp(h, PHONE);
    const me = await call(h, "get", "/v1/me", { token: s.token }).expect(200);
    expect(me.body.phone_masked).toBe("+99890 ••• •• 67");
    expect(JSON.stringify(me.body)).not.toContain("1234567");
    expect(me.body.memberships).toEqual([]);
  });
});
