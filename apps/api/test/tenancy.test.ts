import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addStaff, boot, call, idem, invite, makeAdmin, makeOwner, renew, signUp, type Harness } from "./helpers";

let h: Harness;
const OWNER = "+998901000001";
beforeAll(async () => { h = await boot(); });
afterAll(async () => { await h.close(); });
beforeEach(async () => { await h.reset(); });

describe("T-1: do'kon yaratish", () => {
  it("qoralama holatda, foydalanuvchi egasi, paket Start", async () => {
    const s = await signUp(h, OWNER);
    const r = await call(h, "post", "/v1/tenants", { token: s.token, body: { name: "Yashil Savat", tin: "123456789" } }).expect(201);
    expect(r.body).toMatchObject({ name: "Yashil Savat", tin: "123456789", status: "draft", plan: { code: "start", version: 1 } });
    const m = (await h.admin.query("select role, status, user_id from memberships where tenant_id = $1", [r.body.id])).rows;
    expect(m).toEqual([{ role: "owner", status: "active", user_id: s.userId }]);
    const me = await call(h, "get", "/v1/me", { token: s.token }).expect(200);
    expect(me.body.memberships[0]).toMatchObject({ tenant_id: r.body.id, role: "owner", tenant_name: "Yashil Savat" });
  });

  it("autentifikatsiyasiz — 401", async () => {
    await call(h, "post", "/v1/tenants", { body: { name: "X Do'kon", tin: "123456789" } }).expect(401);
  });

  it("yaratish audit jurnaliga yoziladi", async () => {
    const o = await makeOwner(h, OWNER);
    const a = (await h.admin.query("select action, actor_id, tenant_id from audit_log where action = 'tenant.created'")).rows;
    expect(a).toEqual([{ action: "tenant.created", actor_id: o.userId, tenant_id: o.tenantId }]);
  });

  it("PATCH: egasi nomni o'zgartiradi va do'konni faollashtiradi", async () => {
    const o = await makeOwner(h, OWNER);
    const r = await call(h, "patch", `/v1/tenants/${o.tenantId}`, { token: o.token, tenant: o.tenantId, body: { name: "Yangi nom", status: "active" } }).expect(200);
    expect(r.body).toMatchObject({ name: "Yangi nom", status: "active" });
    const a = (await h.admin.query("select before, after from audit_log where action = 'tenant.updated'")).rows[0];
    expect(a.before.name).toBe("Yashil Savat");
    expect(a.after.name).toBe("Yangi nom");
  });

  it("URL'dagi do'kon X-Tenant-Id bilan mos kelmasa 404", async () => {
    const o = await makeOwner(h, OWNER);
    const other = await makeOwner(h, "+998901000009", "987654321", "Boshqa");
    await call(h, "get", `/v1/tenants/${other.tenantId}`, { token: o.token, tenant: o.tenantId }).expect(404);
  });
});

describe("T-2: STIR tekshiruvi", () => {
  it.each(["12345678", "1234567890", "12345678a", "", "123 456 789"])("STIR %j rad etiladi (uz/ru xabar bilan)", async (tin) => {
    const s = await signUp(h, OWNER);
    const r = await call(h, "post", "/v1/tenants", { token: s.token, body: { name: "Do'kon", tin } }).expect(400);
    expect(r.body.code).toBe("validation.tin_invalid");
    expect(r.body.message_uz).toMatch(/STIR/);
    expect(r.body.message_ru).toMatch(/ИНН/);
    expect((await h.admin.query("select count(*)::int as n from tenants")).rows[0].n).toBe(0);
  });

  it("qisqa nom — validation.failed", async () => {
    const s = await signUp(h, OWNER);
    const r = await call(h, "post", "/v1/tenants", { token: s.token, body: { name: "A", tin: "123456789" } }).expect(400);
    expect(r.body.code).toBe("validation.failed");
    expect(r.body.details.issues[0].path).toBe("name");
  });

  it("noma'lum maydon rad etiladi (strict)", async () => {
    const s = await signUp(h, OWNER);
    await call(h, "post", "/v1/tenants", { token: s.token, body: { name: "Do'kon", tin: "123456789", plan_code: "pro" } }).expect(400);
  });
});

