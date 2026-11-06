import { createHmac, timingSafeEqual } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors";
import { decrypt, encrypt } from "../../common/crypto";
import { CONFIG, type Config } from "../../config";
import { DbService, type Tx } from "../../db/db.service";
import { AuditService } from "../audit-events/audit.service";
import { EventsService } from "../audit-events/events.service";

export const PAYMENT_TTL_MS = 15 * 60_000;
export type PaymentStatus = "pending" | "authorized" | "captured" | "failed" | "cancelled";
export interface PaymentRow { id: string; order_id: string; provider: string; status: PaymentStatus; amount_tiyin: string; refunded_tiyin: string; failure_reason: string | null; expires_at: Date }

/**
 * Provayder adapteri: webhook imzosini tekshirish va to'lov havolasi. `mock` — sandbox/test uchun (HMAC-SHA256).
 * Payme (JSON-RPC, Basic auth), Click (md5 sign) va Uzum adapterlari provayder hujjatlari va merchant kalitlari bilan qo'shiladi
 * (`available: false` — sozlamada tanlab bo'lmaydi).
 */
export interface PaymentAdapter { name: string; available: boolean; verify(raw: Buffer, headers: Record<string, string | string[] | undefined>, secret: string): boolean; payUrl(slug: string, paymentId: string): string }

const mock: PaymentAdapter = {
  name: "mock", available: true,
  verify(raw, headers, secret) {
    const sig = headers["x-signature"];
    if (typeof sig !== "string" || !/^[0-9a-f]{64}$/.test(sig)) return false;
    const want = createHmac("sha256", secret).update(raw).digest();
    return timingSafeEqual(Buffer.from(sig, "hex"), want);
  },
  payUrl: (slug, id) => `/d/${slug}/tolov/${id}`,
};
const pending = (name: string): PaymentAdapter => ({ name, available: false, verify: () => false, payUrl: () => "" });
export const ADAPTERS: Record<string, PaymentAdapter> = { mock, payme: pending("payme"), click: pending("click"), uzum: pending("uzum") };

@Injectable()
export class PaymentsService {
  constructor(private readonly db: DbService, @Inject(CONFIG) private readonly cfg: Config, private readonly audit: AuditService, private readonly events: EventsService) {}

  // ---------------------------------------------------------------- sozlamalar (egasi)
  async getSettings(tenantId: string, userId: string) {
    const r = await this.db.tx({ tenantId, userId }, (tx) => tx.query<{ provider: string; merchant_id: string | null; secret_enc: string | null; enabled: boolean }>("select provider, merchant_id, secret_enc, enabled from tenant_payment_settings where tenant_id = $1", [tenantId]));
    const s = r.rows[0];
    return { provider: s?.provider ?? null, merchant_id: s?.merchant_id ?? null, enabled: s?.enabled ?? false, has_secret: Boolean(s?.secret_enc), available_providers: Object.values(ADAPTERS).filter((a) => a.available).map((a) => a.name) };
  }

  async setSettings(tenantId: string, userId: string, d: { provider: string; merchant_id?: string | null; secret?: string; enabled: boolean }, ip?: string | null) {
    const adapter = ADAPTERS[d.provider];
    if (!adapter?.available) throw new ApiError(422, "payment.provider_not_available");
    if (d.provider === "mock" && this.cfg.NODE_ENV === "production" && process.env.SANDBOX_PAYMENTS !== "on") throw new ApiError(422, "payment.provider_not_available");
    await this.db.tx({ tenantId, userId }, async (tx) => {
      const cur = (await tx.query<{ secret_enc: string | null }>("select secret_enc from tenant_payment_settings where tenant_id = $1", [tenantId])).rows[0];
      const secretEnc = d.secret ? encrypt(d.secret, this.cfg.DATA_ENCRYPTION_KEY) : cur?.secret_enc ?? null;
      if (d.enabled && !secretEnc) throw new ApiError(422, "payment.secret_required");
      await tx.query(
        `insert into tenant_payment_settings (tenant_id, provider, merchant_id, secret_enc, enabled, updated_at) values ($1,$2,$3,$4,$5,now())
         on conflict (tenant_id) do update set provider = $2, merchant_id = $3, secret_enc = $4, enabled = $5, updated_at = now()`, [tenantId, d.provider, d.merchant_id ?? null, secretEnc, d.enabled]);
      await this.audit.record(tx, { tenantId, actorId: userId, action: "payment.settings_changed", entity: "tenant", entityId: tenantId, after: { provider: d.provider, enabled: d.enabled, secret_changed: Boolean(d.secret) }, ip });
    });
    return this.getSettings(tenantId, userId);
  }

