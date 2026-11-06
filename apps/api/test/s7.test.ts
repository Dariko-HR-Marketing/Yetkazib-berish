import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addStaff, boot, call, makeAdmin, makeOwner, signUp, type Harness } from "./helpers";

let h: Harness;
beforeAll(async () => { h = await boot(); });
afterAll(async () => { await h.close(); });
beforeEach(async () => { await h.reset(); });

const as = (o: { token: string; tenantId: string }) => ({ token: o.token, tenant: o.tenantId });

async function shop(phone = "+998901000001", name = "Yashil Savat", tin = "123456789") {
  const o = await makeOwner(h, phone, tin, name);
  await call(h, "patch", `/v1/tenants/${o.tenantId}`, { ...as(o), body: { status: "active" } }).expect(200);
  const branch = (await call(h, "post", "/v1/branches", { ...as(o), body: { name: "Markaziy", address: "Toshkent, Chilonzor 1" } }).expect(201)).body.id as string;
  const slug = (await call(h, "get", `/v1/tenants/${o.tenantId}`, as(o))).body.slug as string;
  return { o, branch, slug };
}

describe("hisobot", () => {
  it("bajarilgan buyurtmalar bo'yicha kunlik daromad, eng ko'p sotilgan, bekor ulushi; ruxsatlar", async () => {
    const { o, branch, slug } = await shop();
    const mk = async (name: string, price: number) => {
      const p = (await call(h, "post", "/v1/products", { ...as(o), body: { name_uz: name, price_tiyin: price, unit: "piece" } }).expect(201)).body.id as string;
      await call(h, "put", `/v1/products/${p}/stock`, { ...as(o), body: { branch_id: branch, quantity_milli: 100000 } }).expect(200);
      return p;
    };
    const non = await mk("Non", 500000);
    const sut = await mk("Sut", 1250000);
    const c = await signUp(h, "+998905550001");
    const place = (items: { p: string; q: number }[]) => call(h, "post", `/v1/shops/${slug}/orders`, { token: c.token, body: { branch_id: branch, fulfillment: "pickup", items: items.map((i) => ({ product_id: i.p, quantity_milli: i.q })) } }).expect(201).then((r) => r.body.id as string);
    const st = (id: string, s: string) => call(h, "post", `/v1/orders/${id}/status`, { ...as(o), body: { status: s } }).expect(200);
    const a = await place([{ p: non, q: 2000 }, { p: sut, q: 1000 }]); // 10 000 + 12 500 = 22 500 so'm
    await st(a, "accepted"); await st(a, "completed");
    const b = await place([{ p: non, q: 1000 }]); // 5 000
    await st(b, "accepted"); await st(b, "completed");
    const x = await place([{ p: sut, q: 1000 }]);
    await st(x, "cancelled");
    const r = (await call(h, "get", "/v1/reports/sales?days=7", as(o)).expect(200)).body;
    expect(r).toMatchObject({ orders: 2, revenue_tiyin: 2250000 + 500000, avg_order_tiyin: 1375000, status_counts: { completed: 2, cancelled: 1 } });
    expect(r.cancel_rate_pct).toBeCloseTo(33.3, 1);
    expect(r.daily).toHaveLength(1);
    expect(r.top_products.map((p: { name_uz: string; quantity_milli: number }) => [p.name_uz, p.quantity_milli])).toEqual([["Non", 3000], ["Sut", 1000]]);
    // ruxsat: analytics:read — kassirda yo'q, buxgalterda bor
    const cashier = await addStaff(h, o, "+998901000011", "cashier");
    const acc = await addStaff(h, o, "+998901000012", "picker"); // Start: 3 xodim
    await call(h, "get", "/v1/reports/sales", { token: cashier.token, tenant: o.tenantId }).expect(403);
    await call(h, "get", "/v1/reports/sales", { token: acc.token, tenant: o.tenantId }).expect(403);
    await call(h, "get", "/v1/reports/sales?days=0", as(o)).expect(400);
    // begona do'kon o'z hisobotini ko'radi (bo'sh)
    const o2 = await makeOwner(h, "+998901000002", "987654321", "Boshqa");
    expect((await call(h, "get", "/v1/reports/sales", as(o2)).expect(200)).body.orders).toBe(0);
  });
});

describe("admin va umumiy katalog", () => {
  it("platforma admini do'konlarni ko'radi; oddiy foydalanuvchi — 403; umumiy katalog faqat yoqilgan do'konlarni", async () => {
    const a = await shop("+998901000001", "Yashil Savat");
    const b = await shop("+998901000002", "Moviy Bozor", "987654321");
    const admin = await makeAdmin(h);
    const list = (await call(h, "get", "/v1/admin/tenants", { token: admin.token }).expect(200)).body.items as { slug: string; members: number }[];
    expect(list.map((t) => t.slug).sort()).toEqual(["moviy-bozor", "yashil-savat"]);
    expect((await call(h, "get", "/v1/admin/tenants?q=moviy", { token: admin.token }).expect(200)).body.items).toHaveLength(1);
    await call(h, "get", "/v1/admin/tenants", { token: a.o.token }).expect(403);
    // umumiy katalog: Biznes paketi va yoqilgan funksiya kerak
    expect((await call(h, "get", "/v1/marketplace/shops").expect(200)).body.items).toEqual([]);
    await h.admin.query("update tenants set plan_code = 'biznes' where id = $1", [b.o.tenantId]);
    await call(h, "patch", "/v1/features/catalog.marketplace_listing", { ...as(b.o), body: { enabled: true } }).expect(200);
    expect((await call(h, "get", "/v1/marketplace/shops").expect(200)).body.items).toEqual([{ name: "Moviy Bozor", slug: "moviy-bozor" }]);
  });
});

describe("qoldiq ruxsati", () => {
  it("marketolog katalogni ko'radi, lekin qoldiq ma'lumotini emas (stock:read yo'q)", async () => {
    const { o, branch } = await shop();
    const p = (await call(h, "post", "/v1/products", { ...as(o), body: { name_uz: "Non", price_tiyin: 500000 } }).expect(201)).body.id as string;
    await call(h, "put", `/v1/products/${p}/stock`, { ...as(o), body: { branch_id: branch, quantity_milli: 5000 } }).expect(200);
    const m = await addStaff(h, o, "+998901000011", "marketer");
    const T = { token: m.token, tenant: o.tenantId };
    expect((await call(h, "get", "/v1/products", T).expect(200)).body.items[0].stock).toBeNull();
    expect((await call(h, "get", `/v1/products/${p}`, T).expect(200)).body.stock).toBeNull();
    expect((await call(h, "get", "/v1/products", as(o)).expect(200)).body.items[0].stock).not.toBeNull();
  });
});
