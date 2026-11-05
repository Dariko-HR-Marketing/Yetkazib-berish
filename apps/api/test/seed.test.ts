import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../src/db/migrate";
import { seed } from "../src/db/seed";
import { boot, type Harness } from "./helpers";

let h: Harness;
beforeAll(async () => { h = await boot(); });
afterAll(async () => { await h.close(); });

const plansJson = JSON.parse(readFileSync(resolve(__dirname, "../../../docs/05_spetsifikatsiya_json/plans.json"), "utf8")) as { plans: { code: string; price_uzs_month: number | string; staff: number | null; branches: number | null }[] };
const flagsJson = JSON.parse(readFileSync(resolve(__dirname, "../../../docs/05_spetsifikatsiya_json/feature_flags.json"), "utf8")) as { flags: { key: string; min_plan: string; requires: string[] }[] };

describe("seed: plans.json va feature_flags.json -> DB", () => {
  it("4 paket, narx tiyinda (so'm × 100), butun son", async () => {
    const r = await h.admin.query("select code, price_tiyin, limits from plans where version = 1 order by price_tiyin nulls last");
    const byCode = Object.fromEntries(r.rows.map((x) => [x.code, x]));
    expect(Object.keys(byCode).sort()).toEqual(["biznes", "pro", "start", "tarmoq"]);
    expect(Number(byCode.start.price_tiyin)).toBe(0);
    expect(Number(byCode.biznes.price_tiyin)).toBe(59_000_000);
    expect(Number(byCode.pro.price_tiyin)).toBe(129_000_000);
    expect(byCode.tarmoq.price_tiyin).toBeNull(); // kelishuv asosida
    expect(byCode.start.limits).toMatchObject({ staff: 3, branches: 1, orders_month: 150 });
    expect(byCode.tarmoq.limits).toMatchObject({ staff: null, branches: null, orders_month: null });
    for (const p of plansJson.plans) expect(r.rows.find((x) => x.code === p.code)).toBeTruthy();
  });

  it("21 kalit; har paket min_plan bo'yicha to'plam (Start ⊂ Biznes ⊂ Pro ⊂ Tarmoq); v2 hech qaysida yo'q", async () => {
    const flags = (await h.admin.query("select key, min_plan, requires, platform_enabled from feature_flags")).rows;
    expect(flags).toHaveLength(flagsJson.flags.length);
    const feats: Record<string, Set<string>> = {};
    for (const code of ["start", "biznes", "pro", "tarmoq"]) {
      const r = await h.admin.query("select pf.feature_key from plan_features pf join plans p on p.id = pf.plan_id where p.code = $1 and p.version = 1", [code]);
      feats[code] = new Set(r.rows.map((x) => x.feature_key));
    }
    for (const [lo, hi] of [["start", "biznes"], ["biznes", "pro"], ["pro", "tarmoq"]] as const) for (const k of feats[lo]!) expect(feats[hi]!.has(k)).toBe(true);
    expect(feats.start!.has("catalog.marketplace_listing")).toBe(false);
    expect(feats.biznes!.has("catalog.marketplace_listing")).toBe(true);
    expect(feats.biznes!.has("loyalty.stamp_cards")).toBe(false);
    expect(feats.pro!.has("loyalty.stamp_cards")).toBe(true);
    for (const s of Object.values(feats)) expect(s.has("loyalty.gift_cards")).toBe(false);
    expect(flags.filter((f) => !f.platform_enabled).map((f) => f.key).sort()).toEqual(["delivery.platform_pool", "loyalty.gift_cards"]);
  });

  it("bog'liqliklar JSON bilan bir xil (F-5)", async () => {
    const r = await h.admin.query("select requires from feature_flags where key = 'payment.cash'");
    expect(r.rows[0].requires).toEqual(["delivery.own_couriers"]);
    for (const f of flagsJson.flags) {
      const db = (await h.admin.query("select requires from feature_flags where key = $1", [f.key])).rows[0];
      expect(db.requires, f.key).toEqual(f.requires);
    }
  });

  it("seed idempotent: qayta ishga tushirish dublikat yaratmaydi va mavjud versiyani o'zgartirmaydi", async () => {
    const before = (await h.admin.query("select count(*)::int as n from plans")).rows[0].n;
    await seed(process.env.DATABASE_URL!);
    expect((await h.admin.query("select count(*)::int as n from plans")).rows[0].n).toBe(before);
    expect((await h.admin.query("select count(*)::int as n from plan_features")).rows[0].n).toBeGreaterThan(40);
  });
});

describe("migratsiyalar", () => {
  it("qayta ishga tushirish yangi migratsiya qo'llamaydi (checksum saqlangan)", async () => {
    const applied = await migrate(process.env.DATABASE_URL!, "dostavka_app");
    expect(applied).toEqual([]);
  });

  it("tarmoq narxi so'm emas, tiyin; kodda narx yo'q (plans.json dan)", async () => {
    const r = await h.admin.query("select price_tiyin from plans where code = 'biznes' and version = 1");
    expect(Number(r.rows[0].price_tiyin)).toBe(590_000 * 100);
  });
});