  /** Buyurtma berishda: onlayn to'lov yoqilgan va ishlaydigan provayder bormi. */
  async activeProvider(tx: Tx, tenantId: string): Promise<string | null> {
    const s = (await tx.query<{ provider: string; enabled: boolean; secret_enc: string | null }>("select provider, enabled, secret_enc from tenant_payment_settings where tenant_id = $1", [tenantId])).rows[0];
    return s?.enabled && s.secret_enc && ADAPTERS[s.provider]?.available ? s.provider : null;
  }
  async secretOf(tx: Tx, tenantId: string): Promise<{ provider: string; secret: string } | null> {
    const s = (await tx.query<{ provider: string; enabled: boolean; secret_enc: string | null }>("select provider, enabled, secret_enc from tenant_payment_settings where tenant_id = $1", [tenantId])).rows[0];
    return s?.enabled && s.secret_enc ? { provider: s.provider, secret: decrypt(s.secret_enc, this.cfg.DATA_ENCRYPTION_KEY) } : null;
  }

  // ---------------------------------------------------------------- to'lov yozuvi
  async createForOrder(tx: Tx, tenantId: string, orderId: string, provider: string, amountTiyin: number, now: Date): Promise<PaymentRow> {
    return (await tx.query<PaymentRow>("insert into payments (tenant_id, order_id, provider, amount_tiyin, expires_at) values ($1,$2,$3,$4,$5) returning id, order_id, provider, status, amount_tiyin, refunded_tiyin, failure_reason, expires_at",
      [tenantId, orderId, provider, amountTiyin, new Date(now.getTime() + PAYMENT_TTL_MS)])).rows[0]!;
  }

  async forOrders(tx: Tx, tenantId: string, ids: string[], slug?: string): Promise<Map<string, ReturnType<PaymentsService["view"]>>> {
    const m = new Map<string, ReturnType<PaymentsService["view"]>>();
    if (!ids.length) return m;
    const r = await tx.query<PaymentRow>("select id, order_id, provider, status, amount_tiyin, refunded_tiyin, failure_reason, expires_at from payments where tenant_id = $1 and order_id = any($2::uuid[]) order by created_at", [tenantId, ids]);
    for (const p of r.rows) m.set(p.order_id, this.view(p, slug));
    return m;
  }
  view(p: PaymentRow, slug?: string) {
    return { id: p.id, provider: p.provider, status: p.status, amount_tiyin: Number(p.amount_tiyin), refunded_tiyin: Number(p.refunded_tiyin), failure_reason: p.failure_reason, expires_at: p.expires_at,
      pay_url: p.status === "pending" && slug ? ADAPTERS[p.provider]?.payUrl(slug, p.id) ?? null : null };
  }

  /** Bekor qilingan/muvaffaqiyatsiz buyurtma: olingan to'lov to'liq qaytariladi (yozuv; provayderga qaytarish so'rovi adapter orqali). */
  async refundAllOnCancel(tx: Tx, tenantId: string, orderId: string, actorId: string | null, reason: string) {
    await tx.query("update payments set status = 'cancelled', updated_at = now() where tenant_id = $1 and order_id = $2 and status in ('pending', 'authorized')", [tenantId, orderId]);
    const p = (await tx.query<PaymentRow>("select id, order_id, provider, status, amount_tiyin, refunded_tiyin, failure_reason, expires_at from payments where tenant_id = $1 and order_id = $2 and status = 'captured' for update", [tenantId, orderId])).rows[0];
    if (!p) return;
    const rest = Number(p.amount_tiyin) - Number(p.refunded_tiyin);
    if (rest > 0) await this.applyRefund(tx, tenantId, p, rest, actorId, reason);
  }

  async applyRefund(tx: Tx, tenantId: string, p: PaymentRow, amount: number, actorId: string | null, reason: string) {
    await tx.query("update payments set refunded_tiyin = refunded_tiyin + $2, updated_at = now() where id = $1", [p.id, amount]);
    await this.events.emit(tx, "payment.refunded", { provider: p.provider, amount_tiyin: amount, reason: reason.slice(0, 60) }, { tenantId, actorId, source: "panel" });
  }
}
