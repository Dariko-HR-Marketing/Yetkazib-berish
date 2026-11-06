import { Controller, Get, Query, Req } from "@nestjs/common";
import { z } from "zod";
import { PlatformAdmin } from "../../common/access";
import type { AppRequest } from "../../common/request-context";
import { parse } from "../../common/validate";
import { DbService } from "../../db/db.service";

const q = z.object({ q: z.string().trim().max(100).optional(), limit: z.coerce.number().int().min(1).max(200).default(100) });

/** Platforma admini: do'konlar ro'yxati (telefon va shaxsiy ma'lumotsiz). */
@Controller("v1")
export class AdminController {
  constructor(private readonly db: DbService) {}

  @Get("admin/tenants") @PlatformAdmin()
  async tenants(@Query() query: unknown, @Req() req: AppRequest) {
    const d = parse(q, query);
    const search = d.q ? `%${d.q.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
    const r = await this.db.tx({ userId: req.auth!.userId, platform: true }, (tx) => tx.query<{ id: string; name: string; slug: string; status: string; plan_code: string; plan_version: number; created_at: Date; members: number }>(
      `select t.id, t.name, t.slug, t.status, t.plan_code, t.plan_version, t.created_at, (select count(*)::int from memberships m where m.tenant_id = t.id and m.status = 'active') as members
         from tenants t where ($1::text is null or lower(t.name) like $1 or t.slug like $1) order by t.created_at desc limit $2`, [search, d.limit]));
    return { items: r.rows };
  }
}
