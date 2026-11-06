import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { Clock } from "../../common/clock";
import { randomToken, sha256 } from "../../common/crypto";
import { ApiError } from "../../common/errors";
import { CONFIG, type Config } from "../../config";
import { DbService, type Tx } from "../../db/db.service";
import { AuditService } from "../audit-events/audit.service";
import { maskPhone } from "../identity/identity.service";
import { slugify } from "../orders/slug";
import { SMS_SENDER, type SmsSender } from "../identity/sms.sender";
import { effectivePlan, nextPlan, type EffectivePlan, type TenantPlanRef } from "../plans-flags/plans";
import { FeaturesService } from "../plans-flags/features.service";
import { LegalService, type ConsentInput } from "../legal/legal.service";
import { EventsService } from "../audit-events/events.service";

export const INVITE_TTL_MS = 72 * 3600 * 1000;

interface TenantRow extends TenantPlanRef { id: string; name: string; slug: string; tin: string; status: string; created_at: Date }
const tenantDto = (t: TenantRow) => ({ id: t.id, name: t.name, slug: t.slug, tin: t.tin, status: t.status, plan: { code: t.plan_code, version: t.plan_version }, created_at: t.created_at });

@Injectable()
export class TenancyService {
  constructor(private readonly db: DbService, private readonly clock: Clock, private readonly audit: AuditService,
              @Inject(SMS_SENDER) private readonly sms: SmsSender, @Inject(CONFIG) private readonly cfg: Config,
              private readonly features: FeaturesService, private readonly legal: LegalService, private readonly events: EventsService) {}

  // ---------------------------------------------------------------- T-1
  async createTenant(userId: string, d: { name: string; tin: string; consents?: ConsentInput[] }, ip?: string | null) {
    const id = randomUUID();
    return this.db.tx({ userId, tenantId: id }, async (tx) => {
      // Do'kon egasi SaaS ofertasi va DPA ni qabul qilishi shart (Onboard-Shop, 4-qadam); javob oldidan hech narsa yozilmaydi.
      const ev = await this.legal.evaluate(tx, { tenantId: id }, "shop", d.consents);
      if (ev.missing.length && this.cfg.OPEN_LOGIN !== "on") throw new ApiError(422, "consent.required", { documents: ev.missing, scope: "shop" });
      const plan = (await tx.query<{ version: number }>("select version from plans where code = 'start' and status = 'published' order by version desc limit 1")).rows[0];
      if (!plan) throw new ApiError(500, "internal_error", { reason: "start_plan_missing" });
      // Vitrina havolasi: nomdan, band bo'lsa -2, -3 ... Sinov rejimida KYC o'tkazib yuboriladi: do'kon darhol faol (vitrina ochiq).
      const base = slugify(d.name);
      let slug = base;
      await tx.query("select set_config('app.platform', 'on', true)"); // slug butun platforma bo'yicha yagona: RLS'siz qisqa tekshiruv (faqat shu so'rov)
      for (let n = 2; (await tx.query("select 1 from tenants where slug = $1", [slug])).rowCount; n++) slug = `${base.slice(0, 36)}-${n}`;
      await tx.query("select set_config('app.platform', 'off', true)");
      const t = (await tx.query<TenantRow>(
        `insert into tenants (id, name, slug, tin, status, plan_code, plan_version, created_at, updated_at) values ($1,$2,$3,$4,$5,'start',$6,$7,$7) returning *`,
        [id, d.name, slug, d.tin, this.cfg.OPEN_LOGIN === "on" ? "active" : "draft", plan.version, this.clock.now()])).rows[0]!;
      const m = (await tx.query<{ id: string }>("insert into memberships (tenant_id, user_id, role) values ($1,$2,'owner') returning id", [id, userId])).rows[0]!;
      await this.audit.record(tx, { tenantId: id, actorId: userId, action: "tenant.created", entity: "tenant", entityId: id, after: { name: d.name, plan: "start" }, ip });
      await this.audit.record(tx, { tenantId: id, actorId: userId, action: "member.role_set", entity: "membership", entityId: m.id, after: { role: "owner" }, ip });
      for (const c of ev.toRecord) {
        await tx.query(`insert into consents (user_id, tenant_id, document, version, action, channel, ip, text_hash, created_at) values ($1,$2,$3,$4,'accepted','panel',$5,$6,$7)`,
          [userId, id, c.key, String(c.version), cleanIp(ip), c.text_hash, this.clock.now()]);
        await this.events.emit(tx, "consent.accepted", { document: c.key, version: String(c.version), channel: "panel" }, { tenantId: id, actorId: userId, source: "panel" });
      }
      await this.audit.record(tx, { tenantId: id, actorId: userId, action: "consent.accepted", entity: "tenant", entityId: id, after: { documents: ev.toRecord.map((c) => `${c.key}@${c.version}`) }, ip });
      return tenantDto(t);
    });
  }