describe("T-3: xodim taklifi", () => {
  it("taklif SMS bilan ketadi, 72 soat amal qiladi; qabul qilgan xodim a'zo bo'ladi", async () => {
    const o = await makeOwner(h, OWNER);
    const r = await invite(h, o, "+998901000002", "picker").expect(201);
    expect(r.body).toMatchObject({ role: "picker", status: "pending", phone_masked: "+99890 ••• •• 02" });
    const left = new Date(r.body.expires_at).getTime() - h.clock.now().getTime();
    expect(left).toBeGreaterThan(72 * 3600 * 1000 - 5000);
    expect(left).toBeLessThanOrEqual(72 * 3600 * 1000);
    const sms = h.sms.outbox.find((m) => m.phone === "+998901000002")!;
    expect(sms.text).toMatch(/\/taklif\/[\w-]{20,}/);
    const row = (await h.admin.query("select token_hash from invites")).rows[0];
    expect(sms.text).not.toContain(row.token_hash); // bazada faqat xesh

    const staff = await addStaff(h, o, "+998901000003", "cashier");
    const me = await call(h, "get", "/v1/me", { token: staff.token }).expect(200);
    expect(me.body.memberships[0]).toMatchObject({ role: "cashier", tenant_id: o.tenantId });
  });

  it("72 soatdan keyin taklif 410 invite.expired", async () => {
    const o = await makeOwner(h, OWNER);
    await invite(h, o, "+998901000002", "picker").expect(201);
    const s = await signUp(h, "+998901000002");
    const tok = h.sms.outbox.find((m) => m.text.includes("/taklif/"))!.text.match(/\/taklif\/([\w-]+)/)![1]!;
    h.clock.advance(72 * 3600 * 1000 + 1000);
    const s2 = await renew(h, s);
    const r = await call(h, "post", `/v1/invites/${tok}/accept`, { token: s2.token }).expect(410);
    expect(r.body.code).toBe("invite.expired");
  });

  it("taklif boshqa raqamga mo'ljallangan bo'lsa qabul qilinmaydi (404, oshkor bo'lmaydi)", async () => {
    const o = await makeOwner(h, OWNER);
    await invite(h, o, "+998901000002", "picker").expect(201);
    const tok = h.sms.outbox.find((m) => m.text.includes("/taklif/"))!.text.match(/\/taklif\/([\w-]+)/)![1]!;
    const stranger = await signUp(h, "+998901000077");
    const r = await call(h, "post", `/v1/invites/${tok}/accept`, { token: stranger.token }).expect(404);
    expect(r.body.code).toBe("invite.invalid");
  });

  it("taklif bir marta ishlatiladi", async () => {
    const o = await makeOwner(h, OWNER);
    await invite(h, o, "+998901000002", "picker").expect(201);
    const tok = h.sms.outbox.find((m) => m.text.includes("/taklif/"))!.text.match(/\/taklif\/([\w-]+)/)![1]!;
    const s = await signUp(h, "+998901000002");
    await call(h, "post", `/v1/invites/${tok}/accept`, { token: s.token }).expect(200);
    await call(h, "post", `/v1/invites/${tok}/accept`, { token: s.token }).expect(404);
  });

  it("egasi rolini taklif orqali berib bo'lmaydi; noma'lum rol rad etiladi", async () => {
    const o = await makeOwner(h, OWNER);
    await invite(h, o, "+998901000002", "owner").expect(400);
    await invite(h, o, "+998901000002", "superadmin").expect(400);
    await invite(h, o, "12345", "picker").expect(400);
  });

  it("allaqachon a'zo bo'lgan raqamga taklif — 409", async () => {
    const o = await makeOwner(h, OWNER);
    await addStaff(h, o, "+998901000002", "picker");
    const r = await invite(h, o, "+998901000002", "manager").expect(409);
    expect(r.body.code).toBe("invite.already_member");
  });

  it("takroriy taklif oldingisini bekor qiladi (bitta faol taklif)", async () => {
    const o = await makeOwner(h, OWNER);
    await invite(h, o, "+998901000002", "picker").expect(201);
    h.clock.advance(1000);
    const first = h.sms.outbox.at(-1)!.text.match(/\/taklif\/([\w-]+)/)![1]!;
    await invite(h, o, "+998901000002", "manager").expect(201);
    const s = await signUp(h, "+998901000002");
    await call(h, "post", `/v1/invites/${first}/accept`, { token: s.token }).expect(404);
  });

  it("kutilayotgan takliflar ro'yxati telefon maskalangan holda", async () => {
    const o = await makeOwner(h, OWNER);
    await invite(h, o, "+998901000002", "picker").expect(201);
    const r = await call(h, "get", "/v1/invites", { token: o.token, tenant: o.tenantId }).expect(200);
    expect(r.body.items).toHaveLength(1);
    expect(JSON.stringify(r.body)).not.toContain("+998901000002");
  });
});

