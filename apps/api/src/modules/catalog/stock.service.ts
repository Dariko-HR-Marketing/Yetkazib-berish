import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors";
import { DbService, type Tx } from "../../db/db.service";
import { AuditService } from "../audit-events/audit.service";
import { EventsService } from "../audit-events/events.service";
import { availableMilli, stockState } from "./stock-state";

export type MovementReason = "set" | "adjust" | "import" | "sale" | "out_marked" | "back_on_sale";

interface StockRec { quantity_milli: string; reserved_milli: string; out_marked: boolean }

/**
 * Qoldiq: joriy holat (`stock`) + o'zgarmas harakat jurnali (`stock_movements`). Har o'zgarish bitta tranzaksiyada.
 * Qator `for update` bilan qulflanadi (parallel tuzatishlar yo'qolmasin).
 */
@Injectable()
export class StockService {
  constructor(private readonly db: DbService, private readonly audit: AuditService, private readonly events: EventsService) {}

  private async assertRefs(tx: Tx, tenantId: string, productId: string, branchId: string) {
    const p = await tx.query("select 1 from products where id = $1 and tenant_id = $2 and status <> 'archived'", [productId, tenantId]);
    const b = await tx.query("select 1 from branches where id = $1 and tenant_id = $2", [branchId, tenantId]);
    if (!p.rowCount || !b.rowCount) throw new ApiError(404, "not_found"); // boshqa do'kon yoki mavjud emas — bir xil javob
  }

  private async lock(tx: Tx, tenantId: string, productId: string, branchId: string): Promise<StockRec | null> {
    await tx.query(
      "insert into stock (product_id, branch_id, tenant_id) values ($1,$2,$3) on conflict (product_id, branch_id) do nothing", [productId, branchId, tenantId]);
    return (await tx.query<StockRec>("select quantity_milli, reserved_milli, out_marked from stock where product_id = $1 and branch_id = $2 and tenant_id = $3 for update", [productId, branchId, tenantId])).rows[0] ?? null;
  }

  private view(s: StockRec) {
    const a = availableMilli(s);
    return { quantity_milli: Number(s.quantity_milli), reserved_milli: Number(s.reserved_milli), available_milli: a, out_marked: s.out_marked, state: stockState(s) };
  }

  /** Ichki yordamchi (import ham ishlatadi): mutlaq qiymat o'rnatish. tx tashqaridan beriladi. */
  async setInTx(tx: Tx, tenantId: string, actorId: string | null, productId: string, branchId: string, quantityMilli: number, reason: MovementReason, source: "manual" | "import" | "pos" | "system", note?: string) {
    const cur = await this.lock(tx, tenantId, productId, branchId);
    const before = Number(cur?.quantity_milli ?? 0);
    if (before === quantityMilli && reason !== "import") return this.view(cur!);
    await tx.query("update stock set quantity_milli = $4, source = $5, updated_at = now() where product_id = $1 and branch_id = $2 and tenant_id = $3", [productId, branchId, tenantId, quantityMilli, source]);
    await tx.query(
      `insert into stock_movements (tenant_id, product_id, branch_id, delta_milli, quantity_after_milli, reason, source, actor_id, note) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [tenantId, productId, branchId, quantityMilli - before, quantityMilli, reason, source, actorId, note ?? null]);
    return this.view({ ...cur!, quantity_milli: String(quantityMilli) });
  }

  set(tenantId: string, userId: string, productId: string, d: { branch_id: string; quantity_milli: number; note?: string }) {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      await this.assertRefs(tx, tenantId, productId, d.branch_id);
      return this.setInTx(tx, tenantId, userId, productId, d.branch_id, d.quantity_milli, "set", "manual", d.note);
    });
  }

  adjust(tenantId: string, userId: string, productId: string, d: { branch_id: string; delta_milli: number; note?: string }) {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      await this.assertRefs(tx, tenantId, productId, d.branch_id);
      const cur = await this.lock(tx, tenantId, productId, d.branch_id);
      const next = Number(cur?.quantity_milli ?? 0) + d.delta_milli;
      if (next < 0) throw new ApiError(422, "stock.negative", { available_milli: Number(cur?.quantity_milli ?? 0) });
      await tx.query("update stock set quantity_milli = $4, source = 'manual', updated_at = now() where product_id = $1 and branch_id = $2 and tenant_id = $3", [productId, d.branch_id, tenantId, next]);
      await tx.query(
        `insert into stock_movements (tenant_id, product_id, branch_id, delta_milli, quantity_after_milli, reason, source, actor_id, note) values ($1,$2,$3,$4,$5,'adjust','manual',$6,$7)`,
        [tenantId, productId, d.branch_id, d.delta_milli, next, userId, d.note ?? null]);
      return this.view({ ...cur!, quantity_milli: String(next) });
    });
  }

  /** «Tugadi deb belgilash» / «Sotuvga qaytarish». Hodisa: stock.out_marked (A-2). */
  markOut(tenantId: string, userId: string, productId: string, d: { branch_id: string; out: boolean }, ip?: string | null) {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      await this.assertRefs(tx, tenantId, productId, d.branch_id);
      const cur = await this.lock(tx, tenantId, productId, d.branch_id);
      if (cur!.out_marked === d.out) return this.view(cur!); // idempotent
      await tx.query("update stock set out_marked = $4, updated_at = now() where product_id = $1 and branch_id = $2 and tenant_id = $3", [productId, d.branch_id, tenantId, d.out]);
      await tx.query(
        `insert into stock_movements (tenant_id, product_id, branch_id, delta_milli, quantity_after_milli, reason, source, actor_id) values ($1,$2,$3,0,$4,$5,'manual',$6)`,
        [tenantId, productId, d.branch_id, Number(cur!.quantity_milli), d.out ? "out_marked" : "back_on_sale", userId]);
      if (d.out) await this.events.emit(tx, "stock.out_marked", { product_id: productId, branch_id: d.branch_id }, { tenantId, actorId: userId, source: "panel" });
      await this.audit.record(tx, { tenantId, actorId: userId, action: d.out ? "stock.out_marked" : "stock.back_on_sale", entity: "product", entityId: productId, after: { branch_id: d.branch_id }, ip });
      return this.view({ ...cur!, out_marked: d.out });
    });
  }

  movements(tenantId: string, userId: string, productId: string, limit: number) {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      const p = await tx.query("select 1 from products where id = $1 and tenant_id = $2", [productId, tenantId]);
      if (!p.rowCount) throw new ApiError(404, "not_found");
      const r = await tx.query(
        `select id, branch_id, delta_milli::bigint as delta_milli, quantity_after_milli::bigint as quantity_after_milli, reason, source, note, created_at
           from stock_movements where tenant_id = $1 and product_id = $2 order by created_at desc, id limit $3`, [tenantId, productId, limit]);
      return { items: r.rows.map((m) => ({ ...m, delta_milli: Number(m.delta_milli), quantity_after_milli: Number(m.quantity_after_milli) })) };
    });
  }

  /** Vitrina/buyurtma uchun ichki o'qish (S2): mavjud miqdor filial bo'yicha. */
  availability(tenantId: string, productId: string, branchId: string) {
    return this.db.tx({ tenantId }, async (tx) => {
      const r = await tx.query<StockRec>("select quantity_milli, reserved_milli, out_marked from stock where product_id = $1 and branch_id = $2 and tenant_id = $3", [productId, branchId, tenantId]);
      return this.view(r.rows[0] ?? { quantity_milli: "0", reserved_milli: "0", out_marked: false });
    });
  }
}
