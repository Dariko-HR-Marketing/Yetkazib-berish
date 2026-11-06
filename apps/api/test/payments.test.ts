import { createHmac } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PaymentFlowService } from "../src/modules/orders/payment-flow.service";
import { addStaff, boot, call, makeOwner, signUp, type Harness } from "./helpers";

let h: Harness;
beforeAll(async () => { h = await boot(); });
afterAll(async () => { await h.close(); });
beforeEach(async () => { await h.reset(); });

const SECRET = "test-webhook-secret-123";
const as = (o: { token: string; tenantId: string }) => ({ token: o.token, tenant: o.tenantId });

async function setup(opts: { online?: boolean } = {}) {
  const o = await makeOwner(h, "+998901000001");
  await call(h, "patch", `/v1/tenants/${o.tenantId}`, { ...as(o), body: { status: "active" } }).expect(200);
  const branch = (await call(h, "post", "/v1/branches", { ...as(o), body: { name: "Markaziy", address: "Toshkent, Chilonzor 1" } }).expect(201)).body.id as string;
  const slug = (await call(h, "get", `/v1/tenants/${o.tenantId}`, as(o))).body.slug as string;
  const p = (await call(h, "post", "/v1/products", { ...as(o), body: { name_uz: "Non", price_tiyin: 1000000, unit: "piece" } }).expect(201)).body.id as string;
  await call(h, "put", `/v1/products/${p}/stock`, { ...as(o), body: { branch_id: branch, quantity_milli: 1000000 } }).expect(200);
  if (opts.online !== false) await call(h, "put", "/v1/payments/settings", { ...as(o), body: { provider: "mock", merchant_id: "M-1", secret: SECRET, enabled: true } }).expect(200);
  const c = await signUp(h, "+998905550001");
  const order = (qty = 2000, extra: Record<string, unknown> = {}) => call(h, "post", `/v1/shops/${slug}/orders`, { token: c.token, body: { branch_id: branch, fulfillment: "pickup", payment_type: "online", items: [{ product_id: p, quantity_milli: qty }], ...extra } });
  const hook = (payload: Record<string, unknown>, secret = SECRET, tamper = false) => {
    const raw = JSON.stringify(payload);
    const sig = createHmac("sha256", secret).update(tamper ? raw + " " : raw).digest("hex");
    return h.http.post(`/v1/webhooks/mock/${slug}`).set("Content-Type", "application/json").set("x-signature", sig).send(raw);
  };
  const ev = (paymentId: string, type: string, amount: number, id = `e-${Math.random()}`) => ({ event_id: id, payment_id: paymentId, type, amount_tiyin: amount });
  const stock = async () => (await h.admin.query("select quantity_milli::int as q, reserved_milli::int as r from stock where product_id = $1", [p])).rows[0] as { q: number; r: number };
  return { o, branch, slug, p, c, order, hook, ev, stock };
}

describe("onlayn to'lov sozlamalari", () => {
  it("faqat egasi sozlaydi; kalit qaytmaydi (shifrlangan); ulanmagan provayder rad etiladi; kalitsiz yoqib bo'lmaydi; audit", async () => {
    const s = await setup({ online: false });
    const mgr = await addStaff(h, s.o, "+998901000011", "manager");
    await call(h, "put", "/v1/payments/settings", { token: mgr.token, tenant: s.o.tenantId, body: { provider: "mock", secret: SECRET, enabled: true } }).expect(403);
    expect((await call(h, "put", "/v1/payments/settings", { ...as(s.o), body: { provider: "payme", secret: SECRET, enabled: true } }).expect(422)).body.code).toBe("payment.provider_not_available");
    expect((await call(h, "put", "/v1/payments/settings", { ...as(s.o), body: { provider: "mock", enabled: true } }).expect(422)).body.code).toBe("payment.secret_required");
    const ok = await call(h, "put", "/v1/payments/settings", { ...as(s.o), body: { provider: "mock", merchant_id: "M-1", secret: SECRET, enabled: true } }).expect(200);
    expect(ok.body).toMatchObject({ provider: "mock", enabled: true, has_secret: true, available_providers: ["mock"] });
    expect(JSON.stringify(ok.body)).not.toContain(SECRET);
    expect((await h.admin.query("select secret_enc from tenant_payment_settings")).rows[0].secret_enc).not.toContain(SECRET);
    await call(h, "get", "/v1/payments/settings", { token: mgr.token, tenant: s.o.tenantId }).expect(403); // menejerda integratsiya huquqi yo'q
    const a = (await h.admin.query("select after from audit_log where action = 'payment.settings_changed' order by id desc limit 1")).rows[0].after;
    expect(JSON.stringify(a)).not.toContain(SECRET);
  });
});