describe("T-4: do'konlar izolyatsiyasi (404)", () => {
  it("A xodimi B do'koni ma'lumotini so'raganda 404 — mavjudligi ham oshkor bo'lmaydi", async () => {
    const a = await makeOwner(h, OWNER, "111111111", "A do'kon");
    const b = await makeOwner(h, "+998901000009", "222222222", "B do'kon");
    const picker = await addStaff(h, a, "+998901000002", "manager");

    for (const [m, p] of [["get", "/v1/members"], ["get", "/v1/branches"], ["get", "/v1/features"], ["get", "/v1/invites"]] as const) {
      const r = await call(h, m, p, { token: picker.token, tenant: b.tenantId }).expect(404);
      expect(r.body.code).toBe("not_found");
    }
    await call(h, "get", `/v1/tenants/${b.tenantId}`, { token: picker.token, tenant: b.tenantId }).expect(404);
    await call(h, "patch", `/v1/tenants/${b.tenantId}`, { token: a.token, tenant: b.tenantId, body: { name: "Hujum" } }).expect(404);
    await call(h, "post", "/v1/branches", { token: a.token, tenant: b.tenantId, body: { name: "Filial", address: "Manzil 1" } }).expect(404);
    await call(h, "post", "/v1/invites", { token: a.token, tenant: b.tenantId, body: { phone: "+998901000055", role: "picker" } }).expect(404);
    // mavjud bo'lmagan do'kon bilan javob bir xil
    const ghost = await call(h, "get", "/v1/members", { token: a.token, tenant: "00000000-0000-4000-8000-000000000000" }).expect(404);
    const real = await call(h, "get", "/v1/members", { token: a.token, tenant: b.tenantId }).expect(404);
    expect(ghost.body).toEqual({ ...real.body });
    expect((await h.admin.query("select name from tenants where id = $1", [b.tenantId])).rows[0].name).toBe("B do'kon");
  });

  it("X-Tenant-Id yo'q yoki noto'g'ri formatda — 404", async () => {
    const a = await makeOwner(h, OWNER);
    await call(h, "get", "/v1/members", { token: a.token }).expect(404);
    await call(h, "get", "/v1/members", { token: a.token, tenant: "not-a-uuid" }).expect(404);
  });

  it("to'xtatilgan xodim do'konga kira olmaydi (404)", async () => {
    const o = await makeOwner(h, OWNER);
    const s = await addStaff(h, o, "+998901000002", "manager");
    const members = await call(h, "get", "/v1/members", { token: o.token, tenant: o.tenantId }).expect(200);
    const mid = members.body.items.find((m: { role: string }) => m.role === "manager").id;
    await call(h, "patch", `/v1/members/${mid}`, { token: o.token, tenant: o.tenantId, body: { status: "suspended" } }).expect(200);
    await call(h, "get", "/v1/members", { token: s.token, tenant: o.tenantId }).expect(404);
  });
});

