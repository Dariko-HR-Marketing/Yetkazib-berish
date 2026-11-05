import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Client } from "pg";

const SEED_DIR = process.env.SEED_DIR ?? resolve(__dirname, "../../../../infra/seed");
const PLAN_ORDER = ["start", "biznes", "pro", "tarmoq"] as const;

interface PlanJson { code: string; name: string; price_uzs_month: number | string; orders_month: number | null; branches: number | null; staff: number | null; integrations: number | string | null }
interface FlagJson { key: string; description: string; min_plan: string; default_on_for_shop: boolean | null; toggled_by: string; requires: string[] }

/** Platforma darajasida o'chiq turadigan kalitlar: pilotda platforma kuryerlari puli (D3) va sovg'a kartalari (v2). */
export const PLATFORM_OFF_BY_DEFAULT = new Set(["delivery.platform_pool", "loyalty.gift_cards"]);

export function planFeatureKeys(flags: FlagJson[], planCode: string): string[] {
  const idx = PLAN_ORDER.indexOf(planCode as (typeof PLAN_ORDER)[number]);
  return flags.filter((f) => PLAN_ORDER.indexOf(f.min_plan as (typeof PLAN_ORDER)[number]) !== -1 && PLAN_ORDER.indexOf(f.min_plan as (typeof PLAN_ORDER)[number]) <= idx).map((f) => f.key);
}

/** Narxlar va kalitlar — konfiguratsiyadan (plans.json, feature_flags.json); kodda emas. Idempotent. */
export async function seed(databaseUrl: string, dir = SEED_DIR): Promise<void> {
  const plansJson = JSON.parse(readFileSync(join(dir, "plans.json"), "utf8")) as { plans: PlanJson[] };
  const flagsJson = JSON.parse(readFileSync(join(dir, "feature_flags.json"), "utf8")) as { flags: FlagJson[] };
  const c = new Client({ connectionString: databaseUrl });
  await c.connect();
  try {
    await c.query("begin");
    for (const [i, f] of flagsJson.flags.entries()) {
      await c.query(
        `insert into feature_flags (key, description, min_plan, default_on_for_shop, toggled_by, requires, platform_enabled, position)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         on conflict (key) do update set description = excluded.description, min_plan = excluded.min_plan,
           default_on_for_shop = excluded.default_on_for_shop, toggled_by = excluded.toggled_by, requires = excluded.requires, position = excluded.position`,
        [f.key, f.description, f.min_plan, f.default_on_for_shop ?? true, f.toggled_by, f.requires, !PLATFORM_OFF_BY_DEFAULT.has(f.key), i],
      );
    }
    for (const p of plansJson.plans) {
      const price = typeof p.price_uzs_month === "number" ? p.price_uzs_month * 100 : null; // so'm -> tiyin (butun)
      const limits = { orders_month: p.orders_month, branches: p.branches, staff: p.staff, integrations: typeof p.integrations === "number" ? p.integrations : null };
      const ex = await c.query<{ id: string }>("select id from plans where code = $1 and version = 1", [p.code]);
      if (ex.rowCount) continue; // mavjud versiyani qayta yozmaymiz (F-4)
      const ins = await c.query<{ id: string }>(
        `insert into plans (code, version, name, status, price_tiyin, limits, published_at) values ($1, 1, $2, 'published', $3, $4, now()) returning id`,
        [p.code, p.name, price, JSON.stringify(limits)],
      );
      for (const key of planFeatureKeys(flagsJson.flags, p.code)) {
        await c.query("insert into plan_features (plan_id, feature_key) values ($1, $2)", [ins.rows[0]!.id, key]);
      }
    }
    await c.query("commit");
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    await c.end();
  }
}