  async getTenant(tenantId: string, userId: string) {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      const t = (await tx.query<TenantRow>("select * from tenants where id = $1", [tenantId])).rows[0];
      if (!t) throw new ApiError(404, "not_found");
      return tenantDto(t);
    });
  }

  async updateTenant(tenantId: string, userId: string, d: { name?: string; tin?: string; status?: "active" }, ip?: string | null) {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      const before = (await tx.query<TenantRow>("select * from tenants where id = $1 for update", [tenantId])).rows[0];
      if (!before) throw new ApiError(404, "not_found");
      const after = (await tx.query<TenantRow>(
        `update tenants set name = coalesce($2, name), tin = coalesce($3, tin), status = coalesce($4, status), updated_at = $5 where id = $1 returning *`,
        [tenantId, d.name ?? null, d.tin ?? null, d.status ?? null, this.clock.now()])).rows[0]!;
      await this.audit.record(tx, { tenantId, actorId: userId, action: "tenant.updated", entity: "tenant", entityId: tenantId,
        before: { name: before.name, tin: before.tin, status: before.status }, after: { name: after.name, tin: after.tin, status: after.status }, ip });
      return tenantDto(after);
    });
  }

  // ---------------------------------------------------------------- limitlar (T-5)
  private async plan(tx: Tx, tenantId: string): Promise<EffectivePlan> {
    const t = (await tx.query<TenantPlanRef>("select plan_code, plan_version, plan_migrate_at from tenants where id = $1", [tenantId])).rows[0]!;
    return effectivePlan(tx, t, this.clock.now());
  }

  private limitError(plan: EffectivePlan, resource: "staff" | "branches", max: number, used: number) {
    const next = nextPlan(plan.code);
    return new ApiError(403, "plan.limit_reached", { resource, limit: max, used, plan: plan.code, next_plan: next, upgrade: next !== plan.code },
      { resource, limit: max, next_plan: next.charAt(0).toUpperCase() + next.slice(1) });
  }

  /** Xodim soni: faol + to'xtatilgan a'zolar (egasi bilan, Z17) + kutilayotgan takliflar. */
  private async staffUsed(tx: Tx, tenantId: string): Promise<number> {
    const r = await tx.query<{ n: string }>(
      `select ((select count(*) from memberships where tenant_id = $1) + (select count(*) from invites where tenant_id = $1 and status = 'pending' and expires_at > $2)) as n`,
      [tenantId, this.clock.now()]);
    return Number(r.rows[0]!.n);
  }

  // ---------------------------------------------------------------- filial
  async listBranches(tenantId: string, userId: string) {
    return this.db.tx({ tenantId, userId }, async (tx) => ({ items: (await tx.query("select id, name, address, lat, lng from branches where tenant_id = $1 order by created_at", [tenantId])).rows }));
  }

  async createBranch(tenantId: string, userId: string, d: { name: string; address: string; lat?: number; lng?: number }, ip?: string | null) {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      await tx.query("select 1 from tenants where id = $1 for update", [tenantId]); // limit poygasi: tenant qatorini qulflaymiz
      const plan = await this.plan(tx, tenantId);
      const used = Number((await tx.query<{ n: string }>("select count(*) as n from branches where tenant_id = $1", [tenantId])).rows[0]!.n);
      if (plan.limits.branches !== null && used >= plan.limits.branches) throw this.limitError(plan, "branches", plan.limits.branches, used);
      const b = (await tx.query("insert into branches (tenant_id, name, address, lat, lng) values ($1,$2,$3,$4,$5) returning id, name, address, lat, lng", [tenantId, d.name, d.address, d.lat ?? null, d.lng ?? null])).rows[0]!;
      await this.audit.record(tx, { tenantId, actorId: userId, action: "branch.created", entity: "branch", entityId: b.id, after: { name: d.name }, ip });
      return b;
    });
  }

  // ---------------------------------------------------------------- T-3, T-5
  async createInvite(tenantId: string, userId: string, d: { phone: string; role: string }, ip?: string | null) {
    const token = randomToken(32);
    const now = this.clock.now();
    const out = await this.db.tx({ tenantId, userId }, async (tx) => {
      await tx.query("select 1 from tenants where id = $1 for update", [tenantId]); // parallel takliflar limitdan oshmasin
      const plan = await this.plan(tx, tenantId);
      const used = await this.staffUsed(tx, tenantId);
      if (plan.limits.staff !== null && used >= plan.limits.staff) throw this.limitError(plan, "staff", plan.limits.staff, used);
      const already = await tx.query("select 1 from memberships m join users u on u.id = m.user_id where m.tenant_id = $1 and u.phone = $2", [tenantId, d.phone]);
      if (already.rowCount) throw new ApiError(409, "invite.already_member");
      await tx.query("update invites set status = 'expired' where tenant_id = $1 and phone = $2 and status = 'pending'", [tenantId, d.phone]);
      const inv = (await tx.query<{ id: string; expires_at: Date }>(
        `insert into invites (tenant_id, phone, role, token_hash, invited_by, expires_at, created_at) values ($1,$2,$3,$4,$5,$6,$7) returning id, expires_at`,
        [tenantId, d.phone, d.role, sha256(token), userId, new Date(now.getTime() + INVITE_TTL_MS), now])).rows[0]!;
      await this.audit.record(tx, { tenantId, actorId: userId, action: "invite.created", entity: "invite", entityId: inv.id, after: { role: d.role }, ip });
      return { id: inv.id, role: d.role, phone_masked: maskPhone(d.phone), status: "pending", expires_at: inv.expires_at };
    });
    await this.sms.send(d.phone, `Dostavka: sizni jamoaga taklif qilishdi. Qabul qilish: ${this.cfg.APP_BASE_URL}/taklif/${token} (72 soat amal qiladi)`);
    return out;
  }

  async listInvites(tenantId: string, userId: string) {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      const r = await tx.query<{ id: string; role: string; phone: string; status: string; expires_at: Date }>(
        "select id, role, phone, status, expires_at from invites where tenant_id = $1 and status = 'pending' and expires_at > $2 order by created_at", [tenantId, this.clock.now()]);
      return { items: r.rows.map((i) => ({ id: i.id, role: i.role, phone_masked: maskPhone(i.phone), status: i.status, expires_at: i.expires_at })) };
    });
  }

  async acceptInvite(userId: string, token: string, ip?: string | null) {
    const hash = sha256(token);
    const now = this.clock.now();
    type Out = { k: "ok"; member: unknown } | { k: "expired" } | { k: "invalid" };
    const out = await this.db.tx<Out>({ userId, inviteHash: hash }, async (tx) => {
      const inv = (await tx.query<{ id: string; tenant_id: string; phone: string; role: string; status: string; expires_at: Date }>(
        "select id, tenant_id, phone, role, status, expires_at from invites where token_hash = $1 for update", [hash])).rows[0];
      if (!inv || inv.status === "expired") return { k: "invalid" };
      const me = (await tx.query<{ phone: string | null }>("select phone from users where id = $1", [userId])).rows[0];
      if (!me?.phone || me.phone !== inv.phone) return { k: "invalid" }; // boshqa raqamga yuborilgan taklif oshkor bo'lmaydi
      if (inv.status === "accepted") return { k: "invalid" };
      if (inv.expires_at <= now) return { k: "expired" };
      await tx.query("select set_config('app.tenant_id', $1, true)", [inv.tenant_id]);
      const exist = await tx.query("select 1 from memberships where tenant_id = $1 and user_id = $2", [inv.tenant_id, userId]);
      if (exist.rowCount) return { k: "invalid" };
      const m = (await tx.query<{ id: string; created_at: Date }>("insert into memberships (tenant_id, user_id, role) values ($1,$2,$3) returning id, created_at", [inv.tenant_id, userId, inv.role])).rows[0]!;
      await tx.query("update invites set status = 'accepted', accepted_at = $2 where id = $1", [inv.id, now]);
      await this.audit.record(tx, { tenantId: inv.tenant_id, actorId: userId, action: "member.joined", entity: "membership", entityId: m.id, after: { role: inv.role }, ip });
      return { k: "ok", member: { id: m.id, user_id: userId, tenant_id: inv.tenant_id, role: inv.role, status: "active", phone_masked: maskPhone(me.phone), created_at: m.created_at } };
    });
    if (out.k === "expired") throw new ApiError(410, "invite.expired");
    if (out.k === "invalid") throw new ApiError(404, "invite.invalid");
    return out.member;
  }

  // ---------------------------------------------------------------- a'zolar (T-6)
  async listMembers(tenantId: string, userId: string, limit: number, cursor?: string) {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      let after: { at: string; id: string } | null = null;
      if (cursor) {
        try { after = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")); } catch { throw new ApiError(400, "validation.failed", { issues: [{ path: "cursor", message: "noto'g'ri kursor" }] }); }
      }
      const r = await tx.query<{ id: string; user_id: string; tenant_id: string; role: string; status: string; phone: string | null; created_at: Date; cur_at: string }>(
        `select m.id, m.user_id, m.tenant_id, m.role, m.status, u.phone, m.created_at,
                to_char(m.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cur_at from memberships m join users u on u.id = m.user_id
         where m.tenant_id = $1 and ($2::timestamptz is null or (m.created_at, m.id) > ($2::timestamptz, $3::uuid))
         order by m.created_at, m.id limit $4`, [tenantId, after?.at ?? null, after?.id ?? null, limit + 1]);
      const page = r.rows.slice(0, limit);
      const last = page[page.length - 1];
      const next = r.rows.length > limit && last ? Buffer.from(JSON.stringify({ at: last.cur_at, id: last.id })).toString("base64url") : null;
      const plan = await this.plan(tx, tenantId);
      return {
        items: page.map((m) => ({ id: m.id, user_id: m.user_id, tenant_id: m.tenant_id, role: m.role, status: m.status, phone_masked: maskPhone(m.phone), created_at: m.created_at })),
        next_cursor: next,
        limit: { used: await this.staffUsed(tx, tenantId), max: plan.limits.staff },
      };
    });
  }

  async updateMember(tenantId: string, actorId: string, memberId: string, d: { role?: string; status?: string }, ip?: string | null) {
    return this.db.tx({ tenantId, userId: actorId }, async (tx) => {
      const m = (await tx.query<{ id: string; user_id: string; role: string; status: string }>("select id, user_id, role, status from memberships where id = $1 and tenant_id = $2 for update", [memberId, tenantId])).rows[0];
      if (!m) throw new ApiError(404, "not_found");
      if (d.role === "owner" && m.role !== "owner") throw new ApiError(400, "validation.failed", { issues: [{ path: "role", message: "egalikni berish S0 doirasida emas" }] });
      const losesOwner = m.role === "owner" && m.status === "active" && ((d.role && d.role !== "owner") || d.status === "suspended");
      if (losesOwner) {
        const others = await tx.query("select 1 from memberships where tenant_id = $1 and role = 'owner' and status = 'active' and id <> $2", [tenantId, memberId]);
        if (!others.rowCount) throw new ApiError(409, "member.last_owner");
      }
      const u = (await tx.query<{ id: string; user_id: string; tenant_id: string; role: string; status: string; created_at: Date }>(
        "update memberships set role = coalesce($3, role), status = coalesce($4, status), updated_at = $5 where id = $1 and tenant_id = $2 returning id, user_id, tenant_id, role, status, created_at",
        [memberId, tenantId, d.role ?? null, d.status ?? null, this.clock.now()])).rows[0]!;
      await this.audit.record(tx, { tenantId, actorId, action: "member.updated", entity: "membership", entityId: memberId, before: { role: m.role, status: m.status }, after: { role: u.role, status: u.status }, ip });
      return { ...u, phone_masked: null };
    });
  }

  async limitsOf(tenantId: string) {
    return this.features.resolved(tenantId).then((r) => r.plan.limits);
  }
}

function cleanIp(ip?: string | null): string | null {
  if (!ip) return null;
  const v = ip.replace(/^::ffff:/, "");
  return /^[0-9a-fA-F:.]+$/.test(v) ? v : null;
}