describe("T-5: paket limiti", () => {
  it("Start: egasi bilan 3 xodim; 3-taklif plan.limit_reached va paketni oshirish taklifi (uz/ru)", async () => {
    const o = await makeOwner(h, OWNER);
    await invite(h, o, "+998901000002", "picker").expect(201);
    await invite(h, o, "+998901000003", "cashier").expect(201); // egasi + 2 taklif = 3
    const r = await invite(h, o, "+998901000004", "courier").expect(403);
    expect(r.body.code).toBe("plan.limit_reached");
    expect(r.body.details).toMatchObject({ resource: "staff", limit: 3, used: 3, plan: "start", next_plan: "biznes", upgrade: true });
    expect(r.body.message_uz).toContain("Biznes");
    expect(r.body.message_ru).toContain("Biznes");
    expect(r.body.message_ru).toMatch(/3 сотрудника/);
  });

  it("paket Biznesga o'tganda limit 10 ga ko'tariladi", async () => {
    const o = await makeOwner(h, OWNER);
    await invite(h, o, "+998901000002", "picker").expect(201);
    await invite(h, o, "+998901000003", "cashier").expect(201);
    await invite(h, o, "+998901000004", "courier").expect(403);
    const admin = await makeAdmin(h);
    await call(h, "post", `/v1/admin/tenants/${o.tenantId}/plan`, { token: admin.token, body: { plan_code: "biznes" } }).expect(200);
    await invite(h, o, "+998901000004", "courier").expect(201);
  });

  it("parallel takliflar limitdan oshmaydi", async () => {
    const o = await makeOwner(h, OWNER);
    const rs = await Promise.all(["+998901000011", "+998901000012", "+998901000013", "+998901000014", "+998901000015"].map((p) => invite(h, o, p, "picker")));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(2);
    expect(rs.filter((r) => r.status === 403)).toHaveLength(3);
  });

  it("muddati o'tgan taklif limitni band qilmaydi", async () => {
    const o = await makeOwner(h, OWNER);
    await invite(h, o, "+998901000002", "picker").expect(201);
    await invite(h, o, "+998901000003", "cashier").expect(201);
    h.clock.advance(73 * 3600 * 1000);
    const o2 = await renew(h, o);
    await invite(h, o2, "+998901000004", "courier").expect(201);
  });

  it("filial limiti: Start — 1 filial", async () => {
    const o = await makeOwner(h, OWNER);
    await call(h, "post", "/v1/branches", { token: o.token, tenant: o.tenantId, body: { name: "Markaz", address: "Chilonzor 5", lat: 41.28, lng: 69.2 } }).expect(201);
    const r = await call(h, "post", "/v1/branches", { token: o.token, tenant: o.tenantId, body: { name: "Ikkinchi", address: "Yunusobod 3" } }).expect(403);
    expect(r.body).toMatchObject({ code: "plan.limit_reached", details: { resource: "branches", limit: 1 } });
    const list = await call(h, "get", "/v1/branches", { token: o.token, tenant: o.tenantId }).expect(200);
    expect(list.body.items).toHaveLength(1);
  });
});

