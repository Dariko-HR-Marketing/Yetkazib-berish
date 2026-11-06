import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { boot, call, makeOwner, signUp, type Harness } from "./helpers";

let h: Harness;
beforeAll(async () => { h = await boot(); });
afterAll(async () => { await h.close(); });
beforeEach(async () => { await h.reset(); });

const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.max(0, Math.ceil(xs.length * 0.95) - 1)]!;

/** CLAUDE.md §6: API p95 o'qish ≤ 300 ms, yozish ≤ 600 ms. Mahalliy tez regressiya qo'riqchisi (haqiqiy o'lchov — staging'da k6). */
describe("API tezligi (p95)", () => {
  it("vitrina o'qish p95 ≤ 300 ms (200 mahsulot), buyurtma yozish p95 ≤ 600 ms", async () => {
    const o = await makeOwner(h, "+998901000001");
    const T = { token: o.token, tenant: o.tenantId };
    await call(h, "patch", `/v1/tenants/${o.tenantId}`, { ...T, body: { status: "active" } }).expect(200);
    const branch = (await call(h, "post", "/v1/branches", { ...T, body: { name: "Markaziy", address: "Toshkent, Chilonzor 1" } }).expect(201)).body.id as string;
    const slug = (await call(h, "get", `/v1/tenants/${o.tenantId}`, T)).body.slug as string;
    const csv = ["nomi,narx,qoldiq", ...Array.from({ length: 200 }, (_, i) => `Mahsulot ${i},${1000 + i},1000`)].join("\n");
    await call(h, "post", "/v1/catalog/imports", { ...T, body: { format: "csv", content_base64: Buffer.from(csv).toString("base64"), mode: "apply" } }).expect(200);
    const reads: number[] = [];
    for (let i = 0; i < 100; i++) {
      const t0 = performance.now();
      await call(h, "get", `/v1/shops/${slug}/products?branch_id=${branch}&limit=30`).expect(200);
      reads.push(performance.now() - t0);
    }
    const c = await signUp(h, "+998905550001");
    const first = (await call(h, "get", `/v1/shops/${slug}/products?branch_id=${branch}&limit=5`)).body.items[0].id as string;
    const writes: number[] = [];
    for (let i = 0; i < 40; i++) {
      const t0 = performance.now();
      await call(h, "post", `/v1/shops/${slug}/orders`, { token: c.token, body: { branch_id: branch, fulfillment: "pickup", items: [{ product_id: first, quantity_milli: 1000 }] } }).expect(201);
      writes.push(performance.now() - t0);
    }
    console.log(`p95 o'qish: ${p95(reads).toFixed(0)} ms, yozish: ${p95(writes).toFixed(0)} ms`);
    expect(p95(reads)).toBeLessThanOrEqual(300);
    expect(p95(writes)).toBeLessThanOrEqual(600);
  }, 90_000);
});
