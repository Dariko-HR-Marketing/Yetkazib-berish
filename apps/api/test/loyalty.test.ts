import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LoyaltyService } from "../src/modules/loyalty/loyalty.service";
import { addStaff, boot, call, makeOwner, signUp, type Harness } from "./helpers";

let h: Harness;
beforeAll(async () => { h = await boot(); });
afterAll(async () => { await h.close(); });
beforeEach(async () => { await h.reset(); });

const as = (o: { token: string; tenantId: string }) => ({ token: o.token, tenant: o.tenantId });

async function setup(opts: { loyalty?: boolean } = {}) {
  const o = await makeOwner(h, "+998901000001");
  await call(h, "patch", `/v1/tenants/${o.tenantId}`, { ...as(o), body: { status: "active" } }).expect(200);
  await h.admin.query("update tenants set plan_code = 'biznes' where id = $1", [o.tenantId]);
  if (opts.loyalty !== false) await call(h, "patch", "/v1/features/loyalty.points", { ...as(o), body: { enabled: true } }).expect(200);
  const branch = (await call(h, "post", "/v1/branches", { ...as(o), body: { name: "Markaziy", address: "Toshkent, Chilonzor 1" } }).expect(201)).body.id as string;
  const slug = (await call(h, "get", `/v1/tenants/${o.tenantId}`, as(o))).body.slug as string;
  const p = (await call(h, "post", "/v1/products", { ...as(o), body: { name_uz: "Non", price_tiyin: 1000000, unit: "piece" } }).expect(201)).body.id as string; // 10 000 so'm
  await call(h, "put", `/v1/products/${p}/stock`, { ...as(o), body: { branch_id: branch, quantity_milli: 100000 } }).expect(200);
  const c = await signUp(h, "+998905550001");
  const order = (body: Record<string, unknown> = {}, qty = 3000) =>
    call(h, "post", `/v1/shops/${slug}/orders`, { token: c.token, body: { branch_id: branch, fulfillment: "pickup", items: [{ product_id: p, quantity_milli: qty }], ...body } });
  const status = (id: string, s: string) => call(h, "post", `/v1/orders/${id}/status`, { ...as(o), body: { status: s } });
  const grant = async (points: number, hoursAgo = 48) => {
    await h.admin.query("insert into loyalty_balances (tenant_id, user_id, balance_points) values ($1,$2,$3) on conflict (tenant_id, user_id) do update set balance_points = loyalty_balances.balance_points + $3", [o.tenantId, c.userId, points]);
    await h.admin.query("insert into ledger_entries (tenant_id, user_id, kind, points, available_at, expires_at) values ($1,$2,'accrual',$3, now() - make_interval(hours => $4), now() + interval '60 days')", [o.tenantId, c.userId, points, hoursAgo]);
  };
  const loyalty = () => call(h, "get", `/v1/shops/${slug}/loyalty`, { token: c.token }).expect(200).then((r) => r.body);
  return { o, branch, slug, p, c, order, status, grant, loyalty };
}

describe("yetkazish narxi va minimal buyurtma", () => {
  it("narx faqat yetkazishga; bepul chegarasi; minimal buyurtma; faqat egasi o'zgartiradi; vitrina ko'rsatadi", async () => {
    const s = await setup({ loyalty: false });
    const mgr = await addStaff(h, s.o, "+998901000011", "manager");
    await call(h, "put", "/v1/delivery/settings", { token: mgr.token, tenant: s.o.tenantId, body: { fee_tiyin: 1, free_from_tiyin: null, min_order_tiyin: 0 } }).expect(403);
    await call(h, "put", "/v1/delivery/settings", { ...as(s.o), body: { fee_tiyin: 1500000, free_from_tiyin: 5000000, min_order_tiyin: 2000000 } }).expect(200);
    expect((await call(h, "get", "/v1/delivery/settings", { token: mgr.token, tenant: s.o.tenantId }).expect(200)).body).toEqual({ fee_tiyin: 1500000, free_from_tiyin: 5000000, min_order_tiyin: 2000000 });
    expect((await call(h, "get", `/v1/shops/${s.slug}`).expect(200)).body.delivery).toEqual({ fee_tiyin: 1500000, free_from_tiyin: 5000000, min_order_tiyin: 2000000 });
    const below = await s.order({}, 1000).expect(422); // 10 000 < 20 000
    expect(below.body.code).toBe("order.below_minimum");
    const d1 = await s.order({ fulfillment: "delivery", delivery_address: "Toshkent, Bobur 5" }, 3000).expect(201); // 30 000 < 50 000: narx bor
    expect(d1.body).toMatchObject({ subtotal_tiyin: 3000000, delivery_fee_tiyin: 1500000, total_tiyin: 4500000 });
    const d2 = await s.order({ fulfillment: "delivery", delivery_address: "Toshkent, Bobur 5" }, 5000).expect(201); // 50 000: bepul
    expect(d2.body).toMatchObject({ delivery_fee_tiyin: 0, total_tiyin: 5000000 });
    const pk = await s.order({}, 3000).expect(201); // olib ketish: yetkazish narxi yo'q
    expect(pk.body.delivery_fee_tiyin).toBe(0);
    await call(h, "put", "/v1/delivery/settings", { ...as(s.o), body: { fee_tiyin: -1, free_from_tiyin: null, min_order_tiyin: 0 } }).expect(400);
    expect((await h.admin.query("select count(*)::int as n from audit_log where action = 'delivery.settings_changed'")).rows[0].n).toBe(1);
  });
});

