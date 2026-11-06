import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors";
import { DbService } from "../../db/db.service";
import { maskPhone } from "../identity/identity.service";
import { decodeCursor, encodeCursor } from "../catalog/stock-state";

@Injectable()
export class InsightsService {
  constructor(private readonly db: DbService) {}

  /** Audit jurnali (o'zgarmas): kim, nima, qachon, oldin/keyin. IP va to'liq telefon ko'rsatilmaydi. */
  async audit(tenantId: string, userId: string, q: { limit: number; cursor?: string; action?: string }) {
    const after = decodeCursor<{ id: number }>(q.cursor);
    if (q.cursor && (!after || !Number.isInteger(after.id))) throw new ApiError(400, "validation.failed", { issues: [{ path: "cursor", message: "noto'g'ri kursor" }] });
    return this.db.tx({ tenantId, userId }, async (tx) => {
      const r = await tx.query<{ id: string; created_at: Date; action: string; entity: string; entity_id: string; before: unknown; after: unknown; phone: string | null; actor_id: string | null }>(
        `select a.id, a.created_at, a.action, a.entity, a.entity_id, a.before, a.after, a.actor_id, u.phone
           from audit_log a left join users u on u.id = a.actor_id
          where a.tenant_id = $1 and ($2::bigint is null or a.id < $2) and ($3::text is null or a.action like $3)
          order by a.id desc limit $4`, [tenantId, after?.id ?? null, q.action ? `${q.action.replace(/[\\%_]/g, "")}%` : null, q.limit + 1]);
      const page = r.rows.slice(0, q.limit);
      return {
        items: page.map((a) => ({ id: Number(a.id), created_at: a.created_at, action: a.action, entity: a.entity, entity_id: a.entity_id, actor: a.actor_id ? { id: a.actor_id, phone_masked: maskPhone(a.phone) } : null, before: a.before ?? null, after: a.after ?? null })),
        next_cursor: r.rows.length > q.limit ? encodeCursor({ id: Number(page[page.length - 1]!.id) }) : null,
      };
    });
  }

  /** Mijoz 360 (maskalangan, faqat ichki tahlil): buyurtmalar soni, sarf, oxirgi buyurtma, ball. Xaridorga ko'rsatilmaydi. */
  async customers(tenantId: string, userId: string, limit: number) {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      const r = await tx.query<{ customer_id: string; phone: string | null; orders: number; completed: number; cancelled: number; spent: string; last_at: Date; balance: string | null }>(
        `select o.customer_id, u.phone, count(*)::int as orders, count(*) filter (where o.status = 'completed')::int as completed,
                count(*) filter (where o.status in ('cancelled', 'failed'))::int as cancelled,
                coalesce(sum(o.total_tiyin) filter (where o.status = 'completed'), 0) as spent, max(o.created_at) as last_at, b.balance_points as balance
           from orders o join users u on u.id = o.customer_id
           left join loyalty_balances b on b.tenant_id = o.tenant_id and b.user_id = o.customer_id
          where o.tenant_id = $1 group by o.customer_id, u.phone, b.balance_points order by max(o.created_at) desc limit $2`, [tenantId, limit]);
      const total = (await tx.query<{ n: number }>("select count(distinct customer_id)::int as n from orders where tenant_id = $1", [tenantId])).rows[0]!.n;
      return {
        total_customers: total,
        items: r.rows.map((c) => ({ customer_id: c.customer_id, phone_masked: maskPhone(c.phone), orders: c.orders, completed: c.completed, cancelled: c.cancelled, spent_tiyin: Number(c.spent), last_order_at: c.last_at, points_balance: c.balance === null ? 0 : Number(c.balance), repeat: c.completed >= 2 })),
      };
    });
  }
}