describe("T-6: rol o'zgarishi darhol kuchga kiradi", () => {
  it("menejer -> yig'uvchi: keyingi so'rovda ruxsat yo'qoladi, audit yozuvi bor", async () => {
    const o = await makeOwner(h, OWNER);
    const mgr = await addStaff(h, o, "+998901000002", "manager");
    await call(h, "get", "/v1/members", { token: mgr.token, tenant: o.tenantId }).expect(200); // manager: team:read
    const list = await call(h, "get", "/v1/members", { token: o.token, tenant: o.tenantId }).expect(200);
    const mid = list.body.items.find((m: { role: string }) => m.role === "manager").id;
    const r = await call(h, "patch", `/v1/members/${mid}`, { token: o.token, tenant: o.tenantId, body: { role: "picker" } }).expect(200);
    expect(r.body.role).toBe("picker");
    const denied = await call(h, "get", "/v1/members", { token: mgr.token, tenant: o.tenantId }).expect(403); // eski token, yangi ruxsat
    expect(denied.body).toMatchObject({ code: "permission.denied", details: { required: "team:read" } });
    const audit = (await h.admin.query("select before, after, actor_id from audit_log where action = 'member.updated'")).rows;
    expect(audit).toEqual([{ before: { role: "manager", status: "active" }, after: { role: "picker", status: "active" }, actor_id: o.userId }]);
  });

  it("oxirgi egasini o'zgartirib bo'lmaydi; egalik berish S0 doirasida emas", async () => {
    const o = await makeOwner(h, OWNER);
    const list = await call(h, "get", "/v1/members", { token: o.token, tenant: o.tenantId }).expect(200);
    const me = list.body.items[0].id;
    const r = await call(h, "patch", `/v1/members/${me}`, { token: o.token, tenant: o.tenantId, body: { role: "manager" } }).expect(409);
    expect(r.body.code).toBe("member.last_owner");
    await call(h, "patch", `/v1/members/${me}`, { token: o.token, tenant: o.tenantId, body: { status: "suspended" } }).expect(409);
    const s = await addStaff(h, o, "+998901000002", "manager");
    const mid = (await call(h, "get", "/v1/members", { token: o.token, tenant: o.tenantId })).body.items.find((m: { role: string }) => m.role === "manager").id;
    await call(h, "patch", `/v1/members/${mid}`, { token: o.token, tenant: o.tenantId, body: { role: "owner" } }).expect(400);
    expect(s.userId).toBeTruthy();
  });

  it("boshqa do'kon a'zosini o'zgartirish — 404", async () => {
    const a = await makeOwner(h, OWNER, "111111111", "A do'kon");
    const b = await makeOwner(h, "+998901000009", "222222222", "B do'kon");
    const bm = (await call(h, "get", "/v1/members", { token: b.token, tenant: b.tenantId })).body.items[0].id;
    await call(h, "patch", `/v1/members/${bm}`, { token: a.token, tenant: a.tenantId, body: { role: "picker" } }).expect(404);
  });

  it("a'zolar ro'yxati kursor bilan sahifalanadi; telefon maskalangan", async () => {
    const o = await makeOwner(h, OWNER);
    const biz = await makeAdmin(h);
    await call(h, "post", `/v1/admin/tenants/${o.tenantId}/plan`, { token: biz.token, body: { plan_code: "pro" } }).expect(200);
    for (let i = 0; i < 4; i++) await addStaff(h, o, `+99890100010${i}`, "picker");
    const p1 = await call(h, "get", "/v1/members?limit=2", { token: o.token, tenant: o.tenantId }).expect(200);
    expect(p1.body.items).toHaveLength(2);
    expect(p1.body.next_cursor).toBeTruthy();
    const p2 = await call(h, "get", `/v1/members?limit=2&cursor=${p1.body.next_cursor}`, { token: o.token, tenant: o.tenantId }).expect(200);
    const p3 = await call(h, "get", `/v1/members?limit=2&cursor=${p2.body.next_cursor}`, { token: o.token, tenant: o.tenantId }).expect(200);
    const ids = [...p1.body.items, ...p2.body.items, ...p3.body.items].map((m: { id: string }) => m.id);
    expect(new Set(ids).size).toBe(5);
    expect(p3.body.next_cursor).toBeNull();
    expect(p1.body.limit).toEqual({ used: 5, max: 30 });
    expect(JSON.stringify(p1.body)).not.toMatch(/\+998901/);
    await call(h, "get", "/v1/members?cursor=%%%", { token: o.token, tenant: o.tenantId }).expect(400);
  });
});

