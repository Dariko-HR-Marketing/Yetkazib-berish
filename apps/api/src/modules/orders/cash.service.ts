import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors";
import { DbService, type Tx } from "../../db/db.service";
import { AuditService } from "../audit-events/audit.service";

const SEED_DIR = process.env.SEED_DIR ?? resolve(__dirname, "../../../../../infra/seed");
const RULES = JSON.parse(readFileSync(join(SEED_DIR, "courier_dispatch_rules.json"), "utf8")) as { rules: { courier_cash_limit_uzs: number } };
/** Kuryerda bo'lishi mumkin bo'lgan naqd chegarasi (tiyin). Chegaradan oshsa yangi buyurtma biriktirilmaydi. */
export const COURIER_CASH_LIMIT_TIYIN = RULES.rules.courier_cash_limit_uzs * 100;

/** Kuryer naqdi: yetkazilganda olingan summa (deliveries.cash_collected) − kassaga topshirilgan (cash_handovers, o'zgarmas). */
@Injectable()
export class CashService {
  constructor(private readonly db: DbService, private readonly audit: AuditService) {}

  async onHand(tx: Tx, tenantId: string, courierId: string): Promise<number> {
    const r = await tx.query<{ v: string }>(
      `select (coalesce((select sum(cash_collected_tiyin) from deliveries where tenant_id = $1 and courier_user_id = $2 and status = 'delivered'), 0)
             - coalesce((select sum(amount_tiyin) from cash_handovers where tenant_id = $1 and courier_user_id = $2), 0)) as v`, [tenantId, courierId]);
    return Number(r.rows[0]!.v);
  }

  async couriers(tenantId: string, userId: string) {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      const r = await tx.query<{ user_id: string; phone: string | null; on_hand: string; last_handover_at: Date | null }>(
        `select m.user_id, u.phone,
                (coalesce((select sum(cash_collected_tiyin) from deliveries d where d.tenant_id = m.tenant_id and d.courier_user_id = m.user_id and d.status = 'delivered'), 0)
               - coalesce((select sum(amount_tiyin) from cash_handovers h where h.tenant_id = m.tenant_id and h.courier_user_id = m.user_id), 0)) as on_hand,
                (select max(created_at) from cash_handovers h where h.tenant_id = m.tenant_id and h.courier_user_id = m.user_id) as last_handover_at
           from memberships m join users u on u.id = m.user_id where m.tenant_id = $1 and m.role = 'courier' and m.status = 'active' order by u.phone`, [tenantId]);
      return { limit_tiyin: COURIER_CASH_LIMIT_TIYIN, items: r.rows.map((c) => ({ user_id: c.user_id, phone: c.phone, on_hand_tiyin: Number(c.on_hand), over_limit: Number(c.on_hand) > COURIER_CASH_LIMIT_TIYIN, last_handover_at: c.last_handover_at })) };
    });
  }

  async handover(tenantId: string, userId: string, courierId: string, amount: number, note: string | undefined, ip?: string | null) {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      if (!(await tx.query("select 1 from memberships where tenant_id = $1 and user_id = $2 and role = 'courier'", [tenantId, courierId])).rowCount) throw new ApiError(404, "not_found");
      await tx.query("select 1 from memberships where tenant_id = $1 and user_id = $2 for update", [tenantId, courierId]); // parallel topshirishlar ketma-ket
      const have = await this.onHand(tx, tenantId, courierId);
      if (amount > have) throw new ApiError(422, "cash.exceeds_on_hand", { on_hand_tiyin: have }, { max: Math.round(have / 100) });
      const h = (await tx.query<{ id: string }>("insert into cash_handovers (tenant_id, courier_user_id, amount_tiyin, received_by, note) values ($1,$2,$3,$4,$5) returning id", [tenantId, courierId, amount, userId, note ?? null])).rows[0]!;
      await this.audit.record(tx, { tenantId, actorId: userId, action: "cash.handover", entity: "user", entityId: courierId, after: { amount_tiyin: amount, handover_id: Number(h.id) }, ip });
      return { id: Number(h.id), on_hand_tiyin: have - amount };
    });
  }
}
