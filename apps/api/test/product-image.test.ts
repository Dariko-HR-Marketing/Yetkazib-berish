import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { boot, call, makeOwner, type Harness } from "./helpers";

let h: Harness;
beforeAll(async () => { h = await boot(); });
afterAll(async () => { await h.close(); });
beforeEach(async () => { await h.reset(); });
const as = (o: { token: string; tenantId: string }) => ({ token: o.token, tenant: o.tenantId });

describe("mahsulot rasmi (image_url)", () => {
  it("faqat https qabul qilinadi; vitrinada ko'rinadi; tozalash mumkin", async () => {
    const o = await makeOwner(h, "+998901000001", "123456789", "Yashil");
    await call(h, "patch", `/v1/tenants/${o.tenantId}`, { ...as(o), body: { status: "active" } }).expect(200);
    const slug = (await call(h, "get", `/v1/tenants/${o.tenantId}`, as(o))).body.slug as string;
    const mk = (image_url: unknown) => call(h, "post", "/v1/products", { ...as(o), body: { name_uz: "Non", price_tiyin: 400000, image_url } });

    const bad = ["http://cdn.example.uz/non.jpg", "javascript:alert(1)", "data:image/png;base64,AAAA", "https://user:pw@cdn.example.uz/a.jpg", "https://localhost/a.jpg", "//cdn.example.uz/a.jpg", "not a url", `https://cdn.example.uz/${"a".repeat(500)}.jpg`];
    for (const v of bad) expect((await mk(v)).status, v).toBe(400);

    const url = "https://cdn.example.uz/non.jpg";
    const created = (await mk(url).expect(201)).body;
    expect(created.image_url).toBe(url);
    const shopList = (await call(h, "get", `/v1/shops/${slug}/products`).expect(200)).body.items as { image_url: string | null }[];
    expect(shopList[0]!.image_url).toBe(url);

    const patch = (image_url: unknown) => call(h, "patch", `/v1/products/${created.id}`, { ...as(o), body: { image_url } });
    await patch("http://cdn.example.uz/x.jpg").expect(400);
    expect((await patch("https://cdn.example.uz/yangi.jpg").expect(200)).body.image_url).toBe("https://cdn.example.uz/yangi.jpg");
    expect((await patch(null).expect(200)).body.image_url).toBeNull();
    expect((await call(h, "get", `/v1/shops/${slug}/products`).expect(200)).body.items[0].image_url).toBeNull();
    // rasm yuborilmagan yangilashda mavjud qiymat saqlanadi
    await patch("https://cdn.example.uz/a.jpg").expect(200);
    expect((await call(h, "patch", `/v1/products/${created.id}`, { ...as(o), body: { name_uz: "Non 2" } }).expect(200)).body.image_url).toBe("https://cdn.example.uz/a.jpg");
  });
});
