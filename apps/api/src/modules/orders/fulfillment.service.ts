import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors";
import { DbService, type Tx } from "../../db/db.service";
import { AuditService } from "../audit-events/audit.service";
import { EventsService } from "../audit-events/events.service";
import { LoyaltyService, POINT_TIYIN, RULES } from "../loyalty/loyalty.service";
import { lineTotal, orderDto, OrdersService, type OrderRow, type Status } from "./orders.service";

const FRESH_LOCATION_MS = 5 * 60_000;

/** Yig'ish, kuryerga biriktirish va yetkazish. Barcha o'tishlar OrdersService.transition orqali (qoldiq va jurnal bitta joyda). */
@Injectable()
export class FulfillmentService {
  constructor(private readonly db: DbService, private readonly orders: OrdersService, private readonly audit: AuditService, private readonly events: EventsService, private readonly loyalty: LoyaltyService) {}

  private async lockOrder(tx: Tx, tenantId: string, id: string): Promise<OrderRow> {
    const o = (await tx.query<OrderRow>("select *, '' as cur_at from orders where id = $1 and tenant_id = $2 for update", [id, tenantId])).rows[0];
    if (!o) throw new ApiError(404, "not_found");
    return o;
  }
  private need(o: { status: Status }, ...allowed: Status[]) {
    if (!allowed.includes(o.status)) throw new ApiError(409, "order.invalid_transition", { from: o.status, to: allowed[0] });
  }
  private async view(tx: Tx, tenantId: string, id: string, mask: boolean) {
    const o = (await tx.query<OrderRow>("select *, '' as cur_at from orders where id = $1 and tenant_id = $2", [id, tenantId])).rows[0]!;
    return orderDto(o, (await this.orders.loadItems(tx, tenantId, [id])).get(id) ?? [], mask, mask ? (await this.orders.loadDeliveries(tx, tenantId, [id])).get(id) ?? null : undefined);
  }

