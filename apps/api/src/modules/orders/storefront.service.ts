import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors";
import { DbService, type DbCtx } from "../../db/db.service";
import { FeaturesService } from "../plans-flags/features.service";
import { PaymentsService } from "../payments/payments.service";
import { DeliverySettingsService } from "./delivery-settings.service";
import { decodeCursor, encodeCursor, LOW_STOCK_MILLI } from "../catalog/stock-state";

export interface ShopRef { id: string; name: string; slug: string }

/** Ommaviy vitrina: kirishsiz o'qish. Faqat faol do'kon va storefront.own yoqilgan bo'lsa; aks holda 404 (mavjudligi oshkor bo'lmaydi). */
@Injectable()
export class StorefrontService {
  constructor(private readonly db: DbService, private readonly features: FeaturesService, private readonly delivery: DeliverySettingsService, private readonly payments: PaymentsService) {}

  /** slug -> do'kon. Yagona platforma-kontekst so'rovi: faqat id/nom/holat o'qiladi (RLS tenant kontekstini talab qiladi). */
  async resolve(slug: string): Promise<ShopRef> {
    if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) throw new ApiError(404, "not_found");
    const ctx: DbCtx = { platform: true };
    const r = await this.db.tx(ctx, (tx) => tx.query<{ id: string; name: string; slug: string; status: string }>("select id, name, slug, status from tenants where slug = $1", [slug]));
    const t = r.rows[0];
    if (!t || t.status !== "active" || !(await this.features.can(t.id, "storefront.own"))) throw new ApiError(404, "not_found");
    return { id: t.id, name: t.name, slug: t.slug };
  }

  async shop(slug: string) {
    const s = await this.resolve(slug);
    const [cash, stockVisible] = await Promise.all([this.features.can(s.id, "payment.cash"), this.features.can(s.id, "stock.visible")]);
    const branches = await this.db.tx({ tenantId: s.id }, (tx) => tx.query<{ id: string; name: string; address: string }>("select id, name, address from branches where tenant_id = $1 order by created_at", [s.id]));
    return { slug: s.slug, name: s.name, branches: branches.rows, features: { cash, stock_visible: stockVisible, loyalty: await this.features.can(s.id, "loyalty.points"), online: await this.db.tx({ tenantId: s.id }, async (tx) => (await this.payments.activeProvider(tx, s.id)) !== null) }, delivery: await this.delivery.get(s.id) };
  }

  /** Umumiy katalog («Yaqin do'konlar»): faqat faol va catalog.marketplace_listing yoqilgan do'konlar. */
  async marketplace() {
    const all = await this.db.tx({ platform: true }, (tx) => tx.query<{ id: string; name: string; slug: string }>("select id, name, slug from tenants where status = 'active' order by name limit 500"));
    const out: { name: string; slug: string }[] = [];
    for (const t of all.rows) if ((await this.features.can(t.id, "catalog.marketplace_listing")) && (await this.features.can(t.id, "storefront.own"))) out.push({ name: t.name, slug: t.slug });
    return { items: out };
  }

  async categories(slug: string) {
    const s = await this.resolve(slug);
    const r = await this.db.tx({ tenantId: s.id }, (tx) => tx.query("select id, name_uz, name_ru from categories where tenant_id = $1 order by sort, lower(name_uz)", [s.id]));
    return { items: r.rows };
  }

  async products(slug: string, q: { branch_id?: string; q?: string; category_id?: string; limit: number; cursor?: string }) {
    const s = await this.resolve(slug);
    const visible = await this.features.can(s.id, "stock.visible");
    const after = decodeCursor<{ at: string; id: string }>(q.cursor);
    if (q.cursor && (!after || typeof after.at !== "string" || typeof after.id !== "string")) throw new ApiError(400, "validation.failed", { issues: [{ path: "cursor", message: "noto'g'ri kursor" }] });
    const search = q.q ? `%${q.q.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
    return this.db.tx({ tenantId: s.id }, async (tx) => {
      let branchId = q.branch_id ?? null;
      if (branchId) { if (!(await tx.query("select 1 from branches where id = $1 and tenant_id = $2", [branchId, s.id])).rowCount) throw new ApiError(404, "not_found"); }
      else branchId = (await tx.query<{ id: string }>("select id from branches where tenant_id = $1 order by created_at limit 1", [s.id])).rows[0]?.id ?? null;
      const r = await tx.query<{ id: string; category_id: string | null; name_uz: string; name_ru: string | null; unit: string; price_tiyin: string; description_uz: string | null; description_ru: string | null; avail: string; cur_at: string; created_at: Date }>(
        `select p.id, p.category_id, p.name_uz, p.name_ru, p.unit, p.price_tiyin, p.description_uz, p.description_ru, p.created_at,
                to_char(p.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cur_at,
                coalesce((select case when st.out_marked then 0 else greatest(0, st.quantity_milli - st.reserved_milli) end from stock st
                           where st.product_id = p.id and st.tenant_id = p.tenant_id and st.branch_id = $2::uuid), 0) as avail
           from products p
          where p.tenant_id = $1 and p.status = 'active'
            and ($3::uuid is null or p.category_id = $3)
            and ($4::text is null or lower(p.name_uz) like $4 or lower(coalesce(p.name_ru,'')) like $4)
            and ($5::timestamptz is null or (p.created_at, p.id) > ($5::timestamptz, $6::uuid))
          order by p.created_at, p.id limit $7`,
        [s.id, branchId, q.category_id ?? null, search, after?.at ?? null, after?.id ?? null, q.limit + 1]);
      const page = r.rows.slice(0, q.limit);
      const last = page[page.length - 1];
      return {
        branch_id: branchId,
        items: page.map((p) => {
          const a = Number(p.avail);
          const state = a <= 0 ? "out" : visible && a <= LOW_STOCK_MILLI ? "low" : "in";
          return { id: p.id, category_id: p.category_id, name_uz: p.name_uz, name_ru: p.name_ru, unit: p.unit, price_tiyin: Number(p.price_tiyin),
            description_uz: p.description_uz, description_ru: p.description_ru, availability: { state, available_milli: visible ? a : null } };
        }),
        next_cursor: r.rows.length > q.limit && last ? encodeCursor({ at: last.cur_at, id: last.id }) : null,
      };
    });
  }
}
