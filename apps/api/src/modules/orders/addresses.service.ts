import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors";
import { DbService } from "../../db/db.service";
import { StorefrontService } from "./storefront.service";

export const MAX_ADDRESSES = 5;
export interface AddressRow { id: string; label: string; address: string; is_default: boolean }
const COLS = "id, label, address, is_default";

/** Saqlangan manzillar: shaxsiy ma'lumot — loglarga va hodisalarga tushmaydi (faqat ID), RLS faqat egasiga ochiq. */
@Injectable()
export class AddressesService {
  constructor(private readonly db: DbService, private readonly shops: StorefrontService) {}

  async list(slug: string, userId: string) {
    const s = await this.shops.resolve(slug);
    return this.db.tx({ tenantId: s.id, userId }, async (tx) => ({
      items: (await tx.query<AddressRow>(`select ${COLS} from customer_addresses where tenant_id = $1 and user_id = $2 order by is_default desc, created_at`, [s.id, userId])).rows,
    }));
  }

  async create(slug: string, userId: string, d: { label: string; address: string; is_default?: boolean }) {
    const s = await this.shops.resolve(slug);
    return this.db.tx({ tenantId: s.id, userId }, async (tx) => {
      await tx.query("select 1 from users where id = $1 for update", [userId]); // limit poygasi: foydalanuvchi qatorini qulflaymiz
      const rows = (await tx.query<AddressRow>(`select ${COLS} from customer_addresses where tenant_id = $1 and user_id = $2`, [s.id, userId])).rows;
      if (rows.some((r) => r.address.toLowerCase() === d.address.toLowerCase())) throw new ApiError(409, "address.duplicate");
      if (rows.length >= MAX_ADDRESSES) throw new ApiError(422, "address.limit", {}, { max: MAX_ADDRESSES });
      const makeDefault = d.is_default === true || rows.length === 0;
      if (makeDefault) await tx.query("update customer_addresses set is_default = false where tenant_id = $1 and user_id = $2 and is_default", [s.id, userId]);
      return (await tx.query<AddressRow>(`insert into customer_addresses (tenant_id, user_id, label, address, is_default) values ($1,$2,$3,$4,$5) returning ${COLS}`, [s.id, userId, d.label, d.address, makeDefault])).rows[0]!;
    });
  }

  async update(slug: string, userId: string, id: string, d: { label?: string; address?: string; is_default?: boolean }) {
    const s = await this.shops.resolve(slug);
    return this.db.tx({ tenantId: s.id, userId }, async (tx) => {
      const old = (await tx.query<AddressRow>(`select ${COLS} from customer_addresses where id = $1 and tenant_id = $2 and user_id = $3 for update`, [id, s.id, userId])).rows[0];
      if (!old) throw new ApiError(404, "not_found");
      if (d.address && d.address.toLowerCase() !== old.address.toLowerCase()) {
        const dup = await tx.query("select 1 from customer_addresses where tenant_id = $1 and user_id = $2 and id <> $3 and lower(address) = lower($4)", [s.id, userId, id, d.address]);
        if (dup.rowCount) throw new ApiError(409, "address.duplicate");
      }
      const makeDefault = d.is_default ?? old.is_default;
      if (d.is_default === true) await tx.query("update customer_addresses set is_default = false where tenant_id = $1 and user_id = $2 and is_default and id <> $3", [s.id, userId, id]);
      return (await tx.query<AddressRow>(`update customer_addresses set label = $4, address = $5, is_default = $6 where id = $1 and tenant_id = $2 and user_id = $3 returning ${COLS}`,
        [id, s.id, userId, d.label ?? old.label, d.address ?? old.address, makeDefault])).rows[0]!;
    });
  }

  async remove(slug: string, userId: string, id: string) {
    const s = await this.shops.resolve(slug);
    return this.db.tx({ tenantId: s.id, userId }, async (tx) => {
      const gone = (await tx.query<{ is_default: boolean }>("delete from customer_addresses where id = $1 and tenant_id = $2 and user_id = $3 returning is_default", [id, s.id, userId])).rows[0];
      if (!gone) throw new ApiError(404, "not_found");
      if (gone.is_default) await tx.query("update customer_addresses set is_default = true where id = (select id from customer_addresses where tenant_id = $1 and user_id = $2 order by created_at limit 1)", [s.id, userId]);
      return { id };
    });
  }
}
