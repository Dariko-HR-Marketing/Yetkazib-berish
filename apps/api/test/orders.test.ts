import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { lineTotal } from "../src/modules/orders/orders.service";
import { slugify } from "../src/modules/orders/slug";
import { addStaff, boot, call, makeOwner, signUp, type Harness } from "./helpers";

let h: Harness;
beforeAll(async () => { h = await boot(); });
afterAll(async () => { await h.close(); });
beforeEach(async () => { await h.reset(); });

const as = (o: { token: string; tenantId: string }) => ({ token: o.token, tenant: o.tenantId });

/** Faol do'kon + filial + mahsulotlar (qoldiq bilan). */
async function shop(phone = "+998901000001", name = "Yashil Savat") {
  const o = await makeOwner(h, phone, phone.endsWith("2") ? "987654321" : "123456789", name);
  await call(h, "patch", `/v1/tenants/${o.tenantId}`, { ...as(o), body: { status: "active" } }).expect(200);
  const b = (await call(h, "post", "/v1/branches", { ...as(o), body: { name: "Markaziy", address: "Toshkent, Chilonzor 1" } }).expect(201)).body.id as string;
  const t = (await call(h, "get", `/v1/tenants/${o.tenantId}`, as(o))).body;
  const mk = async (name_uz: string, price: number, unit: string, qty: number, extra: Record<string, unknown> = {}) => {
    const p = (await call(h, "post", "/v1/products", { ...as(o), body: { name_uz, price_tiyin: price, unit, ...extra } }).expect(201)).body.id as string;
    await call(h, "put", `/v1/products/${p}/stock`, { ...as(o), body: { branch_id: b, quantity_milli: qty } }).expect(200);
    return p;
  };
  return { o, b, slug: t.slug as string, mk };
}
const order = (slug: string, token: string, body: Record<string, unknown>, key?: string) => call(h, "post", `/v1/shops/${slug}/orders`, { token, body, key });
const reserved = async (p: string) => Number((await h.admin.query("select reserved_milli from stock where product_id = $1", [p])).rows[0].reserved_milli);
const qty = async (p: string) => Number((await h.admin.query("select quantity_milli from stock where product_id = $1", [p])).rows[0].quantity_milli);

describe("slug va yaxlitlash", () => {
  it("slugify", () => {
    expect(slugify("Yashil Savat")).toBe("yashil-savat");
    expect(slugify("Do'kon №1 «Baraka»")).toBe("dokon-1-baraka");
    expect(slugify("!!")).toBe("dokon");
  });
  it("lineTotal: butun son, yarim yuqoriga", () => {
    expect(lineTotal(1080, 2200000)).toBe(2376000);
    expect(lineTotal(1500, 333)).toBe(500); // 499.5 -> 500
    expect(lineTotal(1000, 1250000)).toBe(1250000);
  });
  it("do'kon yaratilganda slug nomdan, band bo'lsa -2", async () => {
    const a = await shop("+998901000001", "Yashil Savat");
    const b = await shop("+998901000002", "Yashil Savat");
    expect(a.slug).toBe("yashil-savat");
    expect(b.slug).toBe("yashil-savat-2");
  });
});

