import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { Clock } from "../../common/clock";
import { ApiError } from "../../common/errors";
import { DbService } from "../../db/db.service";
import { AuditService } from "../audit-events/audit.service";
import { EventsService } from "../audit-events/events.service";
import { FeaturesService } from "./features.service";
import { PLAN_ORDER, type Limits } from "./plans";

export const GRACE_DAYS = 30;
const limit = z.number().int().nonnegative().nullable().optional();
export const planDraftDto = z.object({
  code: z.enum(PLAN_ORDER),
  name: z.string().min(1).max(60),
  price_tiyin: z.number().int().nonnegative().nullable().optional(),
  limits: z.object({ orders_month: limit, branches: limit, staff: limit, integrations: limit }).strict(),
  features: z.array(z.string()).max(100),
}).strict();
export type PlanDraft = z.infer<typeof planDraftDto>;

interface PlanRow { id: string; code: string; version: number; name: string; status: string; price_tiyin: string | null; limits: Limits; created_at: Date; published_at: Date | null }

@Injectable()
export class AdminPlansService {
  constructor(private readonly db: DbService, private readonly clock: Clock, private readonly audit: AuditService,
              private readonly events: EventsService, private readonly features: FeaturesService) {}

  private dto(p: PlanRow, features: string[]) {
    return { id: p.id, code: p.code, version: p.version, name: p.name, status: p.status, price_tiyin: p.price_tiyin === null ? null : Number(p.price_tiyin),
      limits: p.limits, features: features.sort(), published_at: p.published_at };
  }