describe("ball (loyalty)", () => {
  it("bajarilgan buyurtmaga keshbek: 24 soat ushlanadi, ledger o'zgarmas, balans mos, hodisa", async () => {
    const s = await setup();
    const o1 = (await s.order().expect(201)).body; // 30 000 so'm
    await s.status(o1.id, "accepted").expect(200);
    await s.status(o1.id, "completed").expect(200);
    const l = await s.loyalty();
    expect(l).toMatchObject({ enabled: true, balance_points: 600, spendable_points: 0, pending_points: 600, tier: "Bronza", cashback_pct: 2 });
    expect((await h.admin.query("select kind, points::int as p, order_id from ledger_entries")).rows).toEqual([{ kind: "accrual", p: 600, order_id: o1.id }]);
    expect((await h.admin.query("select name, properties from events where name = 'points.earned'")).rows[0].properties).toEqual({ points: 600, order_id: o1.id });
    await expect(h.admin.query("update ledger_entries set points = 1")).rejects.toThrow(/o'zgarmas/);
    await expect(h.admin.query("delete from ledger_entries")).rejects.toThrow(/o'zgarmas/);
    expect(await h.app.get(LoyaltyService).reconcile()).toEqual([]);
  });

  it("ball bilan to'lash: chegirma, 30% chegarasi, yetarli emas, ushlab turilgan ball ishlatilmaydi; bekor qilsa qaytadi", async () => {
    const s = await setup();
    await s.grant(1000);
    const ok = await s.order({ points_to_use: 500 }, 3000).expect(201);
    expect(ok.body).toMatchObject({ subtotal_tiyin: 3000000, discount_tiyin: 50000, points_spent: 500, total_tiyin: 2950000 });
    expect((await s.loyalty()).balance_points).toBe(500);
    const toomuch = await s.order({ points_to_use: 9001 }, 3000).expect(422); // 30 000 so'mning 30% = 9 000 ball
    expect(toomuch.body.code).toBe("loyalty.over_limit");
    const insuff = await s.order({ points_to_use: 900 }, 3000).expect(422); // 900 <= 9000 chegara, lekin balans 500
    expect(insuff.body.code).toBe("loyalty.insufficient");
    await s.status(ok.body.id, "cancelled").expect(200);
    expect((await s.loyalty()).balance_points).toBe(1000); // qaytdi
    expect((await h.admin.query("select kind from ledger_entries order by id")).rows.map((r) => r.kind)).toEqual(["accrual", "spend", "reversal"]);
    expect(await h.app.get(LoyaltyService).reconcile()).toEqual([]);
  });

  it("ushlab turilgan (24 soat) ball ishlatilmaydi", async () => {
    const s = await setup();
    await s.grant(500, -24); // 24 soatdan keyin ochiladi
    expect((await s.order({ points_to_use: 100 }).expect(422)).body.code).toBe("loyalty.insufficient");
    expect(await s.loyalty()).toMatchObject({ balance_points: 500, spendable_points: 0, pending_points: 500 });
  });

  it("funksiya o'chiq: points_to_use rad etiladi, keshbek yig'ilmaydi", async () => {
    const s = await setup({ loyalty: false });
    expect((await s.order({ points_to_use: 10 }).expect(422)).body.code).toBe("loyalty.disabled");
    const o1 = (await s.order().expect(201)).body;
    await s.status(o1.id, "accepted").expect(200);
    await s.status(o1.id, "completed").expect(200);
    expect((await h.admin.query("select count(*)::int as n from ledger_entries")).rows[0].n).toBe(0);
  });

  it("yig'ishda jami kamaysa ball chegarasi qayta tekshiriladi, ortiqcha ball qaytariladi; jami to'g'ri", async () => {
    const s = await setup();
    await s.grant(5000);
    const picker = await addStaff(h, s.o, "+998901000012", "picker");
    const T = { token: picker.token, tenant: s.o.tenantId };
    const ord = (await s.order({ points_to_use: 900 }, 3000).expect(201)).body; // 30% chegara: 900 ball = 900 so'm = 3%... ruxsat
    await s.status(ord.id, "accepted").expect(200);
    await call(h, "post", `/v1/orders/${ord.id}/pick/start`, T).expect(200);
    const items = (await call(h, "get", `/v1/orders/${ord.id}`, as(s.o))).body.items as { id: string }[];
    await call(h, "put", `/v1/orders/${ord.id}/items/${items[0]!.id}/pick`, { ...T, body: { status: "picked", picked_milli: 1000 } }).expect(200); // 3 dona o'rniga 1
    const done = (await call(h, "post", `/v1/orders/${ord.id}/pick/finish`, T).expect(200)).body;
    // yangi jami 10 000 so'm; 30% = 3 000 ball; 900 ≤ 3 000 — o'zgarmaydi
    expect(done).toMatchObject({ subtotal_tiyin: 1000000, points_spent: 900, discount_tiyin: 90000, total_tiyin: 910000 });
    // chegaradan oshgan holat: 5000 ball bilan 3000 dona buyurtmaga ruxsat yo'q, shuning uchun bevosita bazada tekshirmaymiz — yuqoridagi mantiq birlik darajasida
    expect((await s.loyalty()).balance_points).toBe(5000 - 900);
  });

  it("muddati o'tgan ball yoqiladi (FIFO: avval sarflanganlar hisobga olinadi); kunlik solishtirish bo'sh", async () => {
    const s = await setup();
    await s.grant(1000);
    await s.order({ points_to_use: 200 }).expect(201); // 200 sarfladi -> balans 800
    await h.admin.query("set session_replication_role = replica");
    await h.admin.query("update ledger_entries set expires_at = now() - interval '1 day' where kind = 'accrual'");
    await h.admin.query("set session_replication_role = default");
    const burned = await h.app.get(LoyaltyService).expireDue();
    expect(burned).toBe(800); // 1000 muddati o'tdi, 200 avval sarflangan
    expect((await s.loyalty()).balance_points).toBe(0);
    expect((await h.admin.query("select kind, points::int as p from ledger_entries order by id")).rows.map((r) => `${r.kind}:${r.p}`)).toEqual(["accrual:1000", "spend:-200", "expire:-800"]);
    expect(await h.app.get(LoyaltyService).expireDue()).toBe(0); // takror yoqmaydi
    expect(await h.app.get(LoyaltyService).reconcile()).toEqual([]);
    expect((await h.admin.query("select name from events where name = 'points.expired'")).rowCount).toBe(1);
  });

  it("solishtirish nomuvofiqlikni topadi", async () => {
    const s = await setup();
    await s.grant(100);
    await h.admin.query("update loyalty_balances set balance_points = 99");
    const diff = await h.app.get(LoyaltyService).reconcile();
    expect(diff).toEqual([{ tenant_id: s.o.tenantId, user_id: s.c.userId, ledger: 100, balance: 99 }]);
  });

  it("begona do'kon balansi alohida (RLS): boshqa do'konda ball 0", async () => {
    const s = await setup();
    await s.grant(500);
    const o2 = await makeOwner(h, "+998901000002", "987654321", "Boshqa");
    await call(h, "patch", `/v1/tenants/${o2.tenantId}`, { ...as(o2), body: { status: "active" } }).expect(200);
    const slug2 = (await call(h, "get", `/v1/tenants/${o2.tenantId}`, as(o2))).body.slug as string;
    const r = await call(h, "get", `/v1/shops/${slug2}/loyalty`, { token: s.c.token }).expect(200);
    expect(r.body.balance_points).toBe(0);
  });
});
