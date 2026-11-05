import { Injectable } from "@nestjs/common";
import { Clock } from "../../common/clock";
import { ApiError } from "../../common/errors";
import { DbService, type Tx } from "../../db/db.service";
import { RedisService } from "../../redis.service";
import { AuditService } from "../audit-events/audit.service";
import { EventsService } from "../audit-events/events.service";
import { effectivePlan, type EffectivePlan } from "./plans";

export const FEATURE_CACHE_TTL_MS = 60_000;
const EPOCH_KEY = "features:epoch";

interface FlagRow { key: string; description: string; min_plan: string; toggled_by: string; requires: string[]; platform_enabled: boolean; default_on_for_shop: boolean }

export interface FeatureState {
  key: string;
  enabled: boolean;
  platform_enabled: boolean;
  in_plan: boolean;
  shop_enabled: boolean;
  min_plan: string;
  requires: string[];
  blocked_by: string[];
  toggled_by: string;
}
export interface PlanSummary { code: string; version: number; name: string; price_tiyin: number | null; limits: EffectivePlan["limits"]; migrate_at: string | null }
export interface Resolved { plan: PlanSummary; items: FeatureState[] }

@Injectable()
export class FeaturesService {
  constructor(private readonly db: DbService, private readonly redis: RedisService, private readonly clock: Clock,
              private readonly audit: AuditService, private readonly events: EventsService) {}

  // ------------------------------------------------------------- can()
  /** can(tenant, key) = platforma ∧ paket ∧ do'kon (+ bog'liqliklar). Redis'da 60 soniya keshlanadi. */
  async can(tenantId: string, key: string): Promise<boolean> {
    const r = await this.resolved(tenantId);
    return r.items.find((i) => i.key === key)?.enabled ?? false;
  }

  async resolved(tenantId: string): Promise<Resolved> {
    const [raw, epoch] = await this.redis.client.mget(`features:t:${tenantId}`, EPOCH_KEY);
    if (raw) {
      const c = JSON.parse(raw) as { epoch: string | null; at: number; data: Resolved };
      if (c.epoch === (epoch ?? null) && this.clock.now().getTime() - c.at < FEATURE_CACHE_TTL_MS) return c.data;
    }
    const data = await this.db.tx({ tenantId }, (tx) => this.compute(tx, tenantId));
    await this.redis.client.set(`features:t:${tenantId}`, JSON.stringify({ epoch: epoch ?? null, at: this.clock.now().getTime(), data }), "EX", 60);
    return data;
  }

  async invalidate(tenantId: string) {
    await this.redis.client.del(`features:t:${tenantId}`);
  }
  /** Platforma yoki paket darajasidagi o'zgarish: barcha do'konlar keshi eskiradi. */
  async invalidateAll() {
    await this.redis.client.incr(EPOCH_KEY);
  }

  async compute(tx: Tx, tenantId: string): Promise<Resolved> {
    const t = await tx.query<{ plan_code: string; plan_version: number; plan_migrate_at: Date | null }>("select plan_code, plan_version, plan_migrate_at from tenants where id = $1", [tenantId]);
    if (!t.rows[0]) throw new ApiError(404, "not_found");
    const plan = await effectivePlan(tx, t.rows[0], this.clock.now());
    const flags = (await tx.query<FlagRow>("select key, description, min_plan, toggled_by, requires, platform_enabled, default_on_for_shop from feature_flags order by position, key")).rows;
    const shop = new Map((await tx.query<{ feature_key: string; enabled: boolean }>("select feature_key, enabled from tenant_features where tenant_id = $1", [tenantId])).rows.map((r) => [r.feature_key, r.enabled]));
    const byKey = new Map(flags.map((f) => [f.key, f]));
    const memo = new Map<string, boolean>();
    const effective = (key: string, stack: string[] = []): boolean => {
      if (memo.has(key)) return memo.get(key)!;
      const f = byKey.get(key);
      if (!f || stack.includes(key)) return false;
      const own = f.platform_enabled && plan.features.has(key) && (shop.get(key) ?? f.default_on_for_shop);
      const ok = own && f.requires.every((r) => effective(r, [...stack, key]));
      memo.set(key, ok);
      return ok;
    };
    const items: FeatureState[] = flags.map((f) => ({
      key: f.key,
      enabled: effective(f.key),
      platform_enabled: f.platform_enabled,
      in_plan: plan.features.has(f.key),
      shop_enabled: shop.get(f.key) ?? f.default_on_for_shop,
      min_plan: f.min_plan,
      requires: f.requires,
      blocked_by: f.requires.filter((r) => !effective(r)),
      toggled_by: f.toggled_by,
    }));
    return { plan: { code: plan.code, version: plan.version, name: plan.name, price_tiyin: plan.price_tiyin, limits: plan.limits, migrate_at: plan.migrate_at?.toISOString() ?? null }, items };
  }

