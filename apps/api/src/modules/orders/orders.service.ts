import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors";
import { DbService, type Tx } from "../../db/db.service";
import { AuditService } from "../audit-events/audit.service";
import { EventsService } from "../audit-events/events.service";
import { decodeCursor, encodeCursor } from "../catalog/stock-state";
import { maskPhone } from "../identity/identity.service";
import { LoyaltyService, POINT_TIYIN } from "../loyalty/loyalty.service";
import { FeaturesService } from "../plans-flags/features.service";
import { StorefrontService } from "./storefront.service";

export type Status = "placed" | "accepted" | "picking" | "ready" | "delivering" | "completed" | "cancelled" | "failed";
/** Ruxsat etilgan o'tishlar (S4'da yig'ish/yetkazish holatlari qo'shiladi). */
export const TRANSITIONS: Record<Status, Status[]> = {
  placed: ["accepted", "cancelled"], accepted: ["picking", "completed", "cancelled"], picking: ["ready", "cancelled"], ready: ["delivering", "completed", "cancelled"],
  delivering: ["completed", "failed"], completed: [], cancelled: [], failed: [],
};

/** milli-birlik × tiyin / 1000, yarim yuqoriga yaxlitlash. Float yo'q. */
export const lineTotal = (quantityMilli: number, priceTiyin: number): number => Number((BigInt(quantityMilli) * BigInt(priceTiyin) + 500n) / 1000n);

export interface OrderRow {
  id: string; number: string; branch_id: string; customer_id: string; status: Status; fulfillment: string; payment_type: string; channel: string;
  subtotal_tiyin: string; delivery_fee_tiyin: string; discount_tiyin: string; points_spent: string; total_tiyin: string; delivery_address: string | null; customer_phone: string | null; note: string | null;
  cancel_reason: string | null; created_at: Date; updated_at: Date; cur_at: string;
}
export interface ItemRow { id: string; product_id: string; name_uz: string; name_ru: string | null; unit: string; quantity_milli: string; price_tiyin: string; line_total_tiyin: string; pick_status: string; picked_milli: string | null; reserved_milli: string }

export const itemDto = (i: ItemRow) => ({ id: i.id, product_id: i.product_id, name_uz: i.name_uz, name_ru: i.name_ru, unit: i.unit, quantity_milli: Number(i.quantity_milli), price_tiyin: Number(i.price_tiyin), line_total_tiyin: Number(i.line_total_tiyin), pick_status: i.pick_status, picked_milli: i.picked_milli === null ? null : Number(i.picked_milli) });
export interface DeliveryRef { courier_user_id: string; status: string }
export const orderDto = (o: OrderRow, items: ItemRow[], mask: boolean, delivery?: DeliveryRef | null) => ({
  id: o.id, number: Number(o.number), branch_id: o.branch_id, status: o.status, fulfillment: o.fulfillment, payment_type: o.payment_type, channel: o.channel,
  subtotal_tiyin: Number(o.subtotal_tiyin), delivery_fee_tiyin: Number(o.delivery_fee_tiyin), discount_tiyin: Number(o.discount_tiyin), points_spent: Number(o.points_spent), total_tiyin: Number(o.total_tiyin),
  delivery_address: o.delivery_address, customer_phone: mask ? maskPhone(o.customer_phone) : o.customer_phone, note: o.note, cancel_reason: o.cancel_reason,
  created_at: o.created_at, updated_at: o.updated_at, items: items.map(itemDto),
  ...(delivery !== undefined ? { delivery } : {}),
});

@Injectable()
export class OrdersService {
  constructor(private readonly db: DbService, private readonly shops: StorefrontService, private readonly features: FeaturesService,
              private readonly audit: AuditService, private readonly events: EventsService, private readonly loyalty: LoyaltyService) {}

  async loadItems(tx: Tx, tenantId: string, ids: string[]): Promise<Map<string, ItemRow[]>> {
    const m = new Map<string, ItemRow[]>();
    if (!ids.length) return m;
    const r = await tx.query<ItemRow & { order_id: string }>("select id, order_id, product_id, name_uz, name_ru, unit, quantity_milli, price_tiyin, line_total_tiyin, pick_status, picked_milli, reserved_milli from order_items where tenant_id = $1 and order_id = any($2::uuid[]) order by id", [tenantId, ids]);
    for (const i of r.rows) { const a = m.get(i.order_id) ?? []; a.push(i); m.set(i.order_id, a); }
    return m;
  }

