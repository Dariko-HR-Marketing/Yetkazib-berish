import { Injectable } from "@nestjs/common";
import { DbService } from "../../db/db.service";

/** Do'kon hisoboti (Asia/Tashkent kunlari bo'yicha). Pul — tiyin (butun son). Faqat bajarilgan buyurtmalar daromadga kiradi. */
@Injectable()
export class ReportsService {
  constructor(private readonly db: DbService) {}

  async sales(tenantId: string, userId: string, days: number) {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      const daily = await tx.query<{ day: string; orders: number; revenue: string; goods: string }>(
        `select to_char((updated_at at time zone 'Asia/Tashkent')::date, 'YYYY-MM-DD') as day, count(*)::int as orders, coalesce(sum(total_tiyin), 0) as revenue, coalesce(sum(subtotal_tiyin), 0) as goods
           from orders where tenant_id = $1 and status = 'completed' and updated_at >= now() - make_interval(days => $2)
          group by 1 order by 1`, [tenantId, days]);
      const status = await tx.query<{ status: string; n: number }>("select status, count(*)::int as n from orders where tenant_id = $1 and created_at >= now() - make_interval(days => $2) group by 1", [tenantId, days]);
      const top = await tx.query<{ product_id: string; name_uz: string; name_ru: string | null; unit: string; qty: string; revenue: string }>(
        `select i.product_id, max(i.name_uz) as name_uz, max(i.name_ru) as name_ru, max(i.unit) as unit, sum(coalesce(i.picked_milli, i.quantity_milli)) as qty, sum(i.line_total_tiyin) as revenue
           from order_items i join orders o on o.id = i.order_id and o.tenant_id = i.tenant_id
          where o.tenant_id = $1 and o.status = 'completed' and o.updated_at >= now() - make_interval(days => $2) and i.pick_status <> 'missing'
          group by i.product_id order by revenue desc limit 10`, [tenantId, days]);
      const disc = await tx.query<{ d: string; p: string }>("select coalesce(sum(discount_tiyin), 0) as d, coalesce(sum(points_spent), 0) as p from orders where tenant_id = $1 and status = 'completed' and updated_at >= now() - make_interval(days => $2)", [tenantId, days]);
      const orders = daily.rows.reduce((a, r) => a + r.orders, 0);
      const revenue = daily.rows.reduce((a, r) => a + Number(r.revenue), 0);
      const counts = Object.fromEntries(status.rows.map((s) => [s.status, s.n]));
      const total = Object.values(counts).reduce((a, n) => a + n, 0);
      const lost = (counts.cancelled ?? 0) + (counts.failed ?? 0);
      return {
        days, orders, revenue_tiyin: revenue, avg_order_tiyin: orders ? Math.round(revenue / orders) : 0,
        cancel_rate_pct: total ? Math.round((lost * 1000) / total) / 10 : 0, discount_tiyin: Number(disc.rows[0]!.d), points_spent: Number(disc.rows[0]!.p),
        status_counts: counts,
        daily: daily.rows.map((r) => ({ day: r.day, orders: r.orders, revenue_tiyin: Number(r.revenue), goods_tiyin: Number(r.goods) })),
        top_products: top.rows.map((p) => ({ product_id: p.product_id, name_uz: p.name_uz, name_ru: p.name_ru, unit: p.unit, quantity_milli: Number(p.qty), revenue_tiyin: Number(p.revenue) })),
      };
    });
  }
}
