import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { boot, call, makeOwner, signUp, type Harness } from "./helpers";

let h: Harness;
beforeAll(async () => { h = await boot(); });
afterAll(async () => { await h.close(); });
beforeEach(async () => { await h.reset(); });
const as = (o: { token: string; tenantId: string }) => ({ token: o.token, tenant: o.tenantId });

async function shop(phone: string, name: string, tin: string) {
  const o = await makeOwner(h, phone, tin, name);
  await call(h, "patch", `/v1/tenants/${o.tenantId}`, { ...as(o), body: { status: "active" } }).expect(200);
  const slug = (await call(h, "get", `/v1/tenants/${o.tenantId}`, as(o))).body.slug as string;
  return { o, slug };
}

describe("saqlangan manzillar", () => {
  it("birinchisi asosiy; asosiyni almashtirish; takror 409; limit 5; o'chirganda asosiy qayta tayinlanadi", async () => {
    const { slug } = await shop("+998901000001", "Yashil", "123456789");
    const c = await signUp(h, "+998905550001");
    const add = (label: string, address: string, is_default?: boolean) => call(h, "post", `/v1/shops/${slug}/addresses`, { token: c.token, body: { label, address, ...(is_default === undefined ? {} : { is_default }) } });
    const a1 = (await add("Uy", "Toshkent, Bobur 5").expect(201)).body;
    expect(a1.is_default).toBe(true);
    const a2 = (await add("Ish", "Toshkent, Navoiy 10").expect(201)).body;
    expect(a2.is_default).toBe(false);
    await add("Nusxa", "TOSHKENT, bobur 5").expect(409);
    await call(h, "patch", `/v1/shops/${slug}/addresses/${a2.id}`, { token: c.token, body: { is_default: true } }).expect(200);
    let list = (await call(h, "get", `/v1/shops/${slug}/addresses`, { token: c.token }).expect(200)).body.items as { id: string; is_default: boolean }[];
    expect(list.map((x) => [x.id, x.is_default])).toEqual([[a2.id, true], [a1.id, false]]);
    for (const n of [3, 4, 5]) await add(`M${n}`, `Toshkent, Ko'cha ${n}`).expect(201);
    const over = await add("Oltinchi", "Toshkent, Ko'cha 6").expect(422);
    expect(over.body.code).toBe("address.limit");
    expect(over.body.message_uz).toContain("5");
    await call(h, "delete", `/v1/shops/${slug}/addresses/${a2.id}`, { token: c.token }).expect(200);
    list = (await call(h, "get", `/v1/shops/${slug}/addresses`, { token: c.token }).expect(200)).body.items;
    expect(list.filter((x) => x.is_default)).toHaveLength(1);
    await add("Qisqa", "abc").expect(400);
    await call(h, "patch", `/v1/shops/${slug}/addresses/${a1.id}`, { token: c.token, body: {} }).expect(400);
  });

  it("begona xaridor va do'kon egasi ko'ra olmaydi; boshqa do'kon alohida; autentifikatsiyasiz — 401", async () => {
    const A = await shop("+998901000001", "Yashil", "123456789");
    const B = await shop("+998901000002", "Moviy", "987654321");
    const c1 = await signUp(h, "+998905550001");
    const c2 = await signUp(h, "+998905550002");
    const mine = (await call(h, "post", `/v1/shops/${A.slug}/addresses`, { token: c1.token, body: { label: "Uy", address: "Toshkent, Bobur 5" } }).expect(201)).body;
    expect((await call(h, "get", `/v1/shops/${A.slug}/addresses`, { token: c2.token }).expect(200)).body.items).toEqual([]);
    await call(h, "patch", `/v1/shops/${A.slug}/addresses/${mine.id}`, { token: c2.token, body: { label: "X" } }).expect(404);
    await call(h, "delete", `/v1/shops/${A.slug}/addresses/${mine.id}`, { token: c2.token }).expect(404);
    expect((await call(h, "get", `/v1/shops/${B.slug}/addresses`, { token: c1.token }).expect(200)).body.items).toEqual([]);
    await call(h, "patch", `/v1/shops/${B.slug}/addresses/${mine.id}`, { token: c1.token, body: { label: "X" } }).expect(404); // boshqa do'kon doirasida
    // do'kon egasi o'z do'konidagi mijoz manzillarini ko'rmaydi (RLS: faqat egasi)
    expect((await call(h, "get", `/v1/shops/${A.slug}/addresses`, { token: A.o.token }).expect(200)).body.items).toEqual([]);
    const raw = await h.admin.query("select count(*)::int as n from customer_addresses");
    expect(raw.rows[0].n).toBe(1);
    await call(h, "get", `/v1/shops/${A.slug}/addresses`).expect(401);
    await call(h, "get", `/v1/shops/yoq-dokon/addresses`, { token: c1.token }).expect(404);
  });
});
