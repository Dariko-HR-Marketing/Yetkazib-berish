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
  const mk = async (name: string, price: number, unit: string, qty: number) => {
    const p = (await call(h, "post", "/v1/products", { ...as(o), body: { name_uz: name, price_tiyin: price, unit } }).expect(201)).body.id as string;
    await call(h, "put", `/v1/products/${p}/stock`, { ...as(o), body: { branch_id: branch, quantity_milli: qty } }).expect(200);
    return p;
  };
  const picker = await addStaff(h, o, "+998901000011", "picker");
  const dispatcher = await addStaff(h, o, "+998901000012", "dispatcher");
  const courier = await addStaff(h, o, "+998901000013", "courier");
  const courier2 = await addStaff(h, o, "+998901000014", "courier");
  const cashier = await addStaff(h, o, "+998901000015", "cashier");
  const T = (s: { token: string }) => ({ token: s.token, tenant: o.tenantId });
  const apple = await mk("Olma", 2200000, "kg", 5000);
  const nonP = await mk("Non", 500000, "piece", 10000);
  const customer = await signUp(h, "+998905550001");
  const place = async (fulfillment: "delivery" | "pickup", items: { p: string; q: number }[]) =>
    (await call(h, "post", `/v1/shops/${slug}/orders`, { token: customer.token, body: { branch_id: branch, fulfillment, ...(fulfillment === "delivery" ? { delivery_address: "Toshkent, Bobur 5" } : {}), items: items.map((i) => ({ product_id: i.p, quantity_milli: i.q })) } }).expect(201)).body;
  const stock = async (p: string) => (await h.admin.query("select quantity_milli::int as q, reserved_milli::int as r from stock where product_id = $1", [p])).rows[0] as { q: number; r: number };
  const accept = (id: string) => call(h, "post", `/v1/orders/${id}/status`, { ...as(o), body: { status: "accepted" } }).expect(200);
  return { o, branch, slug, apple, nonP, picker, dispatcher, courier, courier2, cashier, T, place, stock, accept, customer };
}