  /** Panel uchun: buyurtmaga biriktirilgan kuryer (xaridorga ko'rsatilmaydi). */
  async loadDeliveries(tx: Tx, tenantId: string, ids: string[]): Promise<Map<string, DeliveryRef>> {
    const m = new Map<string, DeliveryRef>();
    if (!ids.length) return m;
    const r = await tx.query<{ order_id: string; courier_user_id: string; status: string }>("select order_id, courier_user_id, status from deliveries where tenant_id = $1 and order_id = any($2::uuid[])", [tenantId, ids]);
    for (const d of r.rows) m.set(d.order_id, { courier_user_id: d.courier_user_id, status: d.status });
    return m;
  }

  // ---------------------------------------------------------------- xaridor
  async place(slug: string, userId: string, d: { branch_id: string; items: { product_id: string; quantity_milli: number }[]; fulfillment: "delivery" | "pickup"; delivery_address?: string; note?: string; payment_type: "cash"; channel: "vitrina" | "telegram"; points_to_use: number }) {
    const shop = await this.shops.resolve(slug);
    if (!(await this.features.can(shop.id, "payment.cash"))) throw new ApiError(422, "order.payment_unavailable");
    if (d.points_to_use > 0 && !(await this.loyalty.enabled(shop.id))) throw new ApiError(422, "loyalty.disabled");
    const merged = new Map<string, number>();
    for (const i of d.items) merged.set(i.product_id, (merged.get(i.product_id) ?? 0) + i.quantity_milli);
    const ids = [...merged.keys()].sort(); // qulf tartibi: deadlock bo'lmasin

    return this.db.tx({ tenantId: shop.id, userId }, async (tx) => {
      if (!(await tx.query("select 1 from branches where id = $1 and tenant_id = $2", [d.branch_id, shop.id])).rowCount) throw new ApiError(404, "not_found");
      const prods = (await tx.query<{ id: string; name_uz: string; name_ru: string | null; unit: string; price_tiyin: string }>(
        "select id, name_uz, name_ru, unit, price_tiyin from products where tenant_id = $1 and status = 'active' and id = any($2::uuid[])", [shop.id, ids])).rows;
      if (prods.length !== ids.length) throw new ApiError(422, "order.product_unavailable", { products: ids.filter((id) => !prods.some((p) => p.id === id)) });
      const byId = new Map(prods.map((p) => [p.id, p]));
      for (const id of ids) if (byId.get(id)!.unit === "piece" && merged.get(id)! % 1000 !== 0) throw new ApiError(400, "order.invalid_quantity", { product_id: id });

      // qoldiqni qulflab band qilish
      const short: { product_id: string; available_milli: number }[] = [];
      for (const id of ids) {
        const st = (await tx.query<{ quantity_milli: string; reserved_milli: string; out_marked: boolean }>(
          "select quantity_milli, reserved_milli, out_marked from stock where product_id = $1 and branch_id = $2 and tenant_id = $3 for update", [id, d.branch_id, shop.id])).rows[0];
        const avail = !st || st.out_marked ? 0 : Math.max(0, Number(st.quantity_milli) - Number(st.reserved_milli));
        if (avail < merged.get(id)!) short.push({ product_id: id, available_milli: avail });
      }
      if (short.length) throw new ApiError(409, "order.out_of_stock", { items: short });
      for (const id of ids) await tx.query("update stock set reserved_milli = reserved_milli + $4, updated_at = now() where product_id = $1 and branch_id = $2 and tenant_id = $3", [id, d.branch_id, shop.id, merged.get(id)!]);

      const lines = ids.map((id) => { const p = byId.get(id)!; const q = merged.get(id)!; return { p, q, total: lineTotal(q, Number(p.price_tiyin)) }; });
      const subtotal = lines.reduce((a, l) => a + l.total, 0);
      const cfg = (await tx.query<{ fee_tiyin: string; free_from_tiyin: string | null; min_order_tiyin: string }>("select fee_tiyin, free_from_tiyin, min_order_tiyin from delivery_settings where tenant_id = $1", [shop.id])).rows[0];
      const minOrder = Number(cfg?.min_order_tiyin ?? 0);
      if (subtotal < minOrder) throw new ApiError(422, "order.below_minimum", { min_tiyin: minOrder, subtotal_tiyin: subtotal }, { min: Math.round(minOrder / 100) });
      const fee = d.fulfillment === "delivery" && cfg ? (cfg.free_from_tiyin !== null && subtotal >= Number(cfg.free_from_tiyin) ? 0 : Number(cfg.fee_tiyin)) : 0;
      const discount = d.points_to_use * POINT_TIYIN;
      const phone = (await tx.query<{ phone: string | null }>("select phone from users where id = $1", [userId])).rows[0]?.phone ?? null;
      const o = (await tx.query<OrderRow>(
        `insert into orders (tenant_id, branch_id, customer_id, fulfillment, payment_type, channel, subtotal_tiyin, delivery_fee_tiyin, discount_tiyin, points_spent, total_tiyin, delivery_address, customer_phone, note)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning *, to_char(created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cur_at`,
        [shop.id, d.branch_id, userId, d.fulfillment, d.payment_type, d.channel, subtotal, fee, discount, d.points_to_use, subtotal + fee - discount, d.fulfillment === "delivery" ? d.delivery_address : null, phone, d.note ?? null])).rows[0]!;
      if (d.points_to_use > 0) await this.loyalty.spendForOrder(tx, shop.id, userId, o.id, d.points_to_use, subtotal); // chegara va balansni tekshiradi; xatoda butun buyurtma bekor
      for (const l of lines) {
        await tx.query("insert into order_items (order_id, tenant_id, product_id, name_uz, name_ru, unit, quantity_milli, price_tiyin, line_total_tiyin, reserved_milli) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$7)",
          [o.id, shop.id, l.p.id, l.p.name_uz, l.p.name_ru, l.p.unit, l.q, Number(l.p.price_tiyin), l.total]);
      }
      await tx.query("insert into order_status_history (tenant_id, order_id, from_status, to_status, actor_id) values ($1,$2,null,'placed',$3)", [shop.id, o.id, userId]);
      await this.events.emit(tx, "order.placed", { order_id: o.id, amount_tiyin: subtotal + fee - discount, payment_type: d.payment_type, channel: d.channel }, { tenantId: shop.id, actorId: userId, source: d.channel === "telegram" ? "telegram" : "vitrina" });
      return orderDto(o, (await this.loadItems(tx, shop.id, [o.id])).get(o.id) ?? [], false);
    });
  }