describe("ommaviy vitrina", () => {
  it("qoralama do'kon 404; faollashgach ochiladi; mahsulotlar holati; yashirin ko'rinmaydi", async () => {
    const o = await makeOwner(h, "+998901000001");
    const slug = (await call(h, "get", `/v1/tenants/${o.tenantId}`, as(o))).body.slug;
    await call(h, "get", `/v1/shops/${slug}`).expect(404);
    await call(h, "patch", `/v1/tenants/${o.tenantId}`, { ...as(o), body: { status: "active" } }).expect(200);
    const s = await call(h, "get", `/v1/shops/${slug}`).expect(200);
    expect(s.body).toMatchObject({ slug, name: "Yashil Savat", features: { cash: true, stock_visible: true } });
    await call(h, "get", "/v1/shops/yoq-do-kon").expect(404);
    await call(h, "get", "/v1/shops/A_B").expect(404);
  });

  it("mahsulotlar: Bor / Kam / Tugadi; stock.visible o'chiq bo'lsa son yashiriladi, «Tugadi» baribir ko'rinadi", async () => {
    const { o, b, slug, mk } = await shop();
    await mk("Sut", 1250000, "l", 40000);
    await mk("Kefir", 1100000, "l", 4000);
    await mk("Qatiq", 800000, "piece", 0);
    const hidden = await mk("Yashirin", 100, "piece", 5000);
    await call(h, "patch", `/v1/products/${hidden}`, { ...as(o), body: { status: "hidden" } }).expect(200);
    let r = await call(h, "get", `/v1/shops/${slug}/products?branch_id=${b}`).expect(200);
    const by = Object.fromEntries(r.body.items.map((p: { name_uz: string }) => [p.name_uz, p]));
    expect(Object.keys(by).sort()).toEqual(["Kefir", "Qatiq", "Sut"]);
    expect(by.Sut.availability).toEqual({ state: "in", available_milli: 40000 });
    expect(by.Kefir.availability.state).toBe("low");
    expect(by.Qatiq.availability).toEqual({ state: "out", available_milli: 0 });
    await call(h, "patch", "/v1/features/stock.visible", { ...as(o), body: { enabled: false } }).expect(200);
    r = await call(h, "get", `/v1/shops/${slug}/products`).expect(200);
    const by2 = Object.fromEntries(r.body.items.map((p: { name_uz: string }) => [p.name_uz, p]));
    expect(by2.Kefir.availability).toEqual({ state: "in", available_milli: null });
    expect(by2.Qatiq.availability.state).toBe("out");
  });

  it("«Tugadi» belgilangach vitrinada darhol ko'rinadi (S1 mezoni ≤ 5 s); qidiruv va kursor", async () => {
    const { o, b, slug, mk } = await shop();
    const p = await mk("Sut", 1250000, "l", 40000);
    for (let i = 0; i < 4; i++) await mk(`Mahsulot ${i}`, 100, "piece", 10000);
    const t0 = Date.now();
    await call(h, "post", `/v1/products/${p}/stock/out`, { ...as(o), body: { branch_id: b, out: true } }).expect(200);
    const r = await call(h, "get", `/v1/shops/${slug}/products?q=sut`).expect(200);
    expect(r.body.items[0].availability.state).toBe("out");
    expect(Date.now() - t0).toBeLessThan(5000);
    const seen: string[] = [];
    let cur: string | undefined;
    do {
      const pg = await call(h, "get", `/v1/shops/${slug}/products?limit=2${cur ? `&cursor=${cur}` : ""}`).expect(200);
      seen.push(...pg.body.items.map((x: { name_uz: string }) => x.name_uz));
      cur = pg.body.next_cursor ?? undefined;
    } while (cur);
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });
});