describe("yig'ish", () => {
  it("to'liq oqim: qabul -> yig'ish (kam yig'ildi) -> tayyor; jami qayta hisoblanadi, ortiqcha band bo'shaydi; hodisa", async () => {
    const s = await setup();
    const ord = await s.place("delivery", [{ p: s.apple, q: 2500 }, { p: s.nonP, q: 3000 }]);
    await s.accept(ord.id);
    const q = await call(h, "get", "/v1/picking", s.T(s.picker)).expect(200);
    expect(q.body.items.map((x: { id: string }) => x.id)).toEqual([ord.id]);
    await call(h, "post", `/v1/orders/${ord.id}/pick/start`, s.T(s.picker)).expect(200);
    await call(h, "post", `/v1/orders/${ord.id}/pick/finish`, s.T(s.picker)).expect(409); // hali yig'ilmagan
    const items = (await call(h, "get", `/v1/orders/${ord.id}`, as(s.o))).body.items as { id: string; product_id: string }[];
    const iApple = items.find((i) => i.product_id === s.apple)!.id;
    const iNon = items.find((i) => i.product_id === s.nonP)!.id;
    const fin0 = await call(h, "post", `/v1/orders/${ord.id}/pick/finish`, s.T(s.picker)).expect(409);
    expect(fin0.body.code).toBe("order.picking_incomplete");
    await call(h, "put", `/v1/orders/${ord.id}/items/${iApple}/pick`, { ...s.T(s.picker), body: { status: "picked", picked_milli: 2000 } }).expect(200); // 2,5 kg o'rniga 2 kg
    await call(h, "put", `/v1/orders/${ord.id}/items/${iNon}/pick`, { ...s.T(s.picker), body: { status: "picked" } }).expect(200);
    await call(h, "put", `/v1/orders/${ord.id}/items/${iNon}/pick`, { ...s.T(s.picker), body: { status: "picked", picked_milli: 500 } }).expect(400); // dona butun bo'lishi kerak
    const done = await call(h, "post", `/v1/orders/${ord.id}/pick/finish`, s.T(s.picker)).expect(200);
    expect(done.body.status).toBe("ready");
    expect(done.body.subtotal_tiyin).toBe(4400000 + 1500000);
    expect(done.body.total_tiyin).toBe(5900000);
    expect((await s.stock(s.apple)).r).toBe(2000); // 500 bo'shadi
    expect((await h.admin.query("select properties from events where name = 'order.picked'")).rows[0].properties).toEqual({ substitutions: 0, out_of_stock: 0 });
  });

  it("yo'q mahsulot: total kamayadi; hammasi yo'q — 409; bekor qilish band'ni bo'shatadi", async () => {
    const s = await setup();
    const ord = await s.place("pickup", [{ p: s.apple, q: 1000 }, { p: s.nonP, q: 2000 }]);
    await s.accept(ord.id);
    await call(h, "post", `/v1/orders/${ord.id}/pick/start`, s.T(s.picker)).expect(200);
    const items = (await call(h, "get", `/v1/orders/${ord.id}`, as(s.o))).body.items as { id: string; product_id: string }[];
    for (const i of items) await call(h, "put", `/v1/orders/${ord.id}/items/${i.id}/pick`, { ...s.T(s.picker), body: { status: "missing" } }).expect(200);
    expect((await call(h, "post", `/v1/orders/${ord.id}/pick/finish`, s.T(s.picker)).expect(409)).body.code).toBe("order.nothing_picked");
    await call(h, "put", `/v1/orders/${ord.id}/items/${items[0]!.id}/pick`, { ...s.T(s.picker), body: { status: "picked" } }).expect(200);
    const done = await call(h, "post", `/v1/orders/${ord.id}/pick/finish`, s.T(s.picker)).expect(200);
    expect(done.body.total_tiyin).toBe(done.body.items.find((i: { pick_status: string; line_total_tiyin: number }) => i.pick_status === "picked").line_total_tiyin);
    expect((await h.admin.query("select properties from events where name = 'order.picked'")).rows[0].properties.out_of_stock).toBe(1);
    // yig'ilgan tayyor buyurtmani bekor qilish — hamma band bo'shaydi
    await call(h, "post", `/v1/orders/${ord.id}/status`, { ...as(s.o), body: { status: "cancelled", reason: "xaridor kelmadi" } }).expect(200);
    expect((await s.stock(s.apple)).r + (await s.stock(s.nonP)).r).toBe(0);
  });

  it("ruxsatlar: kassir yig'a olmaydi; yig'uvchi buyurtmani qabul qila olmaydi va kuryer biriktira olmaydi", async () => {
    const s = await setup();
    const ord = await s.place("delivery", [{ p: s.nonP, q: 1000 }]);
    await call(h, "post", `/v1/orders/${ord.id}/status`, { ...s.T(s.picker), body: { status: "accepted" } }).expect(403);
    await s.accept(ord.id);
    await call(h, "get", "/v1/picking", s.T(s.cashier)).expect(403);
    await call(h, "post", `/v1/orders/${ord.id}/pick/start`, s.T(s.cashier)).expect(403);
    await call(h, "post", `/v1/orders/${ord.id}/pick/start`, s.T(s.dispatcher)).expect(403); // dispetcher: yig'ish 1 (faqat ko'rish)
    await call(h, "post", `/v1/orders/${ord.id}/pick/start`, s.T(s.picker)).expect(200);
    await call(h, "post", `/v1/orders/${ord.id}/pick/start`, s.T(s.picker)).expect(409);
  });
});