  async customerList(slug: string, userId: string, limit: number) {
    const shop = await this.shops.resolve(slug);
    return this.db.tx({ tenantId: shop.id, userId }, async (tx) => {
      const r = await tx.query<OrderRow>("select *, '' as cur_at from orders where tenant_id = $1 and customer_id = $2 order by created_at desc, id limit $3", [shop.id, userId, limit]);
      const items = await this.loadItems(tx, shop.id, r.rows.map((o) => o.id));
      return { items: r.rows.map((o) => orderDto(o, items.get(o.id) ?? [], false)) };
    });
  }

  async customerGet(slug: string, userId: string, id: string) {
    const shop = await this.shops.resolve(slug);
    return this.db.tx({ tenantId: shop.id, userId }, async (tx) => {
      const o = (await tx.query<OrderRow>("select *, '' as cur_at from orders where id = $1 and tenant_id = $2 and customer_id = $3", [id, shop.id, userId])).rows[0];
      if (!o) throw new ApiError(404, "not_found"); // begona buyurtma — mavjud emas bilan bir xil
      return orderDto(o, (await this.loadItems(tx, shop.id, [o.id])).get(o.id) ?? [], false);
    });
  }

  async customerCancel(slug: string, userId: string, id: string, reason?: string) {
    const shop = await this.shops.resolve(slug);
    return this.db.tx({ tenantId: shop.id, userId }, async (tx) => {
      const o = (await tx.query<{ status: Status }>("select status from orders where id = $1 and tenant_id = $2 and customer_id = $3 for update", [id, shop.id, userId])).rows[0];
      if (!o) throw new ApiError(404, "not_found");
      if (o.status !== "placed") throw new ApiError(409, "order.cannot_cancel", { status: o.status });
      return this.transition(tx, shop.id, userId, id, "cancelled", reason ?? "xaridor bekor qildi", true);
    });
  }

