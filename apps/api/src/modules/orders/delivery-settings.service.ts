import { Injectable } from "@nestjs/common";
import { DbService } from "../../db/db.service";
import { AuditService } from "../audit-events/audit.service";

export interface DeliverySettings { fee_tiyin: number; free_from_tiyin: number | null; min_order_tiyin: number }

/** Yetkazish narxi: tekis narx, bepul chegarasi, minimal buyurtma (do'kon belgilaydi; masofa bo'yicha narx — keyingi bosqich). */
@Injectable()
export class DeliverySettingsService {
  constructor(private readonly db: DbService, private readonly audit: AuditService) {}

  async get(tenantId: string, userId?: string): Promise<DeliverySettings> {
    const r = await this.db.tx({ tenantId, userId }, (tx) => tx.query<{ fee_tiyin: string; free_from_tiyin: string | null; min_order_tiyin: string }>("select fee_tiyin, free_from_tiyin, min_order_tiyin from delivery_settings where tenant_id = $1", [tenantId]));
    const x = r.rows[0];
    return { fee_tiyin: Number(x?.fee_tiyin ?? 0), free_from_tiyin: x?.free_from_tiyin == null ? null : Number(x.free_from_tiyin), min_order_tiyin: Number(x?.min_order_tiyin ?? 0) };
  }

  async set(tenantId: string, userId: string, d: DeliverySettings, ip?: string | null): Promise<DeliverySettings> {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      const before = (await tx.query("select fee_tiyin, free_from_tiyin, min_order_tiyin from delivery_settings where tenant_id = $1", [tenantId])).rows[0] ?? null;
      await tx.query(
        `insert into delivery_settings (tenant_id, fee_tiyin, free_from_tiyin, min_order_tiyin, updated_at) values ($1,$2,$3,$4,now())
         on conflict (tenant_id) do update set fee_tiyin = $2, free_from_tiyin = $3, min_order_tiyin = $4, updated_at = now()`, [tenantId, d.fee_tiyin, d.free_from_tiyin, d.min_order_tiyin]);
      await this.audit.record(tx, { tenantId, actorId: userId, action: "delivery.settings_changed", entity: "tenant", entityId: tenantId, before, after: d, ip });
      return d;
    });
  }
}