describe("buyurtma berish", () => {
  it("jami butun son, narx surati saqlanadi, qoldiq band qilinadi, hodisa PII'siz", async () => {
    const { o, b, slug, mk } = await shop();
    const apple = await mk("Olma", 2200000, "kg", 5000);
    const milk = await mk("Sut", 1250000, "l", 10000);
    const c = await signUp(h, "+998905550001");
    const r = await order(slug, c.token, { branch_id: b, fulfillment: "delivery", delivery_address: "Toshkent, Bobur 5-uy", note: "qo'ng'iroq qiling", items: [{ product_id: apple, quantity_milli: 1080 }, { product_id: milk, quantity_milli: 2000 }, { product_id: milk, quantity_milli: 1000 }] }).expect(201);
    expect(r.body).toMatchObject({ status: "placed", fulfillment: "delivery", payment_type: "cash", subtotal_tiyin: 2376000 + 3750000, total_tiyin: 2376000 + 3750000, delivery_fee_tiyin: 0 });
    expect(r.body.items).toHaveLength(2); // takror qatorlar birlashtirildi
    expect(await reserved(apple)).toBe(1080);
    expect(await reserved(milk)).toBe(3000);
    await call(h, "patch", `/v1/products/${apple}`, { ...as(o), body: { price_tiyin: 9900000 } }).expect(200);
    const again = await call(h, "get", `/v1/shops/${slug}/orders/${r.body.id}`, { token: c.token }).expect(200);
    expect(again.body.items.find((i: { product_id: string }) => i.product_id === apple).price_tiyin).toBe(2200000); // o'zgarmadi
    const ev = (await h.admin.query("select properties from events where name = 'order.placed'")).rows;
    expect(ev).toHaveLength(1);
    expect(JSON.stringify(ev[0].properties)).not.toMatch(/9055|Bobur|998/);
    expect(ev[0].properties).toMatchObject({ order_id: r.body.id, amount_tiyin: 6126000, payment_type: "cash" });
    // vitrinada mavjud miqdor kamaydi
    const pr = await call(h, "get", `/v1/shops/${slug}/products?branch_id=${b}`).expect(200);
    expect(pr.body.items.find((p: { id: string }) => p.id === milk).availability.available_milli).toBe(7000);
  });

  it("tekshiruvlar: kirish shart, manzil, dona butun bo'lishi, noma'lum/begona mahsulot, bo'sh savat", async () => {
    const { b, slug, mk } = await shop();
    const other = await shop("+998901000002", "Boshqa");
    const piece = await mk("Non", 500000, "piece", 10000);
    const foreign = await other.mk("Begona", 100, "piece", 10000);
    const c = await signUp(h, "+998905550001");
    const base = { branch_id: b, fulfillment: "pickup", items: [{ product_id: piece, quantity_milli: 1000 }] };
    await call(h, "post", `/v1/shops/${slug}/orders`, { body: base }).expect(401);
    await order(slug, c.token, { ...base, fulfillment: "delivery" }).expect(400); // manzilsiz
    await order(slug, c.token, { ...base, items: [] }).expect(400);
    expect((await order(slug, c.token, { ...base, items: [{ product_id: piece, quantity_milli: 500 }] }).expect(400)).body.code).toBe("order.invalid_quantity");
    expect((await order(slug, c.token, { ...base, items: [{ product_id: foreign, quantity_milli: 1000 }] }).expect(422)).body.code).toBe("order.product_unavailable");
    await order(slug, c.token, { ...base, branch_id: other.b }).expect(404);
    await order(slug, c.token, { ...base, payment_type: "card" }).expect(400);
    await order("yoq-do-kon", c.token, base).expect(404);
    await order(slug, c.token, base).expect(201); // olib ketish — manzil shart emas
  });

  it("yetarli emas: 409 va hech narsa band qilinmaydi (atomik)", async () => {
    const { b, slug, mk } = await shop();
    const a = await mk("A", 100, "piece", 5000);
    const z = await mk("Z", 100, "piece", 1000);
    const c = await signUp(h, "+998905550001");
    const r = await order(slug, c.token, { branch_id: b, fulfillment: "pickup", items: [{ product_id: a, quantity_milli: 2000 }, { product_id: z, quantity_milli: 2000 }] }).expect(409);
    expect(r.body.code).toBe("order.out_of_stock");
    expect(r.body.details.items).toEqual([{ product_id: z, available_milli: 1000 }]);
    expect(await reserved(a)).toBe(0);
    expect((await h.admin.query("select count(*)::int as n from orders")).rows[0].n).toBe(0);
  });

  it("«Tugadi» (stop-list) mahsulotni buyurtma qilib bo'lmaydi", async () => {
    const { o, b, slug, mk } = await shop();
    const p = await mk("Pomidor", 100, "kg", 50000);
    await call(h, "post", `/v1/products/${p}/stock/out`, { ...as(o), body: { branch_id: b, out: true } }).expect(200);
    const c = await signUp(h, "+998905550001");
    expect((await order(slug, c.token, { branch_id: b, fulfillment: "pickup", items: [{ product_id: p, quantity_milli: 1000 }] }).expect(409)).body.code).toBe("order.out_of_stock");
  });

  it("parallel buyurtmalar ortiqcha sotmaydi (qator qulfi)", async () => {
    const { b, slug, mk } = await shop();
    const p = await mk("Cheklangan", 100, "piece", 10000);
    const customers = await Promise.all(["+998905550001", "+998905550002", "+998905550003", "+998905550004", "+998905550005"].map((ph) => signUp(h, ph)));
    const res = await Promise.all(customers.map((c) => order(slug, c.token, { branch_id: b, fulfillment: "pickup", items: [{ product_id: p, quantity_milli: 3000 }] })));
    const ok = res.filter((r) => r.status === 201).length;
    expect(ok).toBe(3);
    expect(res.filter((r) => r.status === 409)).toHaveLength(2);
    expect(await reserved(p)).toBe(9000);
  });

  it("Idempotency-Key: takror so'rov bitta buyurtma yaratadi", async () => {
    const { b, slug, mk } = await shop();
    const p = await mk("Non", 100, "piece", 10000);
    const c = await signUp(h, "+998905550001");
    const key = "3c1f0f8e-9d35-4a0c-9d5f-0e7a4d6f2b99";
    const body = { branch_id: b, fulfillment: "pickup", items: [{ product_id: p, quantity_milli: 1000 }] };
    const r1 = await order(slug, c.token, body, key).expect(201);
    const r2 = await order(slug, c.token, body, key).expect(201);
    expect(r2.body.id).toBe(r1.body.id);
    expect(await reserved(p)).toBe(1000);
  });

  it("naqd o'chirilsa (payment.cash) buyurtma rad etiladi", async () => {
    const { o, b, slug, mk } = await shop();
    const p = await mk("Non", 100, "piece", 10000);
    await call(h, "patch", "/v1/features/payment.cash", { ...as(o), body: { enabled: false } }).expect(200);
    const c = await signUp(h, "+998905550001");
    expect((await order(slug, c.token, { branch_id: b, fulfillment: "pickup", items: [{ product_id: p, quantity_milli: 1000 }] }).expect(422)).body.code).toBe("order.payment_unavailable");
  });
});

