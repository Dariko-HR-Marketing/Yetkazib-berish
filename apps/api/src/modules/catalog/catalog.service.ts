import { Injectable } from "@nestjs/common";
import type { z } from "zod";
import type { productCreateDto } from "./catalog.dto";
import { ApiError } from "../../common/errors";
import { DbService, type Tx } from "../../db/db.service";
import { AuditService } from "../audit-events/audit.service";
import { LOW_STOCK_MILLI, decodeCursor, encodeCursor, stockState } from "./stock-state";

type ProductInput = Record<string, string | number | null | undefined>;

interface ProductRow {
  id: string; category_id: string | null; name_uz: string; name_ru: string | null; sku: string | null; barcode: string | null; mxik: string | null;
  unit: string; price_tiyin: string; status: string; description_uz: string | null; description_ru: string | null; image_url: string | null; created_at: Date; updated_at: Date;
  q: string | null; r: string | null; avail: string; out_marked: boolean | null; cur_at: string;
}

export const toProduct = (p: ProductRow) => ({
  id: p.id, category_id: p.category_id, name_uz: p.name_uz, name_ru: p.name_ru, sku: p.sku, barcode: p.barcode, mxik: p.mxik,
  unit: p.unit, price_tiyin: Number(p.price_tiyin), status: p.status, description_uz: p.description_uz, description_ru: p.description_ru, image_url: p.image_url,
  created_at: p.created_at, updated_at: p.updated_at,
  stock: {
    quantity_milli: Number(p.q ?? 0), reserved_milli: Number(p.r ?? 0), available_milli: Number(p.avail),
    out_marked: p.out_marked ?? false,
    state: stockState({ quantity_milli: p.avail, reserved_milli: 0, out_marked: false }),
  },
});

/** pg unikal cheklov buzilishi -> 409 */
export function mapUnique(e: unknown): never {
  const err = e as { code?: string; constraint?: string };
  if (err?.code === "23505") {
    if (err.constraint === "products_barcode_uk") throw new ApiError(409, "catalog.duplicate_barcode");
    if (err.constraint === "products_sku_uk") throw new ApiError(409, "catalog.duplicate_sku");
    if (err.constraint === "categories_name_uk") throw new ApiError(409, "catalog.category_exists");
  }
  throw e;
}

@Injectable()
export class CatalogService {
  constructor(private readonly db: DbService, private readonly audit: AuditService) {}