  // ------------------------------------------------------------- PATCH /v1/features/{key}
  async toggle(tenantId: string, actorId: string, key: string, enabled: boolean, ip?: string | null): Promise<FeatureState> {
    const result = await this.db.tx({ tenantId, userId: actorId }, async (tx) => {
      const flag = (await tx.query<FlagRow>("select key, description, min_plan, toggled_by, requires, platform_enabled, default_on_for_shop from feature_flags where key = $1", [key])).rows[0];
      if (!flag) throw new ApiError(404, "feature.unknown");
      if (flag.toggled_by === "platform") throw new ApiError(403, "feature.not_toggleable");
      if (!flag.platform_enabled) throw new ApiError(403, "feature.platform_disabled");

      const before = await this.compute(tx, tenantId);
      const cur = before.items.find((i) => i.key === key)!;
      if (!cur.in_plan) throw new ApiError(403, "feature.not_in_plan", { min_plan: flag.min_plan }, { plan: planName(flag.min_plan) });

      if (enabled) {
        const missing = flag.requires.find((r) => !before.items.find((i) => i.key === r)?.enabled);
        if (missing) throw new ApiError(422, "feature.requires", { dependency: missing }, { dependency: missing });
      } else {
        // F-5: naqd yoqilgan bo'lsa, o'z kuryerlarini o'chirib bo'lmaydi.
        const dependent = before.items.find((i) => i.requires.includes(key) && i.shop_enabled && i.in_plan && i.platform_enabled);
        if (dependent) throw new ApiError(422, "feature.required_by", { dependent: dependent.key }, { dependent: dependent.key });
      }

      await tx.query(
        `insert into tenant_features (tenant_id, feature_key, enabled, changed_by, changed_at) values ($1,$2,$3,$4,$5)
         on conflict (tenant_id, feature_key) do update set enabled = excluded.enabled, changed_by = excluded.changed_by, changed_at = excluded.changed_at`,
        [tenantId, key, enabled, actorId, this.clock.now()]);
      // F-6: audit + hodisa
      await this.audit.record(tx, { tenantId, actorId, action: "feature.toggled", entity: "feature", entityId: key, before: { enabled: cur.shop_enabled }, after: { enabled }, ip });
      await this.events.emit(tx, "feature.toggled", { key, old: cur.shop_enabled, new: enabled }, { tenantId, actorId, source: "panel" });
      const after = await this.compute(tx, tenantId);
      return after.items.find((i) => i.key === key)!;
    });
    await this.invalidate(tenantId); // F-3: kesh darhol bekor qilinadi
    return result;
  }

  // ------------------------------------------------------------- admin: platforma kaliti (F-1)
  async setPlatformFlag(actorId: string, key: string, platformEnabled: boolean, ip?: string | null) {
    const out = await this.db.tx({ userId: actorId, platform: true }, async (tx) => {
      const r = await tx.query<FlagRow>("select key, description, min_plan, toggled_by, requires, platform_enabled, default_on_for_shop from feature_flags where key = $1 for update", [key]);
      const f = r.rows[0];
      if (!f) throw new ApiError(404, "feature.unknown");
      await tx.query("update feature_flags set platform_enabled = $2, updated_at = $3 where key = $1", [key, platformEnabled, this.clock.now()]);
      await this.audit.record(tx, { actorId, action: "flag.platform_toggled", entity: "feature", entityId: key, before: { platform_enabled: f.platform_enabled }, after: { platform_enabled: platformEnabled }, ip });
      await this.events.emit(tx, "feature.toggled", { key, old: f.platform_enabled, new: platformEnabled }, { actorId, source: "panel" });
      return { ...f, platform_enabled: platformEnabled };
    });
    await this.invalidateAll();
    return { key: out.key, description: out.description, platform_enabled: out.platform_enabled, min_plan: out.min_plan, toggled_by: out.toggled_by };
  }

  async listPlatformFlags(actorId: string) {
    return this.db.tx({ userId: actorId, platform: true }, async (tx) =>
      (await tx.query("select key, description, platform_enabled, min_plan, toggled_by from feature_flags order by key")).rows);
  }
}

const planName = (code: string) => (code === "v2" ? "v2" : code.charAt(0).toUpperCase() + code.slice(1));
