import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CONFIG, type Config } from "../src/config";
import { findPlaceholders, PLACEHOLDER } from "../src/modules/legal/legal.service";
import { boot, call, CONSENTS, lastCode, makeAdmin, makeOwner, renew, SHOP_CONSENTS, signUp, type Harness } from "./helpers";

let h: Harness;
const PHONE = "+998901234567";
beforeAll(async () => { h = await boot(); });
afterAll(async () => { await h.close(); });
beforeEach(async () => { await h.reset(); });

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const cfg = () => h.app.get<Config>(CONFIG);
const filled = (md: string) => md.replace(PLACEHOLDER, "Dariko MChJ");

/** Tasdiqlangan (rekvizitlari to'ldirilgan) yangi versiyani kuchga kiritadi. */
async function publishNew(admin: { token: string }, key: string, suffix = "") {
  const cur = await call(h, "get", `/v1/legal/documents/${key}`).expect(200);
  const draft = await call(h, "post", "/v1/admin/legal", { token: admin.token, body: { key, locale: "uz", title: cur.body.title, body_md: filled(cur.body.body_md) + suffix } }).expect(201);
  expect(draft.body.placeholders).toEqual([]);
  return call(h, "post", `/v1/admin/legal/${draft.body.id}/publish`, { token: admin.token, body: {} }).expect(200);
}

