import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors";
import { Clock } from "../../common/clock";
import type { Tx } from "../../db/db.service";
import { EVENT_SCHEMAS, findPii, type EventName, type EventSource } from "./event-registry";

export interface EmitContext {
  tenantId?: string | null;
  actorId?: string | null;
  source: EventSource;
}

/** A-2: hodisa sxemasi lug'atga mos kelmasa rad etiladi. Outbox: avval `events` jadvaliga (biznes tranzaksiyasi bilan), keyin navbatga. */
@Injectable()
export class EventsService {
  constructor(private readonly clock: Clock) {}

  async emit<N extends EventName>(tx: Tx, name: N, properties: Record<string, unknown>, ctx: EmitContext): Promise<string> {
    const schema = EVENT_SCHEMAS[name];
    if (!schema) throw new ApiError(500, "internal_error", { reason: "unknown_event", name });
    const parsed = schema.safeParse(properties);
    if (!parsed.success) throw new ApiError(500, "internal_error", { reason: "event_schema_mismatch", name, issues: parsed.error.issues.map((i) => i.path.join(".")) });
    const pii = findPii(parsed.data);
    if (pii) throw new ApiError(500, "internal_error", { reason: "event_contains_pii", name, path: pii });
    // RETURNING ishlatilmaydi: tenantsiz hodisa uchun SELECT siyosati (RLS) qatorni qaytarishga ruxsat bermaydi.
    const id = randomUUID();
    await tx.query(
      `insert into events (id, name, ts, tenant_id, actor_id, source, properties) values ($1,$2,$3,$4,$5,$6,$7)`,
      [id, name, this.clock.now(), ctx.tenantId ?? null, ctx.actorId ?? null, ctx.source, JSON.stringify(parsed.data)],
    );
    return id;
  }
}