  // ---------------------------------------------------------------- kategoriyalar
  listCategories(tenantId: string, userId: string) {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      const r = await tx.query("select id, name_uz, name_ru, sort from categories where tenant_id = $1 order by sort, lower(name_uz)", [tenantId]);
      return { items: r.rows };
    });
  }

  createCategory(tenantId: string, userId: string, d: { name_uz: string; name_ru?: string | null; sort?: number }, ip?: string | null) {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      try {
        const c = (await tx.query("insert into categories (tenant_id, name_uz, name_ru, sort) values ($1,$2,$3,$4) returning id, name_uz, name_ru, sort", [tenantId, d.name_uz, d.name_ru ?? null, d.sort ?? 0])).rows[0]!;
        await this.audit.record(tx, { tenantId, actorId: userId, action: "category.created", entity: "category", entityId: c.id, after: { name_uz: d.name_uz }, ip });
        return c;
      } catch (e) { return mapUnique(e); }
    });
  }

  updateCategory(tenantId: string, userId: string, id: string, d: { name_uz?: string; name_ru?: string | null; sort?: number }, ip?: string | null) {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      const old = (await tx.query("select id, name_uz, name_ru, sort from categories where id = $1 and tenant_id = $2 for update", [id, tenantId])).rows[0];
      if (!old) throw new ApiError(404, "not_found");
      const next = { name_uz: d.name_uz ?? old.name_uz, name_ru: d.name_ru === undefined ? old.name_ru : d.name_ru, sort: d.sort ?? old.sort };
      try {
        await tx.query("update categories set name_uz = $3, name_ru = $4, sort = $5 where id = $1 and tenant_id = $2", [id, tenantId, next.name_uz, next.name_ru, next.sort]);
      } catch (e) { return mapUnique(e); }
      await this.audit.record(tx, { tenantId, actorId: userId, action: "category.updated", entity: "category", entityId: id, before: old, after: next, ip });
      return { id, ...next };
    });
  }

  deleteCategory(tenantId: string, userId: string, id: string, ip?: string | null) {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      const r = await tx.query("delete from categories where id = $1 and tenant_id = $2 returning name_uz", [id, tenantId]);
      if (!r.rowCount) throw new ApiError(404, "not_found");
      await this.audit.record(tx, { tenantId, actorId: userId, action: "category.deleted", entity: "category", entityId: id, before: { name_uz: r.rows[0].name_uz }, ip });
      return { id };
    });
  }

  // ---------------------------------------------------------------- mahsulotlar
  private async categoryOk(tx: Tx, tenantId: string, categoryId: string | null | undefined) {
    if (!categoryId) return;
    const r = await tx.query("select 1 from categories where id = $1 and tenant_id = $2", [categoryId, tenantId]);
    if (!r.rowCount) throw new ApiError(400, "validation.failed", { issues: [{ path: "category_id", message: "kategoriya topilmadi" }] });
  }

  private static readonly SELECT = `
    select p.id, p.category_id, p.name_uz, p.name_ru, p.sku, p.barcode, p.mxik, p.unit, p.price_tiyin, p.status, p.description_uz, p.description_ru, p.image_url,
           p.created_at, p.updated_at,
           to_char(p.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cur_at,
           st.q, st.r, coalesce(st.avail, 0) as avail, st.out_marked
      from products p
      left join lateral (
        select sum(s.quantity_milli) as q, sum(s.reserved_milli) as r,
               sum(case when s.out_marked then 0 else greatest(0, s.quantity_milli - s.reserved_milli) end) as avail,
               bool_and(s.out_marked) as out_marked
          from stock s where s.product_id = p.id and s.tenant_id = p.tenant_id and ($2::uuid is null or s.branch_id = $2::uuid)) st on true`;

  async createProduct(tenantId: string, userId: string, d: z.infer<typeof productCreateDto>, ip?: string | null) {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      await this.categoryOk(tx, tenantId, d.category_id);
      let id: string;
      try {
        id = (await tx.query<{ id: string }>(
          `insert into products (tenant_id, category_id, name_uz, name_ru, sku, barcode, mxik, unit, price_tiyin, status, description_uz, description_ru, image_url)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
          [tenantId, d.category_id ?? null, d.name_uz, d.name_ru ?? null, d.sku ?? null, d.barcode ?? null, d.mxik ?? null, d.unit, d.price_tiyin, d.status, d.description_uz ?? null, d.description_ru ?? null, d.image_url ?? null])).rows[0]!.id;
      } catch (e) { return mapUnique(e); }
      await this.audit.record(tx, { tenantId, actorId: userId, action: "product.created", entity: "product", entityId: id, after: { name_uz: d.name_uz, price_tiyin: d.price_tiyin }, ip });
      return this.fetchOne(tx, tenantId, id, null);
    });
  }

  private async fetchOne(tx: Tx, tenantId: string, id: string, branchId: string | null) {
    const r = await tx.query<ProductRow>(`${CatalogService.SELECT} where p.tenant_id = $1 and p.id = $3`, [tenantId, branchId, id]);
    if (!r.rows[0]) throw new ApiError(404, "not_found");
    return toProduct(r.rows[0]);
  }

  getProduct(tenantId: string, userId: string, id: string, branchId?: string) {
    return this.db.tx({ tenantId, userId }, (tx) => this.fetchOne(tx, tenantId, id, branchId ?? null));
  }

  async updateProduct(tenantId: string, userId: string, id: string, d: ProductInput, ip?: string | null) {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      const old = (await tx.query("select * from products where id = $1 and tenant_id = $2 for update", [id, tenantId])).rows[0];
      if (!old) throw new ApiError(404, "not_found");
      if (d.category_id !== undefined) await this.categoryOk(tx, tenantId, d.category_id as string | null | undefined);
      const pick = (k: string) => (d[k] === undefined ? old[k] : d[k]);
      const next = {
        category_id: pick("category_id"), name_uz: pick("name_uz"), name_ru: pick("name_ru"), sku: pick("sku"), barcode: pick("barcode"), mxik: pick("mxik"),
        unit: pick("unit"), price_tiyin: pick("price_tiyin"), status: pick("status"), description_uz: pick("description_uz"), description_ru: pick("description_ru"), image_url: pick("image_url"),
      };
      try {
        await tx.query(
          `update products set category_id=$3, name_uz=$4, name_ru=$5, sku=$6, barcode=$7, mxik=$8, unit=$9, price_tiyin=$10, status=$11,
                  description_uz=$12, description_ru=$13, image_url=$14, updated_at=now() where id=$1 and tenant_id=$2`,
          [id, tenantId, next.category_id, next.name_uz, next.name_ru, next.sku, next.barcode, next.mxik, next.unit, next.price_tiyin, next.status, next.description_uz, next.description_ru, next.image_url]);
      } catch (e) { return mapUnique(e); }
      // A-1: narx o'zgarishi auditga (oldin/keyin); boshqa o'zgarishlar ham yoziladi.
      const priceChanged = Number(old.price_tiyin) !== Number(next.price_tiyin);
      await this.audit.record(tx, {
        tenantId, actorId: userId, action: priceChanged ? "product.price_changed" : "product.updated", entity: "product", entityId: id, ip,
        before: { price_tiyin: Number(old.price_tiyin), status: old.status, name_uz: old.name_uz }, after: { price_tiyin: Number(next.price_tiyin), status: next.status, name_uz: next.name_uz },
      });
      return this.fetchOne(tx, tenantId, id, null);
    });
  }

  /** O'chirish = arxivlash (tarix saqlanadi; shtrix-kod/artikul bo'shaydi). */
  archiveProduct(tenantId: string, userId: string, id: string, ip?: string | null) {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      const r = await tx.query("update products set status = 'archived', updated_at = now() where id = $1 and tenant_id = $2 and status <> 'archived' returning name_uz", [id, tenantId]);
      if (!r.rowCount) throw new ApiError(404, "not_found");
      await this.audit.record(tx, { tenantId, actorId: userId, action: "product.archived", entity: "product", entityId: id, before: { name_uz: r.rows[0].name_uz }, ip });
      return { id };
    });
  }

  listProducts(tenantId: string, userId: string, q: { limit: number; cursor?: string; q?: string; category_id?: string; status?: string; branch_id?: string; stock?: string; mxik?: string }) {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      const after = decodeCursor<{ at: string; id: string }>(q.cursor);
      if (q.cursor && (!after || typeof after.at !== "string" || typeof after.id !== "string")) throw new ApiError(400, "validation.failed", { issues: [{ path: "cursor", message: "noto'g'ri kursor" }] });
      if (q.branch_id) {
        const b = await tx.query("select 1 from branches where id = $1 and tenant_id = $2", [q.branch_id, tenantId]);
        if (!b.rowCount) throw new ApiError(404, "not_found");
      }
      const search = q.q ? `%${q.q.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
      const r = await tx.query<ProductRow>(
        `select * from (${CatalogService.SELECT} where p.tenant_id = $1) x
          where ($3::text is null or x.status = $3)
            and ($3::text is not null or x.status <> 'archived')
            and ($4::uuid is null or x.category_id = $4)
            and ($5::text is null or lower(x.name_uz) like $5 or lower(coalesce(x.name_ru,'')) like $5 or lower(coalesce(x.sku,'')) like $5 or x.barcode like $5)
            and ($6::text is null or ($6 = 'out' and x.avail <= 0) or ($6 = 'low' and x.avail > 0 and x.avail <= ${LOW_STOCK_MILLI}) or ($6 = 'in' and x.avail > ${LOW_STOCK_MILLI}))
            and ($7::text is null or x.mxik is null)
            and ($8::timestamptz is null or (x.created_at, x.id) > ($8::timestamptz, $9::uuid))
          order by x.created_at, x.id limit $10`,
        [tenantId, q.branch_id ?? null, q.status ?? null, q.category_id ?? null, search, q.stock ?? null, q.mxik ?? null, after?.at ?? null, after?.id ?? null, q.limit + 1]);
      const page = r.rows.slice(0, q.limit);
      const last = page[page.length - 1];
      return { items: page.map(toProduct), next_cursor: r.rows.length > q.limit && last ? encodeCursor({ at: last.cur_at, id: last.id }) : null };
    });
  }

  /** Panel sarlavhasi: SKU soni, MXIK'siz, tugagan/tugayotgan, oxirgi import. */
  summary(tenantId: string, userId: string, branchId?: string) {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      const r = await tx.query(
        `with p as (${CatalogService.SELECT} where p.tenant_id = $1 and p.status <> 'archived')
         select count(*)::int as products, count(*) filter (where mxik is null)::int as mxik_missing,
                count(*) filter (where avail <= 0)::int as out, count(*) filter (where avail > 0 and avail <= ${LOW_STOCK_MILLI})::int as low from p`,
        [tenantId, branchId ?? null]);
      const j = await tx.query("select created_at from import_jobs where tenant_id = $1 order by created_at desc limit 1", [tenantId]);
      return { ...r.rows[0], last_import_at: j.rows[0]?.created_at ?? null };
    });
  }
}