describe("kuryer va yetkazish", () => {
  async function ready(s: Awaited<ReturnType<typeof setup>>, items?: { p: string; q: number }[]) {
    const ord = await s.place("delivery", items ?? [{ p: s.apple, q: 2000 }, { p: s.nonP, q: 3000 }]);
    await s.accept(ord.id);
    await call(h, "post", `/v1/orders/${ord.id}/pick/start`, s.T(s.picker)).expect(200);
    for (const i of (await call(h, "get", `/v1/orders/${ord.id}`, as(s.o))).body.items as { id: string }[]) await call(h, "put", `/v1/orders/${ord.id}/items/${i.id}/pick`, { ...s.T(s.picker), body: { status: "picked" } }).expect(200);
    await call(h, "post", `/v1/orders/${ord.id}/pick/finish`, s.T(s.picker)).expect(200);
    return ord.id as string;
  }
  const courierId = async (phone: string) => (await h.admin.query("select id from users where phone = $1", [phone])).rows[0].id as string;

  it("biriktirish -> olish -> yetkazish: qoldiq ayriladi, naqd yozuvi, joylashuv, kuryer telefonni ko'radi", async () => {
    const s = await setup();
    const id = await ready(s);
    const cid = await courierId("+998901000013");
    await call(h, "post", `/v1/orders/${id}/assign`, { ...s.T(s.picker), body: { courier_user_id: cid } }).expect(403);
    await call(h, "post", `/v1/orders/${id}/assign`, { ...s.T(s.dispatcher), body: { courier_user_id: await courierId("+998901000011") } }).expect(404); // kuryer emas
    await call(h, "post", `/v1/orders/${id}/assign`, { ...s.T(s.dispatcher), body: { courier_user_id: cid } }).expect(200);
    await call(h, "post", `/v1/orders/${id}/assign`, { ...s.T(s.dispatcher), body: { courier_user_id: await courierId("+998901000014") } }).expect(200); // qayta biriktirish (hali olinmagan)
    await call(h, "post", `/v1/orders/${id}/assign`, { ...s.T(s.dispatcher), body: { courier_user_id: cid } }).expect(200);

    const list = await call(h, "get", "/v1/courier/deliveries", s.T(s.courier)).expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].order.customer_phone).toBe("+998905550001"); // to'liq (qo'ng'iroq uchun)
    expect((await call(h, "get", "/v1/courier/deliveries", s.T(s.courier2)).expect(200)).body.items).toEqual([]);
    const did = list.body.items[0].delivery_id as string;
    await call(h, "post", `/v1/courier/deliveries/${did}/pickup`, s.T(s.courier2)).expect(404); // begona topshiriq
    await call(h, "post", `/v1/courier/deliveries/${did}/deliver`, s.T(s.courier)).expect(409); // avval olish
    const picked = await call(h, "post", `/v1/courier/deliveries/${did}/pickup`, s.T(s.courier)).expect(200);
    expect(picked.body.status).toBe("delivering");
    await call(h, "post", `/v1/orders/${id}/assign`, { ...s.T(s.dispatcher), body: { courier_user_id: await courierId("+998901000014") } }).expect(409); // yo'lda
    await call(h, "post", "/v1/courier/location", { ...s.T(s.courier), body: { lat: 41.3, lng: 69.27, accuracy_m: 12 } }).expect(200);
    await call(h, "post", "/v1/courier/location", { ...s.T(s.courier), body: { lat: 200, lng: 69 } }).expect(400);
    const cs = await call(h, "get", "/v1/dispatch/couriers", s.T(s.dispatcher)).expect(200);
    const me = cs.body.items.find((c: { user_id: string }) => c.user_id === cid);
    expect(me).toMatchObject({ active_deliveries: 1, location: { lat: 41.3, lng: 69.27, fresh: true } });
    await call(h, "post", `/v1/orders/${id}/status`, { ...as(s.o), body: { status: "cancelled" } }).expect(409); // yo'lda — faqat kuryer yakunlaydi

    const done = await call(h, "post", `/v1/courier/deliveries/${did}/deliver`, s.T(s.courier)).expect(200);
    expect(done.body.status).toBe("completed");
    expect(await s.stock(s.apple)).toEqual({ q: 3000, r: 0 });
    expect(await s.stock(s.nonP)).toEqual({ q: 7000, r: 0 });
    const d = (await h.admin.query("select status, cash_collected_tiyin::int as cash from deliveries")).rows[0];
    expect(d).toEqual({ status: "delivered", cash: 4400000 + 1500000 });
    expect((await h.admin.query("select count(*)::int as n from events where name = 'order.delivered'")).rows[0].n).toBe(1);
    expect((await call(h, "get", `/v1/orders/${id}`, as(s.o))).body.history.map((x: { to_status: string }) => x.to_status)).toEqual(["placed", "accepted", "picking", "ready", "delivering", "completed"]);
  });

  it("muvaffaqiyatsiz yetkazish: buyurtma 'failed', band bo'shaydi, qoldiq o'zgarmaydi", async () => {
    const s = await setup();
    const id = await ready(s);
    await call(h, "post", `/v1/orders/${id}/assign`, { ...s.T(s.dispatcher), body: { courier_user_id: await courierId("+998901000013") } }).expect(200);
    const did = (await call(h, "get", "/v1/courier/deliveries", s.T(s.courier))).body.items[0].delivery_id as string;
    await call(h, "post", `/v1/courier/deliveries/${did}/pickup`, s.T(s.courier)).expect(200);
    await call(h, "post", `/v1/courier/deliveries/${did}/fail`, { ...s.T(s.courier), body: { reason: "x" } }).expect(400);
    const r = await call(h, "post", `/v1/courier/deliveries/${did}/fail`, { ...s.T(s.courier), body: { reason: "xaridor javob bermadi" } }).expect(200);
    expect(r.body).toMatchObject({ status: "failed", cancel_reason: "xaridor javob bermadi" });
    expect(await s.stock(s.apple)).toEqual({ q: 5000, r: 0 });
    expect(await s.stock(s.nonP)).toEqual({ q: 10000, r: 0 });
  });

  it("kuryer boshqa narsalarni ko'rmaydi/qila olmaydi; olib ketish buyurtmasi qo'lda topshiriladi; yetkazish qo'lda yopilmaydi", async () => {
    const s = await setup();
    await call(h, "get", "/v1/orders", s.T(s.courier)).expect(403);
    await call(h, "get", "/v1/products", s.T(s.courier)).expect(403);
    await call(h, "get", "/v1/courier/deliveries", s.T(s.picker)).expect(403);
    const id = await ready(s);
    await call(h, "post", `/v1/orders/${id}/status`, { ...as(s.o), body: { status: "completed" } }).expect(409); // yetkazish buyurtmasi qo'lda yopilmaydi
    const pick = await s.place("pickup", [{ p: s.nonP, q: 1000 }]);
    await s.accept(pick.id);
    await call(h, "post", `/v1/orders/${pick.id}/pick/start`, s.T(s.picker)).expect(200);
    const it = (await call(h, "get", `/v1/orders/${pick.id}`, as(s.o))).body.items[0].id as string;
    await call(h, "put", `/v1/orders/${pick.id}/items/${it}/pick`, { ...s.T(s.picker), body: { status: "picked" } }).expect(200);
    await call(h, "post", `/v1/orders/${pick.id}/pick/finish`, s.T(s.picker)).expect(200);
    await call(h, "post", `/v1/orders/${pick.id}/assign`, { ...s.T(s.dispatcher), body: { courier_user_id: await courierId("+998901000013") } }).expect(409); // olib ketish — kuryer yo'q
    await call(h, "post", `/v1/orders/${pick.id}/status`, { ...as(s.o), body: { status: "completed" } }).expect(200);
    expect((await s.stock(s.nonP)).q).toBe(9000);
  });
});
