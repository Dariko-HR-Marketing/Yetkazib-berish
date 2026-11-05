import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from "@nestjs/common";
import type { Response } from "express";
import { Observable, tap } from "rxjs";
import type { AppRequest } from "./request-context";

/** So'rov jurnali: faqat metod, marshrut shabloni (tokenlarsiz), status, davomiylik, foydalanuvchi ID. Body va telefon yo'q. */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly log = new Logger("Http");
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const t0 = Date.now();
    const done = () => this.log.log(`${req.method} ${(req.route as { path?: string } | undefined)?.path ?? "?"} ${res.statusCode} ${Date.now() - t0}ms rid=${req.requestId} uid=${req.auth?.userId ?? "-"}`);
    return next.handle().pipe(tap({ next: done, error: done }));
  }
}