describe("RBAC va umumiy qoidalar", () => {
  it("yig'uvchi a'zolar ro'yxatini ko'ra olmaydi, taklif yubora olmaydi", async () => {
    const o = await makeOwner(h, OWNER);
    const p = await addStaff(h, o, "+998901000002", "picker");
    await call(h, "get", "/v1/members", { token: p.token, tenant: o.tenantId }).expect(403);
    await call(h, "post", "/v1/invites", { token: p.token, tenant: o.tenantId, body: { phone: "+998901000009", role: "picker" } }).expect(403);
    await call(h, "post", "/v1/branches", { token: p.token, tenant: o.tenantId, body: { name: "Filial", address: "Manzil" } }).expect(403);
    await call(h, "get", "/v1/features", { token: p.token, tenant: o.tenantId }).expect(200); // funksiyalar ro'yxatini barcha a'zolar ko'radi
  });

  it("menejer a'zolarni ko'radi, lekin o'zgartira olmaydi", async () => {
    const o = await makeOwner(h, OWNER);
    const m = await addStaff(h, o, "+998901000002", "manager");
    const list = await call(h, "get", "/v1/members", { token: m.token, tenant: o.tenantId }).expect(200);
    await call(h, "patch", `/v1/members/${list.body.items[0].id}`, { token: m.token, tenant: o.tenantId, body: { role: "picker" } }).expect(403);
  });

  it("buxgalter (2FA majburiy) TOTP'siz kira olmaydi", async () => {
    const o = await makeOwner(h, OWNER);
    const acc = await addStaff(h, o, "+998901000002", "accountant");
    const r = await call(h, "get", "/v1/members", { token: acc.token, tenant: o.tenantId }).expect(403);
    expect(r.body.code).toBe("auth.mfa_required");
  });

  it("Idempotency-Key majburiy; takroriy so'rov bitta natija beradi; boshqa tana bilan — 422", async () => {
    const s = await signUp(h, OWNER);
    const body = { name: "Do'kon A", tin: "123456789" };
    await call(h, "post", "/v1/tenants", { token: s.token, body, key: null }).expect(400).then((r) => expect(r.body.code).toBe("idempotency.key_required"));
    const key = idem();
    const r1 = await call(h, "post", "/v1/tenants", { token: s.token, body, key }).expect(201);
    const r2 = await call(h, "post", "/v1/tenants", { token: s.token, body, key }).expect(201);
    expect(r2.body).toEqual(r1.body);
    expect(r2.headers["idempotent-replayed"]).toBe("true");
    expect((await h.admin.query("select count(*)::int as n from tenants")).rows[0].n).toBe(1);
    await call(h, "post", "/v1/tenants", { token: s.token, body: { ...body, name: "Boshqa" }, key }).expect(422).then((r) => expect(r.body.code).toBe("idempotency.key_reused"));
  });

  it("xato bo'lganda kalit saqlanmaydi — tuzatib qayta yuborish mumkin", async () => {
    const s = await signUp(h, OWNER);
    const key = idem();
    await call(h, "post", "/v1/tenants", { token: s.token, body: { name: "Do'kon", tin: "bad" }, key }).expect(400);
    await call(h, "post", "/v1/tenants", { token: s.token, body: { name: "Do'kon", tin: "123456789" }, key }).expect(201); // kalit xatoda bo'shatilgan
    await call(h, "post", "/v1/tenants", { token: s.token, body: { name: "Do'kon", tin: "123456789" }, key }).expect(201).then((r) => expect(r.headers["idempotent-replayed"]).toBe("true"));
  });

  it("parallel bir xil Idempotency-Key — bitta do'kon", async () => {
    const s = await signUp(h, OWNER);
    const key = idem();
    const rs = await Promise.all([1, 2, 3].map(() => call(h, "post", "/v1/tenants", { token: s.token, body: { name: "Do'kon", tin: "123456789" }, key })));
    expect(rs.every((r) => [201, 409].includes(r.status))).toBe(true);
    expect(rs.some((r) => r.status === 201)).toBe(true);
    expect((await h.admin.query("select count(*)::int as n from tenants")).rows[0].n).toBe(1);
  });

  it("xato javoblari ikki tilda: Accept-Language ishlatilmaydi, ikkalasi ham qaytadi", async () => {
    const r = await call(h, "get", "/v1/me").expect(401);
    expect(Object.keys(r.body).sort()).toEqual(["code", "details", "message_ru", "message_uz"]);
    expect(r.body.message_ru).toMatch(/[а-я]/i);
    const nf = await call(h, "get", "/v1/nonexistent").expect(404);
    expect(nf.body.code).toBe("not_found");
    const bad = await h.http.post("/v1/auth/otp/request").set("Content-Type", "application/json").send("{broken").expect(400);
    expect(bad.body.code).toBe("validation.failed");
  });

  it("X-Request-Id qaytariladi", async () => {
    const r = await call(h, "get", "/v1/me", { headers: { "X-Request-Id": "req-12345678" } });
    expect(r.headers["x-request-id"]).toBe("req-12345678");
  });
});
