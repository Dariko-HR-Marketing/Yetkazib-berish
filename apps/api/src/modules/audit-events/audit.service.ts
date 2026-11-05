import { Injectable } from "@nestjs/common";
import type { Tx } from "../../db/db.service";
import { requestIdOf } from "../../common/request-context";

export interface AuditInput {
  tenantId?: string | null;
  actorId?: string | null;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

/** A-1: pul, rol, kalit, rozilik, narx o'zgarishi — kim, nima, oldin/keyin, IP, vaqt. Jadval o'zgarmas (trigger). */
@Injectable()
export class AuditService {
  async record(tx: Tx, a: AuditInput): Promise<void> {
    await tx.query(
      `insert into audit_log (tenant_id, actor_id, action, entity, entity_id, before, after, ip, request_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [a.tenantId ?? null, a.actorId ?? null, a.action, a.entity, a.entityId,
       a.before === undefined ? null : JSON.stringify(a.before), a.after === undefined ? null : JSON.stringify(a.after),
       cleanIp(a.ip), requestIdOf()],
    );
  }
}

function cleanIp(ip?: string | null): string | null {
  if (!ip) return null;
  const v = ip.replace(/^::ffff:/, "");
  return /^[0-9a-fA-F:.]+$/.test(v) ? v : null;
}
