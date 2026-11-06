import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { z } from "zod";
import { ApiError } from "../../common/errors";
import { CONFIG, type Config } from "../../config";
import { DbService, type Tx } from "../../db/db.service";
import { RedisService } from "../../redis.service";
import { AuditService } from "../audit-events/audit.service";
import { EventsService } from "../audit-events/events.service";
import { ADAPTERS, PaymentsService, type PaymentRow } from "../payments/payments.service";
import { OrdersService } from "./orders.service";
import { StorefrontService } from "./storefront.service";

const payloadDto = z.object({ event_id: z.string().min(1).max(100), payment_id: z.string().uuid(), type: z.enum(["authorized", "captured", "failed"]), amount_tiyin: z.number().int().positive(), reason: z.string().max(60).optional() }).strict();
type Payload = z.infer<typeof payloadDto>;
type Outcome = { code: number; body: Record<string, unknown>; outcome: string };

/** Onlayn to'lov holat mashinasi: webhook (imzo + takrorlanmaslik), sandbox, qaytarish, muddati o'tish. Pul platformadan o'tmaydi — faqat holat yozuvi. */
@Injectable()
export class PaymentFlowService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger("Payments");
  private timer?: NodeJS.Timeout;
  constructor(private readonly db: DbService, private readonly shops: StorefrontService, private readonly payments: PaymentsService, private readonly orders: OrdersService,
              private readonly events: EventsService, private readonly audit: AuditService, private readonly redis: RedisService, @Inject(CONFIG) private readonly cfg: Config) {}

  onApplicationBootstrap() {
    if (this.cfg.BACKGROUND_JOBS !== "on") return;
    this.timer = setInterval(() => void this.expireStale().catch((e) => this.log.error(String(e))), 60_000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  // ---------------------------------------------------------------- webhook
  async webhook(slug: string, provider: string, raw: Buffer, headers: Record<string, string | string[] | undefined>) {
    const shop = await this.shops.resolve(slug);
    const adapter = ADAPTERS[provider];
    if (!adapter) throw new ApiError(404, "not_found");
    const conf = await this.db.tx({ tenantId: shop.id }, (tx) => this.payments.secretOf(tx, shop.id));
    if (!conf || conf.provider !== provider || !adapter.available) throw new ApiError(404, "not_found");
    if (!adapter.verify(raw, headers, conf.secret)) throw new ApiError(401, "payment.bad_signature");
    let parsed: Payload;
    try { parsed = payloadDto.parse(JSON.parse(raw.toString("utf8"))); } catch { throw new ApiError(400, "validation.failed"); }
    const sha = createHash("sha256").update(raw).digest("hex");
    const out = await this.db.tx({ tenantId: shop.id }, (tx) => this.apply(tx, shop.id, provider, parsed, sha));
    if (out.code >= 400) throw new ApiError(out.code, String(out.body.code), {});
    return out.body;
  }

  /** Bitta tranzaksiya: takrorlanishni tekshirish -> yozuv -> o'tish. Xatolik holatlari javob sifatida qaytadi (jurnal saqlanadi). */
  private async apply(tx: Tx, tenantId: string, provider: string, p: Payload, sha: string): Promise<Outcome> {
    const ins = await tx.query("insert into payment_webhook_events (tenant_id, provider, event_id, payment_id, type, payload_sha256, outcome) values ($1,$2,$3,$4,$5,$6,'received') on conflict (tenant_id, provider, event_id) do nothing returning id", [tenantId, provider, p.event_id, p.payment_id, p.type, sha]);
    if (!ins.rowCount) return { code: 200, body: { ok: true, duplicate: true }, outcome: "duplicate" };
    const id = ins.rows[0].id as string;
    const done = async (o: Outcome) => { await tx.query("update payment_webhook_events set outcome = $2 where id = $1", [id, o.outcome]); return o; };
    const pay = (await tx.query<PaymentRow>("select id, order_id, provider, status, amount_tiyin, refunded_tiyin, failure_reason, expires_at from payments where id = $1 and tenant_id = $2 and provider = $3 for update", [p.payment_id, tenantId, provider])).rows[0];
    if (!pay) return { code: 404, body: { code: "not_found" }, outcome: "unknown_payment" };
    if (Number(pay.amount_tiyin) !== p.amount_tiyin) return { code: 422, body: { code: "payment.amount_mismatch" }, outcome: "amount_mismatch" };
    const ctx = { tenantId, actorId: null, source: "panel" as const };
    const amount = Number(pay.amount_tiyin);

    if (p.type === "authorized") {
      if (pay.status !== "pending") return done({ code: 200, body: { ok: true, ignored: pay.status }, outcome: "ignored" });
      await tx.query("update payments set status = 'authorized', updated_at = now() where id = $1", [pay.id]);
      await this.events.emit(tx, "payment.authorized", { provider, amount_tiyin: amount }, ctx);
      return done({ code: 200, body: { ok: true }, outcome: "authorized" });
    }
    if (p.type === "captured") {
      if (pay.status === "captured") return done({ code: 200, body: { ok: true, ignored: "captured" }, outcome: "ignored" });
      const late = pay.status === "failed" || pay.status === "cancelled"; // buyurtma allaqachon bekor bo'lgan: pul olingan — to'liq qaytariladi
      await tx.query("update payments set status = 'captured', updated_at = now() where id = $1", [pay.id]);
      await this.events.emit(tx, "payment.captured", { provider, amount_tiyin: amount }, ctx);
      if (late) { await this.payments.applyRefund(tx, tenantId, pay, amount, null, "late_capture"); return done({ code: 200, body: { ok: true, refunded: true }, outcome: "late_capture_refunded" }); }
      return done({ code: 200, body: { ok: true }, outcome: "captured" });
    }
    // failed
    if (pay.status !== "pending" && pay.status !== "authorized") return done({ code: 200, body: { ok: true, ignored: pay.status }, outcome: "ignored" });
    await tx.query("update payments set status = 'failed', failure_reason = $2, updated_at = now() where id = $1", [pay.id, p.reason ?? "provider_failed"]);
    await this.events.emit(tx, "payment.failed", { provider, amount_tiyin: amount, reason: (p.reason ?? "provider_failed").slice(0, 60) }, ctx);
    await this.cancelOrderIfOpen(tx, tenantId, pay.order_id, "to'lov amalga oshmadi");
    return done({ code: 200, body: { ok: true }, outcome: "failed" });
  }

  private async cancelOrderIfOpen(tx: Tx, tenantId: string, orderId: string, reason: string) {
    const o = (await tx.query<{ status: string }>("select status from orders where id = $1 and tenant_id = $2 for update", [orderId, tenantId])).rows[0];
    if (o && (o.status === "placed" || o.status === "accepted")) await this.orders.transition(tx, tenantId, null as unknown as string, orderId, "cancelled", reason, false);
  }

  // ---------------------------------------------------------------- sandbox (provayder o'rniga: faqat mock)
  async sandboxPay(slug: string, userId: string, paymentId: string, outcome: "captured" | "failed") {
    if (this.cfg.NODE_ENV === "production" && process.env.SANDBOX_PAYMENTS !== "on") throw new ApiError(404, "not_found");
    const shop = await this.shops.resolve(slug);
    return this.db.tx({ tenantId: shop.id, userId }, async (tx) => {
      const p = (await tx.query<PaymentRow & { customer_id: string }>("select p.id, p.order_id, p.provider, p.status, p.amount_tiyin, p.refunded_tiyin, p.failure_reason, p.expires_at, o.customer_id from payments p join orders o on o.id = p.order_id and o.tenant_id = p.tenant_id where p.id = $1 and p.tenant_id = $2", [paymentId, shop.id])).rows[0];
      if (!p || p.customer_id !== userId || p.provider !== "mock") throw new ApiError(404, "not_found");
      const out = await this.apply(tx, shop.id, "mock", { event_id: `sandbox-${randomUUID()}`, payment_id: paymentId, type: outcome, amount_tiyin: Number(p.amount_tiyin), ...(outcome === "failed" ? { reason: "sandbox_declined" } : {}) }, "sandbox");
      return out.body;
    });
  }

  // ---------------------------------------------------------------- qaytarish (moliya)
  async refund(tenantId: string, userId: string, orderId: string, amount: number | undefined, reason: string, ip?: string | null) {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      const p = (await tx.query<PaymentRow>("select id, order_id, provider, status, amount_tiyin, refunded_tiyin, failure_reason, expires_at from payments where order_id = $1 and tenant_id = $2 and status = 'captured' for update", [orderId, tenantId])).rows[0];
      if (!p) throw new ApiError(404, "not_found");
      const rest = Number(p.amount_tiyin) - Number(p.refunded_tiyin);
      const a = amount ?? rest;
      if (a <= 0 || a > rest) throw new ApiError(422, "payment.refund_exceeds", { refundable_tiyin: rest }, { max: Math.round(rest / 100) });
      await this.payments.applyRefund(tx, tenantId, p, a, userId, reason);
      await this.audit.record(tx, { tenantId, actorId: userId, action: "payment.refunded", entity: "order", entityId: orderId, after: { amount_tiyin: a, reason }, ip });
      return this.payments.view({ ...p, refunded_tiyin: String(Number(p.refunded_tiyin) + a) });
    });
  }

  // ---------------------------------------------------------------- muddati o'tish
  async expireStale(): Promise<number> {
    if (!(await this.redis.client.set("job:payments:expire", "1", "EX", 50, "NX"))) return 0;
    const due = await this.db.tx({ platform: true }, (tx) => tx.query<{ id: string; tenant_id: string; order_id: string }>("select id, tenant_id, order_id from payments where status = 'pending' and expires_at < now() limit 200"));
    let n = 0;
    for (const d of due.rows) {
      await this.db.tx({ tenantId: d.tenant_id }, async (tx) => {
        const p = (await tx.query<{ status: string; provider: string; amount_tiyin: string }>("select status, provider, amount_tiyin from payments where id = $1 and tenant_id = $2 and status = 'pending' for update", [d.id, d.tenant_id])).rows[0];
        if (!p) return;
        await tx.query("update payments set status = 'failed', failure_reason = 'expired', updated_at = now() where id = $1", [d.id]);
        await this.events.emit(tx, "payment.failed", { provider: p.provider, amount_tiyin: Number(p.amount_tiyin), reason: "expired" }, { tenantId: d.tenant_id, actorId: null, source: "panel" });
        await this.cancelOrderIfOpen(tx, d.tenant_id, d.order_id, "to'lov muddati o'tdi");
        n++;
      });
    }
    return n;
  }
}