describe("hujjatlar: seed va ommaviy o'qish", () => {
  it("5 hujjat o'zbekcha qoralama (v1) sifatida seed qilingan; matn xeshi = sha256(matn)", async () => {
    const rows = (await h.admin.query("select key, locale, version, status, body_md, text_hash from legal_documents order by key")).rows;
    expect(rows.map((r) => r.key)).toEqual(["courier_agreement", "customer_offer", "privacy_policy", "shop_dpa", "shop_saas_offer"]);
    for (const r of rows) {
      expect(r).toMatchObject({ locale: "uz", version: 1, status: "draft" });
      expect(r.text_hash).toBe(sha(r.body_md));
    }
  });

  it("ommaviy (kirishsiz) ro'yxat: xaridor — oferta + maxfiylik; do'kon — SaaS oferta + DPA", async () => {
    const c = await call(h, "get", "/v1/legal/documents?audience=customer").expect(200);
    expect(c.body.items.map((i: { key: string }) => i.key)).toEqual(["customer_offer", "privacy_policy"]);
    expect(c.body.items[0]).toMatchObject({ version: "1", locale: "uz", translated: true, status: "draft", effective_from: null });
    const s = await call(h, "get", "/v1/legal/documents?audience=shop").expect(200);
    expect(s.body.items.map((i: { key: string }) => i.key)).toEqual(["shop_saas_offer", "shop_dpa"]);
    await call(h, "get", "/v1/legal/documents?audience=hacker").expect(400);
  });

  it("rus tarjimasi yo'q: ru so'ralsa o'zbekcha qaytadi va translated=false (O3)", async () => {
    const r = await call(h, "get", "/v1/legal/documents/customer_offer", { lang: "ru" }).expect(200);
    expect(r.body).toMatchObject({ locale: "uz", translated: false });
    expect(r.body.body_md).toMatch(/^# Xaridor/);
  });

  it("matn va versiya bo'yicha olish; noma'lum kalit/versiya — 404", async () => {
    const r = await call(h, "get", "/v1/legal/documents/privacy_policy?version=1").expect(200);
    expect(r.body.text_hash).toBe(sha(r.body.body_md));
    await call(h, "get", "/v1/legal/documents/privacy_policy?version=9").expect(404);
    await call(h, "get", "/v1/legal/documents/nope").expect(404);
  });

  it("yurist tasdiqlamagan (draft) hujjat productionda akcept qilinmaydi: LEGAL_ALLOW_DRAFT=off -> 503", async () => {
    cfg().LEGAL_ALLOW_DRAFT = "off";
    try {
      await call(h, "get", "/v1/legal/documents?audience=customer").expect(503);
      await call(h, "post", "/v1/auth/otp/request", { body: { phone: PHONE } }).expect(202);
      const r = await call(h, "post", "/v1/auth/otp/verify", { body: { phone: PHONE, code: lastCode(h, PHONE), consents: CONSENTS } }).expect(503);
      expect(r.body.code).toBe("consent.documents_unavailable");
      await call(h, "get", "/v1/legal/documents/customer_offer").expect(404);
      expect((await h.admin.query("select count(*)::int as n from users")).rows[0].n).toBe(0);
    } finally { cfg().LEGAL_ALLOW_DRAFT = "on"; }
  });

  it("hujjat matni o'zgarmas; eskirgan versiya tiklanmaydi; o'chirib bo'lmaydi", async () => {
    await expect(h.admin.query("update legal_documents set body_md = 'x'")).rejects.toThrow(/o'zgarmas/);
    await expect(h.admin.query("update legal_documents set text_hash = repeat('a', 64)")).rejects.toThrow(/o'zgarmas/);
    await expect(h.admin.query("delete from legal_documents")).rejects.toThrow(/o'chirilmaydi/);
  });
});

describe("placeholder'lar", () => {
  it("aniqlash: \\[nomi\\] — ha; markdown havola, qisqa [1] — yo'q", () => {
    expect(findPlaceholders("Operator \\[platforma MChJ nomi, STIR\\]; DPO dpo@\\[domen\\]; [havola](https://x.uz); [1]")).toEqual(["platforma MChJ nomi, STIR", "domen"]);
    expect(findPlaceholders("hammasi to'ldirilgan")).toEqual([]);
  });

  it("seed qoralamalarida rekvizit to'ldirilmagan joylar bor — kuchga kiritish rad etiladi (422)", async () => {
    const admin = await makeAdmin(h);
    const list = await call(h, "get", "/v1/admin/legal", { token: admin.token }).expect(200);
    const offer = list.body.items.find((i: { key: string }) => i.key === "customer_offer");
    const r = await call(h, "post", `/v1/admin/legal/${offer.id}/publish`, { token: admin.token, body: {} }).expect(422);
    expect(r.body.code).toBe("legal.placeholders_remain");
    expect(r.body.details.placeholders).toContain("platforma MChJ nomi, STIR");
    expect((await h.admin.query("select status from legal_documents where id = $1", [offer.id])).rows[0].status).toBe("draft");
  });
});

describe("kuchga kiritish (admin)", () => {
  it("to'ldirilgan versiya kuchga kiradi; keyingisi oldingisini eskirtiradi; bitta amaldagi versiya", async () => {
    const admin = await makeAdmin(h);
    const p2 = await publishNew(admin, "customer_offer");
    expect(p2.body).toMatchObject({ key: "customer_offer", version: "2", status: "effective" });
    const view = await call(h, "get", "/v1/legal/documents/customer_offer").expect(200);
    expect(view.body).toMatchObject({ version: "2", status: "effective" });
    expect(view.body.body_md).not.toMatch(/\\\[platforma/);
    expect(view.body.text_hash).toBe(sha(view.body.body_md));

    const p3 = await publishNew(admin, "customer_offer", "\n\n(o'zgartirish)\n");
    expect(p3.body.version).toBe("3");
    const st = (await h.admin.query("select version, status from legal_documents where key = 'customer_offer' order by version")).rows;
    expect(st).toEqual([{ version: 1, status: "draft" }, { version: 2, status: "retired" }, { version: 3, status: "effective" }]);
    await call(h, "post", `/v1/admin/legal/${p3.body.id}/publish`, { token: admin.token, body: {} }).expect(409); // qayta chop etilmaydi
    await expect(h.admin.query("update legal_documents set status = 'effective' where version = 2 and key = 'customer_offer'")).rejects.toThrow(/tiklanmaydi|legal_one_effective|unique/);
    const a = (await h.admin.query("select action, actor_id, after from audit_log where action = 'legal.published' order by id")).rows;
    expect(a).toHaveLength(2);
    expect(a[1]).toMatchObject({ actor_id: admin.userId, after: { key: "customer_offer", version: 3, text_hash: view.body.text_hash === p3.body.text_hash ? view.body.text_hash : p3.body.text_hash } });
  });

  it("faqat platforma admini (TOTP bilan); do'kon egasi 403", async () => {
    const o = await makeOwner(h, "+998901000001");
    await call(h, "get", "/v1/admin/legal", { token: o.token }).expect(403);
    await call(h, "post", "/v1/admin/legal", { token: o.token, body: { key: "customer_offer", locale: "uz", title: "Oferta", body_md: "x".repeat(300) } }).expect(403);
  });

  it("qoralama validatsiyasi: qisqa matn va noma'lum kalit rad etiladi", async () => {
    const admin = await makeAdmin(h);
    await call(h, "post", "/v1/admin/legal", { token: admin.token, body: { key: "customer_offer", locale: "uz", title: "Oferta", body_md: "qisqa" } }).expect(400);
    await call(h, "post", "/v1/admin/legal", { token: admin.token, body: { key: "other", locale: "uz", title: "Oferta", body_md: "x".repeat(300) } }).expect(400);
  });
});

describe("akcept: xaridor", () => {
  it("rozilik yozuvlarida aynan akcept qilingan matn xeshi saqlanadi", async () => {
    await signUp(h, PHONE);
    const rows = (await h.admin.query("select document, version, text_hash from consents order by document")).rows;
    const docs = (await h.admin.query("select key, version, text_hash from legal_documents where key in ('customer_offer','privacy_policy')")).rows;
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(docs.find((d) => d.key === r.document)).toMatchObject({ version: Number(r.version), text_hash: r.text_hash });
  });

  it("yangi versiya chiqsa, mavjud foydalanuvchi keyingi kirishda FAQAT o'zgargan hujjatni qayta qabul qiladi", async () => {
    const admin = await makeAdmin(h, "+998900000001");
    await signUp(h, PHONE);
    await publishNew(admin, "customer_offer"); // v2
    h.clock.advance(61_000);
    await call(h, "post", "/v1/auth/otp/request", { body: { phone: PHONE } }).expect(202);
    const code = lastCode(h, PHONE);
    const r = await call(h, "post", "/v1/auth/otp/verify", { body: { phone: PHONE, code } }).expect(422);
    expect(r.body.code).toBe("consent.required");
    expect(r.body.details.documents).toEqual([expect.objectContaining({ document: "customer_offer", version: "2" })]);
    // kod saqlanadi: akcept bilan qayta yuboriladi
    const ok = await call(h, "post", "/v1/auth/otp/verify", { body: { phone: PHONE, code, consents: [{ document: "customer_offer", version: "2" }] } }).expect(200);
    expect(ok.body.is_new_user).toBe(false);
    const rows = (await h.admin.query("select c.document, c.version from consents c join users u on u.id = c.user_id where c.document = 'customer_offer' and u.phone = $1 order by c.created_at", [PHONE])).rows;
    expect(rows.map((x) => x.version)).toEqual(["1", "2"]); // tarix saqlanadi
    // keyingi kirishda yana so'ralmaydi
    h.clock.advance(61_000);
    await call(h, "post", "/v1/auth/otp/request", { body: { phone: PHONE } }).expect(202);
    await call(h, "post", "/v1/auth/otp/verify", { body: { phone: PHONE, code: lastCode(h, PHONE) } }).expect(200);
  });
});

describe("akcept: do'kon egasi (SaaS oferta va DPA)", () => {
  it("rozilik berilmasa do'kon yaratilmaydi: 422 consent.required (hujjatlar ro'yxati bilan)", async () => {
    const s = await signUp(h, PHONE);
    const r = await call(h, "post", "/v1/tenants", { token: s.token, body: { name: "Yashil Savat", tin: "123456789" } }).expect(422);
    expect(r.body.code).toBe("consent.required");
    expect(r.body.details.scope).toBe("shop");
    expect(r.body.details.documents.map((d: { document: string }) => d.document)).toEqual(["shop_saas_offer", "shop_dpa"]);
    expect((await h.admin.query("select count(*)::int as n from tenants")).rows[0].n).toBe(0);
    const partial = await call(h, "post", "/v1/tenants", { token: s.token, body: { name: "Yashil Savat", tin: "123456789", consents: [SHOP_CONSENTS[0]] } }).expect(422);
    expect(partial.body.details.documents).toHaveLength(1);
    await call(h, "post", "/v1/tenants", { token: s.token, body: { name: "Yashil Savat", tin: "123456789", consents: [{ document: "shop_saas_offer", version: "999" }, SHOP_CONSENTS[1]] } }).expect(422);
  });

  it("akcept do'kon (tenant_id) bilan, matn xeshi, hodisa va audit bilan yoziladi", async () => {
    const o = await makeOwner(h, PHONE);
    const rows = (await h.admin.query("select document, version, tenant_id, user_id, channel, text_hash from consents where tenant_id is not null order by document")).rows;
    expect(rows.map((r) => r.document)).toEqual(["shop_dpa", "shop_saas_offer"]);
    expect(rows.every((r) => r.tenant_id === o.tenantId && r.user_id === o.userId && r.channel === "panel")).toBe(true);
    for (const r of rows) expect((await h.admin.query("select text_hash from legal_documents where key = $1 and version = $2", [r.document, Number(r.version)])).rows[0].text_hash).toBe(r.text_hash);
    expect((await h.admin.query("select count(*)::int as n from events where name = 'consent.accepted' and tenant_id = $1", [o.tenantId])).rows[0].n).toBe(2);
    expect((await h.admin.query("select count(*)::int as n from audit_log where action = 'consent.accepted' and tenant_id = $1", [o.tenantId])).rows[0].n).toBe(1);
  });
});

describe("marketing roziligi (xizmat roziligidan alohida)", () => {
  it("berish va qaytarib olish: consent.accepted / consent.revoked hodisalari, tarix saqlanadi", async () => {
    const s = await signUp(h, PHONE);
    expect((await call(h, "get", "/v1/me/consents", { token: s.token }).expect(200)).body.items.map((i: { document: string }) => i.document)).toEqual(["customer_offer", "privacy_policy"]);
    await call(h, "put", "/v1/me/consents/marketing", { token: s.token, body: { granted: true } }).expect(200);
    await call(h, "put", "/v1/me/consents/marketing", { token: s.token, body: { granted: true } }).expect(200); // o'zgarmagan holat — yangi yozuv yo'q
    await call(h, "put", "/v1/me/consents/marketing", { token: s.token, body: { granted: false } }).expect(200);
    const rows = (await h.admin.query("select action from consents where document = 'marketing' order by created_at")).rows;
    expect(rows.map((r) => r.action)).toEqual(["accepted", "revoked"]);
    const ev = (await h.admin.query("select name from events where properties->>'document' = 'marketing' order by ts")).rows;
    expect(ev.map((e) => e.name)).toEqual(["consent.accepted", "consent.revoked"]);
    const mine = (await call(h, "get", "/v1/me/consents", { token: s.token })).body.items;
    expect(mine.find((i: { document: string }) => i.document === "marketing")).toMatchObject({ action: "revoked" });
  });

  it("Idempotency-Key majburiy; kirishsiz 401; noto'g'ri tana 400", async () => {
    const s = await signUp(h, PHONE);
    await call(h, "put", "/v1/me/consents/marketing", { token: s.token, body: { granted: true }, key: null }).expect(400);
    await call(h, "put", "/v1/me/consents/marketing", { body: { granted: true } }).expect(401);
    await call(h, "put", "/v1/me/consents/marketing", { token: s.token, body: { granted: "ha" } }).expect(400);
  });

  it("yangi foydalanuvchi marketing roziligini ro'yxatdan o'tishda bergan bo'lsa, qaytarib olish mumkin", async () => {
    await call(h, "post", "/v1/auth/otp/request", { body: { phone: PHONE } }).expect(202);
    const r = await call(h, "post", "/v1/auth/otp/verify", { body: { phone: PHONE, code: lastCode(h, PHONE), consents: CONSENTS, marketing_consent: true } }).expect(200);
    await call(h, "put", "/v1/me/consents/marketing", { token: r.body.access_token, body: { granted: false } }).expect(200);
    expect((await h.admin.query("select action from consents where document = 'marketing' order by created_at")).rows.map((x) => x.action)).toEqual(["accepted", "revoked"]);
  });
});

void renew;