describe("buyurtmalar paneli va holatlar", () => {
  async function placed(extra: { qty?: number } = {}) {
    const s = await shop();
    const p = await s.mk("Non", 500000, "piece", 10000);
    const c = await signUp(h, "+998905550001");
    const r = await order(s.slug, c.token, { branch_id: s.b, fulfillment: "pickup", items: [{ product_id: p, quantity_milli: extra.qty ?? 3000 }] }).expect(201);
    return { ...s, p, c, id: r.body.id as string };
  }

  it("ro'yxat: telefon maskalangan, hisoblagichlar; qabul -> bajarildi qoldiqni kamaytiradi va jurnalga 'sale' yozadi", async () => {
    const t = await placed();
    const list = await call(h, "get", "/v1/orders", as(t.o)).expect(200);
    expect(list.body.items[0].customer_phone).toMatch(/•••/);
    expect(list.body.counts).toEqual({ placed: 1 });
    await call(h, "post", `/v1/orders/${t.id}/status`, { ...as(t.o), body: { status: "accepted" } }).expect(200);
    await call(h, "post", `/v1/orders/${t.id}/status`, { ...as(t.o), body: { status: "completed" } }).expect(200);
    expect(await qty(t.p)).toBe(7000);
    expect(await reserved(t.p)).toBe(0);
    const mv = (await h.admin.query("select reason, delta_milli::int as d from stock_movements where reason = 'sale'")).rows;
    expect(mv).toEqual([{ reason: "sale", d: -3000 }]);
    const one = await call(h, "get", `/v1/orders/${t.id}`, as(t.o)).expect(200);
    expect(one.body.history.map((x: { to_status: string }) => x.to_status)).toEqual(["placed", "accepted", "completed"]);
    await call(h, "post", `/v1/orders/${t.id}/status`, { ...as(t.o), body: { status: "cancelled" } }).expect(409); // bajarilgan bekor bo'lmaydi
  });

  it("bekor qilish bandni bo'shatadi; noto'g'ri o'tish 409; sabab saqlanadi", async () => {
    const t = await placed();
    expect(await reserved(t.p)).toBe(3000);
    await call(h, "post", `/v1/orders/${t.id}/status`, { ...as(t.o), body: { status: "completed" } }).expect(409); // qabul qilinmagan
    await call(h, "post", `/v1/orders/${t.id}/status`, { ...as(t.o), body: { status: "cancelled", reason: "mahsulot yo'q" } }).expect(200);
    expect(await reserved(t.p)).toBe(0);
    expect(await qty(t.p)).toBe(10000);
    expect((await call(h, "get", `/v1/orders/${t.id}`, as(t.o))).body).toMatchObject({ status: "cancelled", cancel_reason: "mahsulot yo'q" });
    expect((await h.admin.query("select count(*)::int as n from audit_log where action = 'order.cancelled'")).rows[0].n).toBe(1);
  });

  it("xaridor faqat o'z buyurtmasini ko'radi, faqat 'placed' ni bekor qiladi", async () => {
    const t = await placed();
    const stranger = await signUp(h, "+998905550002");
    await call(h, "get", `/v1/shops/${t.slug}/orders/${t.id}`, { token: stranger.token }).expect(404);
    expect((await call(h, "get", `/v1/shops/${t.slug}/orders`, { token: stranger.token }).expect(200)).body.items).toEqual([]);
    expect((await call(h, "get", `/v1/shops/${t.slug}/orders`, { token: t.c.token }).expect(200)).body.items).toHaveLength(1);
    await call(h, "post", `/v1/shops/${t.slug}/orders/${t.id}/cancel`, { token: stranger.token, body: {} }).expect(404);
    await call(h, "post", `/v1/orders/${t.id}/status`, { ...as(t.o), body: { status: "accepted" } }).expect(200);
    expect((await call(h, "post", `/v1/shops/${t.slug}/orders/${t.id}/cancel`, { token: t.c.token, body: {} }).expect(409)).body.code).toBe("order.cannot_cancel");
  });

  it("xaridor bekor qilsa band bo'shaydi", async () => {
    const t = await placed();
    const r = await call(h, "post", `/v1/shops/${t.slug}/orders/${t.id}/cancel`, { token: t.c.token, body: { reason: "fikrim o'zgardi" } }).expect(200);
    expect(r.body.status).toBe("cancelled");
    expect(await reserved(t.p)).toBe(0);
  });

  it("ruxsatlar: dispetcher boshqaradi; yig'uvchi/kassir faqat ko'radi; begona do'kon ko'rmaydi (404)", async () => {
    const t = await placed();
    const dispatcher = await addStaff(h, t.o, "+998901000011", "dispatcher");
    const cashier = await addStaff(h, t.o, "+998901000012", "cashier");
    const D = { token: dispatcher.token, tenant: t.o.tenantId };
    const C = { token: cashier.token, tenant: t.o.tenantId };
    await call(h, "get", "/v1/orders", C).expect(200);
    await call(h, "post", `/v1/orders/${t.id}/status`, { ...C, body: { status: "accepted" } }).expect(403);
    await call(h, "post", `/v1/orders/${t.id}/status`, { ...D, body: { status: "accepted" } }).expect(200);
    const other = await shop("+998901000002", "Boshqa");
    expect((await call(h, "get", "/v1/orders", as(other.o)).expect(200)).body.items).toEqual([]);
    await call(h, "get", `/v1/orders/${t.id}`, as(other.o)).expect(404);
    await call(h, "post", `/v1/orders/${t.id}/status`, { ...as(other.o), body: { status: "cancelled" } }).expect(404);
  });
});