  // ---------------------------------------------------------------- panel
  async panelList(tenantId: string, userId: string, q: { status?: Status; limit: number; cursor?: string }) {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      const after = decodeCursor<{ at: string; id: string }>(q.cursor);
      if (q.cursor && (!after || typeof after.at !== "string" || typeof after.id !== "string")) throw new ApiError(400, "validation.failed", { issues: [{ path: "cursor", message: "noto'g'ri kursor" }] });
      const r = await tx.query<OrderRow>(
        `select *, to_char(created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cur_at from orders
          where tenant_id = $1 and ($2::text is null or status = $2)
            and ($3::timestamptz is null or (created_at, id) < ($3::timestamptz, $4::uuid))
          order by created_at desc, id desc limit $5`, [tenantId, q.status ?? null, after?.at ?? null, after?.id ?? null, q.limit + 1]);
      const page = r.rows.slice(0, q.limit);
      const last = page[page.length - 1];
      const items = await this.loadItems(tx, tenantId, page.map((o) => o.id));
      const dels = await this.loadDeliveries(tx, tenantId, page.map((o) => o.id));
      const counts = await tx.query<{ status: string; n: number }>("select status, count(*)::int as n from orders where tenant_id = $1 group by status", [tenantId]);
      return {
        items: page.map((o) => orderDto(o, items.get(o.id) ?? [], true, dels.get(o.id) ?? null)),
        next_cursor: r.rows.length > q.limit && last ? encodeCursor({ at: last.cur_at, id: last.id }) : null,
        counts: Object.fromEntries(counts.rows.map((c) => [c.status, c.n])),
      };
    });
  }

  async panelGet(tenantId: string, userId: string, id: string) {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      const o = (await tx.query<OrderRow>("select *, '' as cur_at from orders where id = $1 and tenant_id = $2", [id, tenantId])).rows[0];
      if (!o) throw new ApiError(404, "not_found");
      const hist = await tx.query("select from_status, to_status, created_at from order_status_history where order_id = $1 and tenant_id = $2 order by created_at, id", [id, tenantId]);
      return { ...orderDto(o, (await this.loadItems(tx, tenantId, [o.id])).get(o.id) ?? [], true, (await this.loadDeliveries(tx, tenantId, [o.id])).get(o.id) ?? null), history: hist.rows };
    });
  }

  async panelSetStatus(tenantId: string, userId: string, id: string, to: Status, reason: string | undefined, ip?: string | null) {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      const cur = (await tx.query<{ status: Status }>("select status from orders where id = $1 and tenant_id = $2 for update", [id, tenantId])).rows[0];
      if (!cur) throw new ApiError(404, "not_found");
      if (!TRANSITIONS[cur.status].includes(to)) throw new ApiError(409, "order.invalid_transition", { from: cur.status, to });
      if (to === "completed") {
        // qo'lda yakunlash: olib ketish topshirildi yoki kuryersiz tezkor yo'l; kuryer biriktirilgan bo'lsa yetkazish kuryer orqali tugaydi
        const o = (await tx.query<{ fulfillment: string }>("select fulfillment from orders where id = $1 and tenant_id = $2", [id, tenantId])).rows[0]!;
        const hasDelivery = (await tx.query("select 1 from deliveries where order_id = $1 and tenant_id = $2", [id, tenantId])).rowCount;
        if (hasDelivery || (cur.status === "ready" && o.fulfillment !== "pickup")) throw new ApiError(409, "order.invalid_transition", { from: cur.status, to });
      }
      const out = await this.transition(tx, tenantId, userId, id, to, reason, false);
      await this.audit.record(tx, { tenantId, actorId: userId, action: `order.${to}`, entity: "order", entityId: id, before: { status: cur.status }, after: { status: to }, ip });
      return out;
    });
  }

  /** Holat o'tishi + qoldiq ta'siri. Bekor/muvaffaqiyatsiz — band bo'shaydi; bajarildi — band qilingan (yig'ilgan) miqdor qoldiqdan ayriladi (jurnal: sale). Chaqiruvchi qatorni qulflagan. */
  async transition(tx: Tx, tenantId: string, actorId: string, id: string, to: Status, reason: string | undefined, byCustomer: boolean) {
    const o = (await tx.query<OrderRow>("select *, '' as cur_at from orders where id = $1 and tenant_id = $2", [id, tenantId])).rows[0]!;
    const from = o.status;
    const items = (await this.loadItems(tx, tenantId, [id])).get(id) ?? [];
    if (to === "cancelled" || to === "completed" || to === "failed") {
      for (const i of [...items].sort((a, b) => (a.product_id < b.product_id ? -1 : 1))) {
        const q = Number(i.reserved_milli);
        if (q === 0) continue;
        const st = (await tx.query<{ quantity_milli: string; reserved_milli: string }>("select quantity_milli, reserved_milli from stock where product_id = $1 and branch_id = $2 and tenant_id = $3 for update", [i.product_id, o.branch_id, tenantId])).rows[0];
        if (st) {
          const reserved = Math.max(0, Number(st.reserved_milli) - q);
          if (to === "completed") {
            const qty = Math.max(0, Number(st.quantity_milli) - q);
            await tx.query("update stock set quantity_milli = $4, reserved_milli = $5, updated_at = now() where product_id = $1 and branch_id = $2 and tenant_id = $3", [i.product_id, o.branch_id, tenantId, qty, reserved]);
            await tx.query("insert into stock_movements (tenant_id, product_id, branch_id, delta_milli, quantity_after_milli, reason, source, actor_id) values ($1,$2,$3,$4,$5,'sale','system',$6)", [tenantId, i.product_id, o.branch_id, qty - Number(st.quantity_milli), qty, actorId]);
          } else {
            await tx.query("update stock set reserved_milli = $4, updated_at = now() where product_id = $1 and branch_id = $2 and tenant_id = $3", [i.product_id, o.branch_id, tenantId, reserved]);
          }
        }
        await tx.query("update order_items set reserved_milli = 0 where id = $1 and tenant_id = $2", [i.id, tenantId]);
      }
    }
    if ((to === "cancelled" || to === "failed") && Number(o.points_spent) > 0) await this.loyalty.reverseForOrder(tx, tenantId, o.customer_id, id, Number(o.points_spent));
    if (to === "completed") await this.loyalty.accrueForOrder(tx, tenantId, o.customer_id, id, Number(o.subtotal_tiyin) - Number(o.discount_tiyin));
    const why = to === "cancelled" || to === "failed" ? reason ?? null : null;
    await tx.query("update orders set status = $3, cancel_reason = $4, updated_at = now(), delivered_at = case when $3 = 'completed' then now() else delivered_at end where id = $1 and tenant_id = $2", [id, tenantId, to, why]);
    await tx.query("insert into order_status_history (tenant_id, order_id, from_status, to_status, actor_id) values ($1,$2,$3,$4,$5)", [tenantId, id, from, to, actorId]);
    if (to === "cancelled") await this.events.emit(tx, "order.failed", { reason: (byCustomer ? "customer_cancelled" : "shop_cancelled") }, { tenantId, actorId, source: byCustomer ? "vitrina" : "panel" });
    if (to === "failed") await this.events.emit(tx, "order.failed", { reason: "delivery_failed" }, { tenantId, actorId, source: "kuryer" });
    if (to === "completed") await this.events.emit(tx, "order.delivered", { duration_seconds: Math.max(0, Math.round((Date.now() - new Date(o.created_at).getTime()) / 1000)) }, { tenantId, actorId, source: "panel" });
    const fresh = items.map((i) => ({ ...i, reserved_milli: to === "cancelled" || to === "completed" || to === "failed" ? "0" : i.reserved_milli }));
    return orderDto({ ...o, status: to, cancel_reason: why }, fresh, !byCustomer);
  }
}
