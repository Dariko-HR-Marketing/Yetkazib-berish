import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addStaff, boot, call, makeOwner, signUp, type Harness } from "./helpers";

let h: Harness;
beforeAll(async () => { h = await boot(); });
afterAll(async () => { await h.close(); });
beforeEach(async () => { await h.reset(); });

const as = (o: { token: string; tenantId: string }) => ({ token: o.token, tenant: o.tenantId });

async function setup() {
  const o = await makeOwner(h, "+998901000001");
  await call(h, "patch", `/v1/tenants/${o.tenantId}`, { ...as(o), body: { status: "active" } }).expect(200);
  await h.admin.query("update tenants set plan_code = 'pro' where id = $1", [o.tenantId]);
  const branch = (await call(h, "post", "/v1/branches", { ...as(o), body: { name: "Markaziy", address: "Toshkent, Chilonzor 1" } }).expect(201)).body.id as string;
  const slug = (await call(h, "get", `/v1/tenants/${o.tenantId}`, as(o))).body.slug as string;
  const prod = async (price: number) => {
    const p = (await call(h, "post", "/v1/products", { ...as(o), body: { name_uz: `M${price}`, price_tiyin: price, unit: "piece" } }).expect(201)).body.id as string;
    await call(h, "put", `/v1/products/${p}/stock`, { ...as(o), body: { branch_id: branch, quantity_milli: 100000 } }).expect(200);
    return p;
  };
  const picker = await addStaff(h, o, "+998901000011", "picker");
  const dispatcher = await addStaff(h, o, "+998901000012", "dispatcher");
  const courier = await addStaff(h, o, "+998901000013", "courier");
  const cashier = await addStaff(h, o, "+998901000014", "cashier");
  const cid = (await h.admin.query("select id from users where phone = '+998901000013'")).rows[0].id as string;
  const customer = await signUp(h, "+998905550001");
  const T = (s: { token: string }) => ({ token: s.token, tenant: o.tenantId });
  /** Buyurtma: tayyor holatgacha. */
  const ready = async (p: string) => {
    const ord = (await call(h, "post", `/v1/shops/${slug}/orders`, { token: customer.token, body: { branch_id: branch, fulfillment: "delivery", delivery_address: "Toshkent, Bobur 5", items: [{ product_id: p, quantity_milli: 1000 }] } }).expect(201)).body;
    await call(h, "post", `/v1/orders/${ord.id}/status`, { ...as(o), body: { status: "accepted" } }).expect(200);
    await call(h, "post", `/v1/orders/${ord.id}/pick/start`, T(picker)).expect(200);
    const it = (await call(h, "get", `/v1/orders/${ord.id}`, as(o))).body.items[0].id as string;
    await call(h, "put", `/v1/orders/${ord.id}/items/${it}/pick`, { ...T(picker), body: { status: "picked" } }).expect(200);
    await call(h, "post", `/v1/orders/${ord.id}/pick/finish`, T(picker)).expect(200);
    return ord.id as string;
  };
  const deliver = async (orderId: string) => {
    await call(h, "post", `/v1/orders/${orderId}/assign`, { ...T(dispatcher), body: { courier_user_id: cid } }).expect(200);
    const d = (await call(h, "get", "/v1/courier/deliveries", T(courier))).body.items.find((x: { order: { id: string } }) => x.order.id === orderId).delivery_id as string;
    await call(h, "post", `/v1/courier/deliveries/${d}/pickup`, T(courier)).expect(200);
    await call(h, "post", `/v1/courier/deliveries/${d}/deliver`, T(courier)).expect(200);
  };
  return { o, prod, picker, dispatcher, courier, cashier, cid, T, ready, deliver };
}

