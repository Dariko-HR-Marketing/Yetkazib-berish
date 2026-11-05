import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Response } from "express";
import { catchError, from, mergeMap, Observable, tap, throwError } from "rxjs";
import { Clock } from "./clock";
import { sha256 } from "./crypto";
import { ApiError } from "./errors";
import { IS_NO_IDEM } from "./access";
import type { AppRequest } from "./request-context";
import { DbService } from "../db/db.service";

const MUTATING = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STALE_MS = 60_000;

/**
 * CLAUDE.md §3: holatni o'zgartiruvchi har so'rovda `Idempotency-Key`. Bir xil kalit + bir xil so'rov -> saqlangan javob;
 * boshqa so'rov -> 422; bajarilayotgan bo'lsa -> 409. Faqat muvaffaqiyatli javob saqlanadi (xatoda kalit o'chadi — qayta urinish mumkin).
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector, private readonly db: DbService, private readonly clock: Clock) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const skip = this.reflector.getAllAndOverride<boolean>(IS_NO_IDEM, [ctx.getHandler(), ctx.getClass()]);
    if (!MUTATING.has(req.method) || skip || !req.auth) return next.handle();

    const key = req.headers["idempotency-key"];
    if (typeof key !== "string" || !UUID.test(key)) throw new ApiError(400, "idempotency.key_required");
    const actor = req.auth.userId;
    const reqHash = sha256(`${req.method} ${req.path}\n${JSON.stringify(req.body ?? null)}\n${req.headers["x-tenant-id"] ?? ""}`);

    return from(this.claim(key, actor, req.method, req.path, reqHash)).pipe(
      mergeMap((claimed) => {
        if (claimed.replay) {
          res.setHeader("Idempotent-Replayed", "true");
          res.status(claimed.replay.status);
          return from([claimed.replay.body]);
        }
        return next.handle().pipe(
          mergeMap((body) => from(this.store(key, actor, res.statusCode, body ?? null).then(() => body))),
          catchError((e) => from(this.release(key, actor)).pipe(mergeMap(() => throwError(() => e)))),
          tap(() => undefined),
        );
      }),
    );
  }

  private async claim(key: string, actor: string, method: string, path: string, hash: string): Promise<{ replay?: { status: number; body: unknown } }> {
    const now = this.clock.now();
    return this.db.tx({}, async (tx) => {
      const ins = await tx.query("insert into idempotency_keys (key, actor_id, method, path, request_hash, created_at) values ($1,$2,$3,$4,$5,$6) on conflict do nothing", [key, actor, method, path, hash, now]);
      if (ins.rowCount === 1) return {};
      const ex = await tx.query<{ request_hash: string; response_status: number | null; response_body: unknown; created_at: Date }>(
        "select request_hash, response_status, response_body, created_at from idempotency_keys where key = $1 and actor_id = $2 for update", [key, actor]);
      const row = ex.rows[0]!;
      if (row.request_hash !== hash) throw new ApiError(422, "idempotency.key_reused");
      if (row.response_status === null) {
        if (now.getTime() - row.created_at.getTime() > STALE_MS) {
          await tx.query("update idempotency_keys set created_at = $3 where key = $1 and actor_id = $2", [key, actor, now]);
          return {};
        }
        throw new ApiError(409, "idempotency.in_progress");
      }
      return { replay: { status: row.response_status, body: row.response_body } };
    });
  }

  private store(key: string, actor: string, status: number, body: unknown) {
    return this.db.tx({}, (tx) => tx.query("update idempotency_keys set response_status = $3, response_body = $4 where key = $1 and actor_id = $2", [key, actor, status, JSON.stringify(body)]));
  }

  private release(key: string, actor: string) {
    return this.db.tx({}, (tx) => tx.query("delete from idempotency_keys where key = $1 and actor_id = $2 and response_status is null", [key, actor])).catch(() => undefined);
  }
}
