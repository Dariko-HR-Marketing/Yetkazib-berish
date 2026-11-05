import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { Clock } from "../../common/clock";
import { DbService } from "../../db/db.service";
import { AuditService } from "../audit-events/audit.service";
import { EventsService } from "../audit-events/events.service";
import { MARKETING } from "../legal/legal.service";

export const marketingDto = z.object({ granted: z.boolean() }).strict();

@Injectable()
export class ConsentsService {
  constructor(private readonly db: DbService, private readonly clock: Clock, private readonly audit: AuditService, private readonly events: EventsService) {}

  /** Har hujjat bo'yicha oxirgi holat (qabul/qaytarib olish). */
  async mine(userId: string) {
    return this.db.tx({ userId }, async (tx) => {
      const r = await tx.query<{ document: string; version: string; action: string; created_at: Date }>(
        "select distinct on (document) document, version, action, created_at from consents where user_id = $1 and tenant_id is null order by document, created_at desc", [userId]);
      return { items: r.rows.map((c) => ({ document: c.document, version: c.version, action: c.action, at: c.created_at })) };
    });
  }

  async setMarketing(userId: string, granted: boolean, ip?: string | null) {
    return this.db.tx({ userId }, async (tx) => {
      const last = (await tx.query<{ action: string }>("select action from consents where user_id = $1 and document = 'marketing' and tenant_id is null order by created_at desc limit 1", [userId])).rows[0];
      const action = granted ? "accepted" : "revoked";
      if ((last?.action ?? "revoked") !== action) {
        const clean = ip ? ip.replace(/^::ffff:/, "") : null;
        await tx.query(`insert into consents (user_id, document, version, action, channel, ip, text_hash, created_at) values ($1,'marketing',$2,$3,'panel',$4,$5,$6)`,
          [userId, MARKETING.version, action, clean && /^[0-9a-fA-F:.]+$/.test(clean) ? clean : null, MARKETING.text_hash, this.clock.now()]);
        await this.events.emit(tx, granted ? "consent.accepted" : "consent.revoked", { document: "marketing", version: MARKETING.version, channel: "panel" }, { actorId: userId, source: "panel" });
        await this.audit.record(tx, { actorId: userId, action: `consent.${action}`, entity: "user", entityId: userId, after: { document: "marketing" }, ip });
      }
      return { document: "marketing", granted };
    });
  }
}