  // ---------------------------------------------------------------- yig'ish
  async pickingQueue(tenantId: string, userId: string) {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      const r = await tx.query<OrderRow>("select *, '' as cur_at from orders where tenant_id = $1 and status in ('accepted', 'picking') order by created_at, id limit 100", [tenantId]);
      const items = await this.orders.loadItems(tx, tenantId, r.rows.map((o) => o.id));
      return { items: r.rows.map((o) => orderDto(o, items.get(o.id) ?? [], true)) };
    });
  }

  async startPicking(tenantId: string, userId: string, id: string) {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      this.need(await this.lockOrder(tx, tenantId, id), "accepted");
      return this.orders.transition(tx, tenantId, userId, id, "picking", undefined, false);
    });
  }

  async pickItem(tenantId: string, userId: string, orderId: string, itemId: string, d: { status: "picked" | "missing" | "pending"; picked_milli?: number }) {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      this.need(await this.lockOrder(tx, tenantId, orderId), "picking");
      const i = (await tx.query<{ id: string; quantity_milli: string; unit: string }>("select id, quantity_milli, unit from order_items where id = $1 and order_id = $2 and tenant_id = $3 for update", [itemId, orderId, tenantId])).rows[0];
      if (!i) throw new ApiError(404, "not_found");
      const q = Number(i.quantity_milli);
      let picked: number | null = null;
      if (d.status === "picked") {
        picked = d.picked_milli ?? q;
        if (picked <= 0 || picked > q) throw new ApiError(400, "order.invalid_quantity", { max_milli: q });
        if (i.unit === "piece" && picked % 1000 !== 0) throw new ApiError(400, "order.invalid_quantity", { max_milli: q });
      } else if (d.status === "missing") picked = 0;
      await tx.query("update order_items set pick_status = $4, picked_milli = $5 where id = $1 and order_id = $2 and tenant_id = $3", [itemId, orderId, tenantId, d.status, picked]);
      return this.view(tx, tenantId, orderId, true);
    });
  }

  /** Yig'ish tugadi: yig'ilmaganlar band'dan bo'shatiladi, jami qayta hisoblanadi (yig'ilgan miqdor × narx). */
  async finishPicking(tenantId: string, userId: string, orderId: string) {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      const o = await this.lockOrder(tx, tenantId, orderId);
      this.need(o, "picking");
      const items = (await this.orders.loadItems(tx, tenantId, [orderId])).get(orderId) ?? [];
      if (items.some((i) => i.pick_status === "pending")) throw new ApiError(409, "order.picking_incomplete", { pending: items.filter((i) => i.pick_status === "pending").length });
      let subtotal = 0, missing = 0;
      for (const i of [...items].sort((a, b) => (a.product_id < b.product_id ? -1 : 1))) {
        const picked = Number(i.picked_milli ?? 0);
        const total = lineTotal(picked, Number(i.price_tiyin));
        subtotal += total;
        if (picked < Number(i.quantity_milli)) {
          if (picked === 0) missing++;
          const release = Number(i.reserved_milli) - picked;
          if (release > 0) {
            await tx.query("select 1 from stock where product_id = $1 and branch_id = $2 and tenant_id = $3 for update", [i.product_id, o.branch_id, tenantId]);
            await tx.query("update stock set reserved_milli = greatest(0, reserved_milli - $4), updated_at = now() where product_id = $1 and branch_id = $2 and tenant_id = $3", [i.product_id, o.branch_id, tenantId, release]);
          }
        }
        await tx.query("update order_items set reserved_milli = $3, line_total_tiyin = $4 where id = $1 and tenant_id = $2", [i.id, tenantId, picked, total]);
      }
      if (subtotal === 0) throw new ApiError(409, "order.nothing_picked"); // hammasi yo'q — buyurtmani bekor qiling
      // ball bilan to'lash: yig'ishdan keyin jami kamaygan bo'lsa, chegara (30%) qayta tekshiriladi, ortiqcha ball qaytariladi
      let points = Number(o.points_spent);
      const allowed = Math.floor((subtotal * RULES.max_pay_share_of_goods_pct) / 100 / POINT_TIYIN);
      if (points > allowed) { await this.loyalty.refundDifference(tx, tenantId, o.customer_id, orderId, points - allowed); points = allowed; }
      await tx.query("update orders set subtotal_tiyin = $3, points_spent = $4, discount_tiyin = $5, total_tiyin = $3 + delivery_fee_tiyin - $5, picked_at = now() where id = $1 and tenant_id = $2", [orderId, tenantId, subtotal, points, points * POINT_TIYIN]);
      await this.events.emit(tx, "order.picked", { substitutions: 0, out_of_stock: missing }, { tenantId, actorId: userId, source: "panel" });
      return this.orders.transition(tx, tenantId, userId, orderId, "ready", undefined, false);
    });
  }

  // ---------------------------------------------------------------- dispetcher
  async couriers(tenantId: string, userId: string) {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      const r = await tx.query<{ user_id: string; phone: string | null; active: number; lat: number | null; lng: number | null; at: Date | null }>(
        `select m.user_id, u.phone,
                (select count(*)::int from deliveries d where d.tenant_id = m.tenant_id and d.courier_user_id = m.user_id and d.status in ('assigned', 'picked_up')) as active,
                l.lat, l.lng, l.at
           from memberships m join users u on u.id = m.user_id
           left join lateral (select lat, lng, at from courier_locations c where c.tenant_id = m.tenant_id and c.courier_user_id = m.user_id order by at desc limit 1) l on true
          where m.tenant_id = $1 and m.role = 'courier' and m.status = 'active' order by u.phone`, [tenantId]);
      const now = Date.now();
      return { items: r.rows.map((c) => ({ user_id: c.user_id, phone: c.phone, active_deliveries: c.active, location: c.at ? { lat: c.lat, lng: c.lng, at: c.at, fresh: now - new Date(c.at).getTime() < FRESH_LOCATION_MS } : null })) };
    });
  }

  async assign(tenantId: string, userId: string, orderId: string, courierUserId: string, ip?: string | null) {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      const o = await this.lockOrder(tx, tenantId, orderId);
      this.need(o, "ready");
      if (o.fulfillment !== "delivery") throw new ApiError(409, "order.not_delivery");
      const c = await tx.query("select 1 from memberships where tenant_id = $1 and user_id = $2 and role = 'courier' and status = 'active'", [tenantId, courierUserId]);
      if (!c.rowCount) throw new ApiError(404, "not_found"); // kuryer emas yoki boshqa do'kon — oshkor bo'lmaydi
      const ex = (await tx.query<{ status: string }>("select status from deliveries where order_id = $1 and tenant_id = $2 for update", [orderId, tenantId])).rows[0];
      if (ex && ex.status !== "assigned") throw new ApiError(409, "delivery.already_started");
      if (ex) await tx.query("update deliveries set courier_user_id = $3, assigned_by = $4, assigned_at = now(), updated_at = now() where order_id = $1 and tenant_id = $2", [orderId, tenantId, courierUserId, userId]);
      else await tx.query("insert into deliveries (tenant_id, order_id, courier_user_id, assigned_by) values ($1,$2,$3,$4)", [tenantId, orderId, courierUserId, userId]);
      await this.events.emit(tx, "delivery.channel_selected", { channel: "own", price_tiyin: 0, attempt: 1 }, { tenantId, actorId: userId, source: "panel" });
      await this.audit.record(tx, { tenantId, actorId: userId, action: "delivery.assigned", entity: "order", entityId: orderId, after: { courier_user_id: courierUserId }, ip });
      return this.view(tx, tenantId, orderId, true);
    });
  }

  // ---------------------------------------------------------------- kuryer
  private async myDelivery(tx: Tx, tenantId: string, courierId: string, deliveryId: string) {
    const d = (await tx.query<{ id: string; order_id: string; status: string }>("select id, order_id, status from deliveries where id = $1 and tenant_id = $2 and courier_user_id = $3 for update", [deliveryId, tenantId, courierId])).rows[0];
    if (!d) throw new ApiError(404, "not_found"); // begona topshiriq — mavjud emas bilan bir xil
    return d;
  }

  async myDeliveries(tenantId: string, courierId: string) {
    return this.db.tx({ tenantId, userId: courierId }, async (tx) => {
      const r = await tx.query<{ delivery_id: string; d_status: string; assigned_at: Date; cash: string | null } & OrderRow>(
        `select d.id as delivery_id, d.status as d_status, d.assigned_at, d.cash_collected_tiyin as cash, o.*, '' as cur_at
           from deliveries d join orders o on o.id = d.order_id and o.tenant_id = d.tenant_id
          where d.tenant_id = $1 and d.courier_user_id = $2 and (d.status in ('assigned', 'picked_up') or d.updated_at > now() - interval '1 day')
          order by (d.status in ('assigned', 'picked_up')) desc, d.assigned_at desc limit 50`, [tenantId, courierId]);
      const items = await this.orders.loadItems(tx, tenantId, r.rows.map((x) => x.id));
      // kuryer mijoz telefonini to'liq ko'radi (qo'ng'iroq uchun) — faqat o'ziga biriktirilgan buyurtmada
      return { items: r.rows.map((x) => ({ delivery_id: x.delivery_id, delivery_status: x.d_status, assigned_at: x.assigned_at, order: orderDto(x, items.get(x.id) ?? [], false) })) };
    });
  }

  async pickup(tenantId: string, courierId: string, deliveryId: string) {
    return this.db.tx({ tenantId, userId: courierId }, async (tx) => {
      const d = await this.myDelivery(tx, tenantId, courierId, deliveryId);
      if (d.status !== "assigned") throw new ApiError(409, "delivery.invalid_state", { status: d.status });
      this.need(await this.lockOrder(tx, tenantId, d.order_id), "ready");
      await tx.query("update deliveries set status = 'picked_up', picked_up_at = now(), updated_at = now() where id = $1", [deliveryId]);
      return this.orders.transition(tx, tenantId, courierId, d.order_id, "delivering", undefined, false);
    });
  }

  async deliver(tenantId: string, courierId: string, deliveryId: string) {
    return this.db.tx({ tenantId, userId: courierId }, async (tx) => {
      const d = await this.myDelivery(tx, tenantId, courierId, deliveryId);
      if (d.status !== "picked_up") throw new ApiError(409, "delivery.invalid_state", { status: d.status });
      const o = await this.lockOrder(tx, tenantId, d.order_id);
      this.need(o, "delivering");
      await tx.query("update deliveries set status = 'delivered', delivered_at = now(), cash_collected_tiyin = $2, updated_at = now() where id = $1", [deliveryId, o.total_tiyin]); // naqd: buyurtma jami (platforma pulga tegmaydi, faqat yozuv)
      return this.orders.transition(tx, tenantId, courierId, d.order_id, "completed", undefined, false);
    });
  }

  async fail(tenantId: string, courierId: string, deliveryId: string, reason: string) {
    return this.db.tx({ tenantId, userId: courierId }, async (tx) => {
      const d = await this.myDelivery(tx, tenantId, courierId, deliveryId);
      if (d.status !== "picked_up") throw new ApiError(409, "delivery.invalid_state", { status: d.status });
      this.need(await this.lockOrder(tx, tenantId, d.order_id), "delivering");
      await tx.query("update deliveries set status = 'failed', failed_reason = $2, updated_at = now() where id = $1", [deliveryId, reason]);
      return this.orders.transition(tx, tenantId, courierId, d.order_id, "failed", reason, false);
    });
  }

  async location(tenantId: string, courierId: string, d: { lat: number; lng: number; accuracy_m?: number }) {
    await this.db.tx({ tenantId, userId: courierId }, (tx) => tx.query("insert into courier_locations (tenant_id, courier_user_id, lat, lng, accuracy_m) values ($1,$2,$3,$4,$5)", [tenantId, courierId, d.lat, d.lng, d.accuracy_m ?? null]));
    return { ok: true };
  }
}