  /** Ommaviy narxlar sahifasi: har paketning joriy nashr etilgan versiyasi (narx konfiguratsiyadan, kodda emas). */
  async publicPlans() {
    return this.db.tx({ platform: true }, async (tx) => {
      const plans = (await tx.query<PlanRow>("select distinct on (code) * from plans where status = 'published' order by code, version desc")).rows;
      const feats = await tx.query<{ plan_id: string; feature_key: string }>("select plan_id, feature_key from plan_features");
      const order = PLAN_ORDER as readonly string[];
      return plans.sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code))
        .map((p) => ({ code: p.code, name: p.name, price_tiyin: p.price_tiyin === null ? null : Number(p.price_tiyin), limits: p.limits, features: feats.rows.filter((f) => f.plan_id === p.id).map((f) => f.feature_key).sort() }));
    });
  }

  async list(actorId: string) {
    return this.db.tx({ userId: actorId, platform: true }, async (tx) => {
      const plans = (await tx.query<PlanRow>("select * from plans order by code, version")).rows;
      const feats = await tx.query<{ plan_id: string; feature_key: string }>("select plan_id, feature_key from plan_features");
      return plans.map((p) => this.dto(p, feats.rows.filter((f) => f.plan_id === p.id).map((f) => f.feature_key)));
    });
  }

  async createDraft(actorId: string, d: PlanDraft, ip?: string | null) {
    return this.db.tx({ userId: actorId, platform: true }, async (tx) => {
      const keys = (await tx.query<{ key: string }>("select key from feature_flags")).rows.map((r) => r.key);
      const unknown = d.features.filter((f) => !keys.includes(f));
      if (unknown.length) throw new ApiError(400, "validation.failed", { issues: unknown.map((u) => ({ path: "features", message: `noma'lum kalit: ${u}` })) });
      const v = await tx.query<{ v: number }>("select coalesce(max(version), 0) + 1 as v from plans where code = $1", [d.code]);
      const ins = await tx.query<PlanRow>(
        `insert into plans (code, version, name, status, price_tiyin, limits) values ($1,$2,$3,'draft',$4,$5) returning *`,
        [d.code, v.rows[0]!.v, d.name, d.price_tiyin ?? null, JSON.stringify({ orders_month: null, branches: null, staff: null, integrations: null, ...d.limits })]);
      const plan = ins.rows[0]!;
      for (const f of new Set(d.features)) await tx.query("insert into plan_features (plan_id, feature_key) values ($1,$2)", [plan.id, f]);
      await this.audit.record(tx, { actorId, action: "plan.draft_created", entity: "plan", entityId: plan.id, after: { code: d.code, version: plan.version }, ip });
      return this.dto(plan, [...new Set(d.features)]);
    });
  }

  /**
   * F-4: chop etish. Funksiya/limit kamaytirilgan bo'lsa — eski versiyadagi do'konlarga 30 kunlik ogohlantirish
   * (`plan_migrate_at`), shu vaqtgacha eski shartlar. Kamaytirilmagan bo'lsa — darhol yangi versiyaga o'tadi.
   */
  async publish(actorId: string, planId: string, ip?: string | null) {
    const res = await this.db.tx({ userId: actorId, platform: true }, async (tx) => {
      const p = (await tx.query<PlanRow>("select * from plans where id = $1 for update", [planId])).rows[0];
      if (!p) throw new ApiError(404, "not_found");
      if (p.status !== "draft") throw new ApiError(409, "validation.failed", { reason: "only_draft_can_be_published" });
      const prev = (await tx.query<PlanRow>("select * from plans where code = $1 and status = 'published' order by version desc limit 1 for update", [p.code])).rows[0];
      const newFeatures = new Set((await tx.query<{ feature_key: string }>("select feature_key from plan_features where plan_id = $1", [p.id])).rows.map((r) => r.feature_key));
      const now = this.clock.now();
      await tx.query("update plans set status = 'published', published_at = $2 where id = $1", [p.id, now]);

      let scheduled = 0, moved = 0;
      if (prev) {
        await tx.query("update plans set status = 'archived' where id = $1", [prev.id]);
        const oldFeatures = (await tx.query<{ feature_key: string }>("select feature_key from plan_features where plan_id = $1", [prev.id])).rows.map((r) => r.feature_key);
        const removed = oldFeatures.filter((f) => !newFeatures.has(f));
        const lowered = (Object.keys(prev.limits) as (keyof Limits)[]).some((k) => {
          const o = prev.limits[k], n = p.limits[k];
          return o === null ? n !== null : n !== null && n < o;
        });
        const tenants = (await tx.query<{ id: string; plan_version: number }>("select id, plan_version from tenants where plan_code = $1 and plan_version < $2 and plan_migrate_at is null", [p.code, p.version])).rows;
        for (const t of tenants) {
          if (removed.length || lowered) {
            const at = new Date(now.getTime() + GRACE_DAYS * 24 * 3600 * 1000);
            await tx.query("update tenants set plan_migrate_at = $2, updated_at = $3 where id = $1", [t.id, at, now]);
            await this.events.emit(tx, "plan.changed", { old: `${p.code}@${t.plan_version}`, new: `${p.code}@${p.version}`, migrate_at: at.toISOString() }, { tenantId: t.id, actorId, source: "panel" });
            await this.audit.record(tx, { tenantId: t.id, actorId, action: "plan.migration_scheduled", entity: "tenant", entityId: t.id, before: { version: t.plan_version }, after: { version: p.version, migrate_at: at.toISOString(), removed } });
            scheduled++;
          } else {
            await tx.query("update tenants set plan_version = $2, updated_at = $3 where id = $1", [t.id, p.version, now]);
            await this.events.emit(tx, "plan.changed", { old: `${p.code}@${t.plan_version}`, new: `${p.code}@${p.version}` }, { tenantId: t.id, actorId, source: "panel" });
            moved++;
          }
        }
      }
      await this.audit.record(tx, { actorId, action: "plan.published", entity: "plan", entityId: p.id, after: { code: p.code, version: p.version, scheduled, moved }, ip });
      const fresh = (await tx.query<PlanRow>("select * from plans where id = $1", [p.id])).rows[0]!;
      return this.dto(fresh, [...newFeatures]);
    });
    await this.features.invalidateAll();
    return res;
  }

  /** Billing (S7) tayyor bo'lguncha paketni platforma admini o'zgartiradi. */
  async setTenantPlan(actorId: string, tenantId: string, planCode: string, ip?: string | null) {
    const out = await this.db.tx({ userId: actorId, platform: true, tenantId }, async (tx) => {
      const t = (await tx.query<{ id: string; plan_code: string; plan_version: number }>("select id, plan_code, plan_version from tenants where id = $1 for update", [tenantId])).rows[0];
      if (!t) throw new ApiError(404, "not_found");
      const plan = (await tx.query<{ version: number }>("select version from plans where code = $1 and status = 'published' order by version desc limit 1", [planCode])).rows[0];
      if (!plan) throw new ApiError(404, "not_found");
      await tx.query("update tenants set plan_code = $2, plan_version = $3, plan_migrate_at = null, updated_at = $4 where id = $1", [tenantId, planCode, plan.version, this.clock.now()]);
      await this.events.emit(tx, "plan.changed", { old: `${t.plan_code}@${t.plan_version}`, new: `${planCode}@${plan.version}` }, { tenantId, actorId, source: "panel" });
      await this.audit.record(tx, { tenantId, actorId, action: "plan.changed", entity: "tenant", entityId: tenantId, before: { plan_code: t.plan_code, plan_version: t.plan_version }, after: { plan_code: planCode, plan_version: plan.version }, ip });
      return (await tx.query("select id, name, slug, tin, status, plan_code, plan_version, created_at from tenants where id = $1", [tenantId])).rows[0]!;
    });
    await this.features.invalidate(tenantId);
    return { id: out.id, name: out.name, slug: out.slug, tin: out.tin, status: out.status, plan: { code: out.plan_code, version: out.plan_version }, created_at: out.created_at };
  }
}
