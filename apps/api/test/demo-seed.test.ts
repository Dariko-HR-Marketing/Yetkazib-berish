import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS, OTHER_OWNER, seedDemo } from "../src/db/demo-seed";
import { loadConfig } from "../src/config";
import { boot, call, type Harness } from "./helpers";

let h: Harness;
beforeAll(async () => { process.env.OPEN_LOGIN = "on"; h = await boot(); });
afterAll(async () => { await h.close(); delete process.env.OPEN_LOGIN; });
beforeEach(async () => { await h.reset(); });

async function login(phone: string) {
  const r = await call(h, "post", "/v1/auth/open", { body: { phone } }).expect(200);
  const me = await call(h, "get", "/v1/me", { token: r.body.access_token }).expect(200);
  return { token: r.body.access_token as string, tenant: me.body.memberships[0]?.tenant_id as string | undefined, role: me.body.memberships[0]?.role as string | undefined };
}

describe("demo hisoblar", () => {
  it("idempotent: ikkinchi chaqiruv hech narsa qo'shmaydi", async () => {
    expect((await seedDemo(process.env.DATABASE_URL!, loadConfig().DATA_ENCRYPTION_KEY)).created).toBe(true);
    expect((await seedDemo(process.env.DATABASE_URL!, loadConfig().DATA_ENCRYPTION_KEY)).created).toBe(false);
    expect((await h.admin.query("select count(*)::int as n from tenants")).rows[0].n).toBe(2);
    expect((await h.admin.query("select count(*)::int as n from products where tenant_id = (select id from tenants where tin = '200000001')")).rows[0].n).toBe(12);
    expect((await h.admin.query("select provider, enabled from tenant_payment_settings")).rows).toEqual([{ provider: "mock", enabled: true }]);
    expect((await h.admin.query("select feature_key from tenant_features where enabled")).rows.map((r) => r.feature_key)).toContain("loyalty.points");
    expect((await h.admin.query("select status from orders order by number")).rows.map((r) => r.status)).toEqual(["placed", "accepted"]);
    expect((await h.admin.query("select reserved_milli::int as r from stock s join products p on p.id = s.product_id where p.sku = 'MILK-32'")).rows[0].r).toBe(2000);
  });

  it("har rol o'z roli bilan kiradi va ruxsatlar rollar jadvaliga mos (sahifalar: katalog, qoldiq, import, jamoa)", async () => {
    await seedDemo(process.env.DATABASE_URL!, loadConfig().DATA_ENCRYPTION_KEY);
    // kutilgan: [katalog o'qish, katalog yozish, qoldiq o'qish, qoldiq yozish, jamoa o'qish, jamoa yozish]
    const expected: Record<string, [boolean, boolean, boolean, boolean, boolean, boolean]> = {
      owner: [true, true, true, true, true, true], manager: [true, true, true, true, true, false], picker: [false, false, true, true, false, false],
      cashier: [false, false, true, false, false, false], dispatcher: [false, false, false, false, false, false],
      accountant: [true, false, true, false, false, false], marketer: [true, false, false, false, false, false], courier: [false, false, false, false, false, false],
    };
    for (const a of DEMO_ACCOUNTS) {
      const s = await login(a.phone);
      expect(s.role, a.phone).toBe(a.role);
      const T = { token: s.token, tenant: s.tenant };
      const ok = (r: { status: number }) => r.status < 300;
      const branch = (await call(h, "get", "/v1/branches", T)).body.items[0].id as string;
      const prod = (await h.admin.query("select id from products where sku = 'MILK-32'")).rows[0].id as string;
      const got = [
        ok(await call(h, "get", "/v1/products", T)),
        ok(await call(h, "post", "/v1/products", { ...T, body: { name_uz: `T-${a.role}`, price_tiyin: 100 } })),
        ok(await call(h, "get", "/v1/stock", T)),
        ok(await call(h, "put", `/v1/products/${prod}/stock`, { ...T, body: { branch_id: branch, quantity_milli: 40000 } })),
        ok(await call(h, "get", "/v1/members", T)),
        ok(await call(h, "post", "/v1/invites", { ...T, body: { phone: "+998909990000", role: "picker" } })),
      ];
      expect(got, a.role).toEqual(expected[a.role]);
    }
  });

  it("begona do'kon egasi demo do'kon ma'lumotini ko'rmaydi (404)", async () => {
    await seedDemo(process.env.DATABASE_URL!, loadConfig().DATA_ENCRYPTION_KEY);
    const owner = await login("+998901000001");
    const other = await login(OTHER_OWNER);
    const prod = (await h.admin.query("select id from products where sku = 'MILK-32'")).rows[0].id as string;
    await call(h, "get", `/v1/products/${prod}`, { token: other.token, tenant: other.tenant }).expect(404);
    await call(h, "get", "/v1/products", { token: other.token, tenant: owner.tenant }).expect(404);
  });
});
