import type { Tx } from "../../db/db.service";

export const PLAN_ORDER = ["start", "biznes", "pro", "tarmoq"] as const;
export type PlanCode = (typeof PLAN_ORDER)[number];

export interface Limits { orders_month: number | null; branches: number | null; staff: number | null; integrations: number | null }
export interface EffectivePlan {
  id: string;
  code: PlanCode;
  version: number;
  name: string;
  price_tiyin: number | null;
  limits: Limits;
  features: Set<string>;
  migrate_at: Date | null;
}

export interface TenantPlanRef { plan_code: string; plan_version: number; plan_migrate_at: Date | null }

export const nextPlan = (code: string): PlanCode => PLAN_ORDER[Math.min(PLAN_ORDER.indexOf(code as PlanCode) + 1, PLAN_ORDER.length - 1)]!;

/**
 * Do'konning amaldagi paketi. F-4: yangi versiya funksiyani olib tashlagan bo'lsa, do'kon `plan_migrate_at` gacha
 * eski versiyada qoladi; sana o'tgach avtomatik so'nggi chop etilgan versiyaga o'tadi (hisoblanadi).
 */
export async function effectivePlan(tx: Tx, t: TenantPlanRef, now: Date): Promise<EffectivePlan> {
  const migrated = t.plan_migrate_at !== null && now >= t.plan_migrate_at;
  const q = migrated
    ? await tx.query(`select id, code, version, name, price_tiyin, limits from plans where code = $1 and status = 'published' order by version desc limit 1`, [t.plan_code])
    : await tx.query(`select id, code, version, name, price_tiyin, limits from plans where code = $1 and version = $2`, [t.plan_code, t.plan_version]);
  const p = q.rows[0];
  if (!p) throw new Error(`Paket topilmadi: ${t.plan_code} v${t.plan_version}`);
  const f = await tx.query<{ feature_key: string }>("select feature_key from plan_features where plan_id = $1", [p.id]);
  return {
    id: p.id, code: p.code, version: p.version, name: p.name,
    price_tiyin: p.price_tiyin === null ? null : Number(p.price_tiyin),
    limits: { orders_month: null, branches: null, staff: null, integrations: null, ...p.limits },
    features: new Set(f.rows.map((r) => r.feature_key)),
    migrate_at: migrated ? null : t.plan_migrate_at,
  };
}