describe("onlayn to'lov oqimi", () => {
  it("sozlanmagan do'konda onlayn buyurtma rad etiladi; naqd ishlayveradi", async () => {
    const s = await setup({ online: false });
    expect((await s.order().expect(422)).body.code).toBe("payment.online_unavailable");
    await s.order(2000, { payment_type: "cash" }).expect(201);
  });

  it("buyurtma -> to'lov kutilmoqda; qabul qilib bo'lmaydi; webhook captured -> qabul; takror webhook xavfsiz; hodisalar PII'siz", async () => {
    const s = await setup();
    const o = (await s.order().expect(201)).body;
    expect(o.payment).toMatchObject({ provider: "mock", status: "pending", amount_tiyin: 2000000, pay_url: expect.stringContaining(`/d/${s.slug}/tolov/`) });
    expect((await call(h, "post", `/v1/orders/${o.id}/status`, { ...as(s.o), body: { status: "accepted" } }).expect(409)).body.code).toBe("order.payment_pending");
    const e = s.ev(o.payment.id, "captured", 2000000, "evt-1");
    expect((await s.hook(e).expect(200)).body).toEqual({ ok: true });
    expect((await s.hook(e).expect(200)).body).toEqual({ ok: true, duplicate: true }); // takror
    expect((await h.admin.query("select count(*)::int as n from events where name = 'payment.captured'")).rows[0].n).toBe(1);
    await call(h, "post", `/v1/orders/${o.id}/status`, { ...as(s.o), body: { status: "accepted" } }).expect(200);
    const view = (await call(h, "get", `/v1/shops/${s.slug}/orders/${o.id}`, { token: s.c.token }).expect(200)).body;
    expect(view.payment).toMatchObject({ status: "captured", pay_url: null });
    expect(JSON.stringify((await h.admin.query("select properties from events where name like 'payment.%'")).rows)).not.toMatch(/9055|\+998/);
    expect((await h.admin.query("select outcome from payment_webhook_events order by id")).rows.map((r) => r.outcome)).toEqual(["captured"]);
  });

  it("imzo xato/boshqa kalit/buzilgan tana — 401; noma'lum to'lov 404; summa mos kelmasa 422; noto'g'ri JSON 400", async () => {
    const s = await setup();
    const o = (await s.order().expect(201)).body;
    const e = s.ev(o.payment.id, "captured", 2000000);
    await s.hook(e, "boshqa-kalit-123").expect(401);
    await s.hook(e, SECRET, true).expect(401);
    await h.http.post(`/v1/webhooks/mock/${s.slug}`).set("Content-Type", "application/json").send(JSON.stringify(e)).expect(401); // imzosiz
    await s.hook(s.ev("00000000-0000-4000-8000-000000000000", "captured", 100)).expect(404);
    expect((await s.hook(s.ev(o.payment.id, "captured", 1999999)).expect(422)).body.code).toBe("payment.amount_mismatch");
    await h.http.post(`/v1/webhooks/mock/${s.slug}`).set("Content-Type", "application/json").set("x-signature", createHmac("sha256", SECRET).update("{bad").digest("hex")).send("{bad").expect(400);
    await h.http.post(`/v1/webhooks/payme/${s.slug}`).send({}).expect(404); // ulanmagan provayder
    await h.http.post("/v1/webhooks/mock/yoq-do-kon").send({}).expect(404);
    expect((await call(h, "get", `/v1/shops/${s.slug}/orders/${o.id}`, { token: s.c.token })).body.payment.status).toBe("pending"); // hech narsa o'zgarmadi
  });

  it("to'lov muvaffaqiyatsiz -> buyurtma bekor, band bo'shaydi; keyin kelgan 'captured' avtomatik to'liq qaytariladi", async () => {
    const s = await setup();
    const o = (await s.order(3000).expect(201)).body;
    expect((await s.stock()).r).toBe(3000);
    await s.hook(s.ev(o.payment.id, "failed", 3000000, "f-1")).expect(200);
    expect((await call(h, "get", `/v1/orders/${o.id}`, as(s.o))).body).toMatchObject({ status: "cancelled", payment: { status: "failed" } });
    expect((await s.stock()).r).toBe(0);
    const late = await s.hook(s.ev(o.payment.id, "captured", 3000000, "late-1")).expect(200);
    expect(late.body).toEqual({ ok: true, refunded: true });
    expect((await h.admin.query("select status, refunded_tiyin::int as r from payments")).rows[0]).toEqual({ status: "captured", r: 3000000 });
    expect((await h.admin.query("select count(*)::int as n from events where name = 'payment.refunded'")).rows[0].n).toBe(1);
  });

  it("to'langan buyurtmani bekor qilish to'liq qaytaradi; qisman qaytarish: ruxsat va chegara", async () => {
    const s = await setup();
    const o1 = (await s.order().expect(201)).body;
    await s.hook(s.ev(o1.payment.id, "captured", 2000000)).expect(200);
    await call(h, "post", `/v1/shops/${s.slug}/orders/${o1.id}/cancel`, { token: s.c.token, body: {} }).expect(200);
    expect((await h.admin.query("select refunded_tiyin::int as r from payments where order_id = $1", [o1.id])).rows[0].r).toBe(2000000);
    const o2 = (await s.order().expect(201)).body;
    await s.hook(s.ev(o2.payment.id, "captured", 2000000)).expect(200);
    const cashier = await addStaff(h, s.o, "+998901000012", "cashier");
    await call(h, "post", `/v1/orders/${o2.id}/refund`, { token: cashier.token, tenant: s.o.tenantId, body: { amount_tiyin: 100, reason: "test" } }).expect(403);
    const part = await call(h, "post", `/v1/orders/${o2.id}/refund`, { ...as(s.o), body: { amount_tiyin: 500000, reason: "sifat muammosi" } }).expect(200);
    expect(part.body.refunded_tiyin).toBe(500000);
    expect((await call(h, "post", `/v1/orders/${o2.id}/refund`, { ...as(s.o), body: { amount_tiyin: 1500001, reason: "ko'p" } }).expect(422)).body.code).toBe("payment.refund_exceeds");
    await call(h, "post", `/v1/orders/${o2.id}/refund`, { ...as(s.o), body: { reason: "qolgani" } }).expect(200);
    expect((await h.admin.query("select refunded_tiyin::int as r, amount_tiyin::int as a from payments where order_id = $1", [o2.id])).rows[0]).toEqual({ r: 2000000, a: 2000000 });
    await call(h, "post", `/v1/orders/${o2.id}/refund`, { ...as(s.o), body: { reason: "yana" } }).expect(422);
  });

  it("sandbox: xaridor o'z to'lovini to'laydi/rad etadi; begona foydalanuvchi — 404", async () => {
    const s = await setup();
    const o = (await s.order().expect(201)).body;
    const stranger = await signUp(h, "+998905550002");
    await call(h, "post", `/v1/shops/${s.slug}/payments/${o.payment.id}/sandbox`, { token: stranger.token, body: { outcome: "captured" } }).expect(404);
    await call(h, "post", `/v1/shops/${s.slug}/payments/${o.payment.id}/sandbox`, { token: s.c.token, body: { outcome: "captured" } }).expect(200);
    expect((await call(h, "get", `/v1/shops/${s.slug}/orders/${o.id}`, { token: s.c.token })).body.payment.status).toBe("captured");
    const o2 = (await s.order().expect(201)).body;
    await call(h, "post", `/v1/shops/${s.slug}/payments/${o2.payment.id}/sandbox`, { token: s.c.token, body: { outcome: "failed" } }).expect(200);
    expect((await call(h, "get", `/v1/shops/${s.slug}/orders/${o2.id}`, { token: s.c.token })).body.status).toBe("cancelled");
  });

  it("muddati o'tgan to'lov bekor bo'ladi va buyurtma bekor qilinadi", async () => {
    const s = await setup();
    const o = (await s.order().expect(201)).body;
    await h.admin.query("update payments set expires_at = now() - interval '1 minute'");
    expect(await h.app.get(PaymentFlowService).expireStale()).toBe(1);
    expect((await call(h, "get", `/v1/orders/${o.id}`, as(s.o))).body).toMatchObject({ status: "cancelled", payment: { status: "failed", failure_reason: "expired" } });
    expect((await s.stock()).r).toBe(0);
  });

  it("S3 mezoni: 50 ta to'lov va 10 ta qaytarish xatosiz; idempotentlik; begona do'kon izolyatsiyasi", async () => {
    const s = await setup();
    const ids: { id: string; pid: string }[] = [];
    for (let i = 0; i < 50; i++) { const r = (await s.order(1000).expect(201)).body; ids.push({ id: r.id, pid: r.payment.id }); }
    await Promise.all(ids.map((x, i) => s.hook(s.ev(x.pid, "captured", 1000000, `bulk-${i}`)).expect(200)));
    await Promise.all(ids.slice(0, 5).map((x, i) => s.hook(s.ev(x.pid, "captured", 1000000, `bulk-${i}`)).expect(200))); // takror
    expect((await h.admin.query("select count(*)::int as n from payments where status = 'captured'")).rows[0].n).toBe(50);
    expect((await h.admin.query("select count(*)::int as n from events where name = 'payment.captured'")).rows[0].n).toBe(50);
    for (const x of ids.slice(0, 10)) await call(h, "post", `/v1/orders/${x.id}/refund`, { ...as(s.o), body: { amount_tiyin: 250000, reason: "qisman" } }).expect(200);
    expect((await h.admin.query("select count(*)::int as n from events where name = 'payment.refunded'")).rows[0].n).toBe(10);
    // begona do'kon o'z kaliti bilan bizning to'lovni o'zgartira olmaydi
    const o2 = await makeOwner(h, "+998901000002", "987654321", "Boshqa");
    await call(h, "patch", `/v1/tenants/${o2.tenantId}`, { ...as(o2), body: { status: "active" } }).expect(200);
    await call(h, "put", "/v1/payments/settings", { ...as(o2), body: { provider: "mock", secret: "boshqa-kalit-1234", enabled: true } }).expect(200);
    const slug2 = (await call(h, "get", `/v1/tenants/${o2.tenantId}`, as(o2))).body.slug as string;
    const raw = JSON.stringify(s.ev(ids[20]!.pid, "failed", 1000000, "x-1"));
    await h.http.post(`/v1/webhooks/mock/${slug2}`).set("Content-Type", "application/json").set("x-signature", createHmac("sha256", "boshqa-kalit-1234").update(raw).digest("hex")).send(raw).expect(404);
    expect((await h.admin.query("select status from payments where id = $1", [ids[20]!.pid])).rows[0].status).toBe("captured");
  }, 60_000);
});
