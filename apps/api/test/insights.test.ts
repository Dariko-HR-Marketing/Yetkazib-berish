import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addStaff, boot, call, makeOwner, signUp, type Harness } from "./helpers";

let h: Harness;
beforeAll(async () => { h = await boot(); });
afterAll(async () => { await h.close(); });
beforeEach(async () => { await h.reset(); });

const as = (o: { token: string; tenantId: string }) => ({ token: o.token, tenant: o.tenantId });

describe("audit jurnali va mijoz 360", () => {
  it("audit: maskalangan telefon, kursor sahifalash, ruxsat; begona do'kon yozuvlari ko'rinmaydi", async () => {
    const o = await makeOwner(h, "+998901000001", "123456789", "Yashil");
    await call(h, "post", "/v1/branches", { ...as(o), body: { name: "Markaz", address: "Toshkent, Chilonzor 1" } }).expect(201);
    const r = (await call(h, "get", "/v1/audit?limit=1", as(o)).expect(200)).body;
    expect(r.items).toHaveLength(1);
    expect(JSON.stringify(r)).not.toContain("+998901000001");
    expect(JSON.stringify(r)).not.toContain('"ip"');
    if (r.next_cursor) {
      const r2 = (await call(h, "get", `/v1/audit?limit=1&cursor=${encodeURIComponent(r.next_cursor)}`, as(o)).expect(200)).body;
      expect(r2.items[0].id).toBeLessThan(r.items[0].id);
    }
    await call(h, "get", "/v1/audit?cursor=zzz", as(o)).expect(400);
    const cashier = await addStaff(h, o, "+998901000011", "cashier");
    await call(h, "get", "/v1/audit", { token: cashier.token, tenant: o.tenantId }).expect(403);
    const o2 = await makeOwner(h, "+998901000002", "987654321", "Boshqa");
    const ids = new Set(r.items.map((i: { id: number }) => i.id));
    const other = (await call(h, "get", "/v1/audit?limit=100", as(o2)).expect(200)).body.items as { id: number }[];
    expect(other.some((i) => ids.has(i.id))).toBe(false);
  });

  it("mijoz 360: buyurtmalar yig'indisi, takroriy mijoz belgisi, telefon maskalangan", async () => {
    const o = await makeOwner(h, "+998901000001", "123456789", "Yashil");
    await call(h, "patch", `/v1/tenants/${o.tenantId}`, { ...as(o), body: { status: "active" } }).expect(200);
    const branch = (await call(h, "post", "/v1/branches", { ...as(o), body: { name: "Markaz", address: "Toshkent, Chilonzor 1" } }).expect(201)).body.id as string;
    const slug = (await call(h, "get", `/v1/tenants/${o.tenantId}`, as(o))).body.slug as string;
    const p = (await call(h, "post", "/v1/products", { ...as(o), body: { name_uz: "Non", price_tiyin: 500000, unit: "piece" } }).expect(201)).body.id as string;
    await call(h, "put", `/v1/products/${p}/stock`, { ...as(o), body: { branch_id: branch, quantity_milli: 100000 } }).expect(200);
    const c = await signUp(h, "+998905550001");
    for (let i = 0; i < 2; i++) {
      const id = (await call(h, "post", `/v1/shops/${slug}/orders`, { token: c.token, body: { branch_id: branch, fulfillment: "pickup", items: [{ product_id: p, quantity_milli: 1000 }] } }).expect(201)).body.id as string;
      await call(h, "post", `/v1/orders/${id}/status`, { ...as(o), body: { status: "accepted" } }).expect(200);
      await call(h, "post", `/v1/orders/${id}/status`, { ...as(o), body: { status: "completed" } }).expect(200);
    }
    const r = (await call(h, "get", "/v1/customers", as(o)).expect(200)).body;
    expect(r.total_customers).toBe(1);
    expect(r.items[0]).toMatchObject({ orders: 2, completed: 2, cancelled: 0, spent_tiyin: 1000000, repeat: true });
    expect(JSON.stringify(r)).not.toContain("+998905550001");
    expect(r.items[0].phone_masked).toBe("+99890 ••• •• 01");
  });

  it("mijoz 360: telefon maskalangan, ruxsat tekshiriladi, bo'sh holat", async () => {
    const o = await makeOwner(h, "+998901000001", "123456789", "Yashil");
    expect((await call(h, "get", "/v1/customers", as(o)).expect(200)).body).toEqual({ total_customers: 0, items: [] });
    const c = await signUp(h, "+998905550001");
    expect(c.token).toBeTruthy();
    const cashier = await addStaff(h, o, "+998901000011", "cashier");
    await call(h, "get", "/v1/customers", { token: cashier.token, tenant: o.tenantId }).expect(403);
    await call(h, "get", "/v1/customers?limit=0", as(o)).expect(400);
  });
});