describe("kuryer naqdi (kassa)", () => {
  it("yetkazishdan keyin kuryerda naqd; topshirish kamaytiradi; chegaradan ortiq topshirib bo'lmaydi; ruxsatlar; o'zgarmas jurnal; audit", async () => {
    const s = await setup();
    const p = await s.prod(5000000); // 50 000 so'm
    await s.deliver(await s.ready(p));
    const list = (await call(h, "get", "/v1/cash/couriers", s.T(s.cashier)).expect(200)).body;
    expect(list.limit_tiyin).toBe(150000000);
    expect(list.items).toEqual([{ user_id: s.cid, phone: "+998901000013", on_hand_tiyin: 5000000, over_limit: false, last_handover_at: null }]);
    expect((await call(h, "get", "/v1/courier/deliveries", s.T(s.courier))).body).toMatchObject({ cash_on_hand_tiyin: 5000000, cash_limit_tiyin: 150000000 });
    await call(h, "post", "/v1/cash/handover", { ...s.T(s.picker), body: { courier_user_id: s.cid, amount_tiyin: 1 } }).expect(403);
    await call(h, "post", "/v1/cash/handover", { ...s.T(s.courier), body: { courier_user_id: s.cid, amount_tiyin: 1 } }).expect(403);
    const part = await call(h, "post", "/v1/cash/handover", { ...s.T(s.cashier), body: { courier_user_id: s.cid, amount_tiyin: 2000000, note: "ertalabki" } }).expect(200);
    expect(part.body.on_hand_tiyin).toBe(3000000);
    expect((await call(h, "post", "/v1/cash/handover", { ...s.T(s.cashier), body: { courier_user_id: s.cid, amount_tiyin: 3000001 } }).expect(422)).body.code).toBe("cash.exceeds_on_hand");
    await call(h, "post", "/v1/cash/handover", { ...s.T(s.cashier), body: { courier_user_id: (await h.admin.query("select id from users where phone = '+998901000011'")).rows[0].id, amount_tiyin: 1 } }).expect(404); // kuryer emas
    await call(h, "post", "/v1/cash/handover", { ...as(s.o), body: { courier_user_id: s.cid, amount_tiyin: 3000000 } }).expect(200);
    expect((await call(h, "get", "/v1/cash/couriers", as(s.o))).body.items[0].on_hand_tiyin).toBe(0);
    await expect(h.admin.query("update cash_handovers set amount_tiyin = 1")).rejects.toThrow(/o'zgarmas/);
    expect((await h.admin.query("select count(*)::int as n from audit_log where action = 'cash.handover'")).rows[0].n).toBe(2);
  });

  it("naqd chegarasi (1 500 000 so'm): oshsa yangi buyurtma biriktirilmaydi; topshirgach biriktiriladi; parallel topshirish ortiqcha bermaydi", async () => {
    const s = await setup();
    const big = await s.prod(140000000); // 1 400 000 so'm
    await s.deliver(await s.ready(big));
    const second = await s.ready(big);
    const r = await call(h, "post", `/v1/orders/${second}/assign`, { ...s.T(s.dispatcher), body: { courier_user_id: s.cid } }).expect(422);
    expect(r.body.code).toBe("courier.cash_limit");
    await call(h, "post", "/v1/cash/handover", { ...s.T(s.cashier), body: { courier_user_id: s.cid, amount_tiyin: 100000000 } }).expect(200); // 1 000 000 topshirildi: 400 000 + 1 400 000 > 1 500 000
    await call(h, "post", `/v1/orders/${second}/assign`, { ...s.T(s.dispatcher), body: { courier_user_id: s.cid } }).expect(422);
    await call(h, "post", "/v1/cash/handover", { ...s.T(s.cashier), body: { courier_user_id: s.cid, amount_tiyin: 40000000 } }).expect(200);
    await call(h, "post", `/v1/orders/${second}/assign`, { ...s.T(s.dispatcher), body: { courier_user_id: s.cid } }).expect(200);
    // parallel topshirish: jami mavjuddan oshmaydi
    await s.deliver(second);
    const res = await Promise.all([1, 2, 3].map(() => call(h, "post", "/v1/cash/handover", { ...s.T(s.cashier), body: { courier_user_id: s.cid, amount_tiyin: 100000000 } })));
    expect(res.filter((x) => x.status === 200)).toHaveLength(1); // 1 400 000 dan 1 000 000 faqat bir marta
    expect((await call(h, "get", "/v1/cash/couriers", as(s.o))).body.items[0].on_hand_tiyin).toBe(40000000);
  });

  it("begona do'kon kuryer naqdini ko'rmaydi", async () => {
    const s = await setup();
    await s.deliver(await s.ready(await s.prod(5000000)));
    const o2 = await makeOwner(h, "+998901000002", "987654321", "Boshqa");
    expect((await call(h, "get", "/v1/cash/couriers", as(o2)).expect(200)).body.items).toEqual([]);
    await call(h, "post", "/v1/cash/handover", { ...as(o2), body: { courier_user_id: s.cid, amount_tiyin: 1 } }).expect(404);
  });
});
