import { Controller, Get, Headers, Inject, Res, ServiceUnavailableException } from "@nestjs/common";
import type { Response } from "express";
import { ApiError } from "./common/errors";
import { timingSafeEqual } from "node:crypto";
import { CONFIG, type Config } from "./config";
import { renderMetrics } from "./common/metrics";
import { NoIdempotency, Public } from "./common/access";
import { DbService } from "./db/db.service";
import { RedisService } from "./redis.service";

/** Orkestrator/monitoring uchun: baza va Redis'ga tegib ko'radi. Ichki ma'lumot (versiya, xost) qaytarmaydi. */
@Controller("v1")
export class HealthController {
  constructor(private readonly db: DbService, private readonly redis: RedisService, @Inject(CONFIG) private readonly cfg: Config) {}

  /** Prometheus ko'rsatkichlari. Bearer METRICS_TOKEN kerak; sozlanmagan bo'lsa — 404. */
  @Public() @NoIdempotency() @Get("metrics")
  metrics(@Res({ passthrough: true }) res: Response, @Headers("authorization") auth?: string) {
    const want = this.cfg.METRICS_TOKEN;
    if (!want) throw new ApiError(404, "not_found");
    const got = (auth ?? "").replace(/^Bearer /, "");
    const a = Buffer.from(got), b = Buffer.from(want);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ApiError(401, "auth.unauthorized");
    res.type("text/plain; version=0.0.4; charset=utf-8"); // faqat muvaffaqiyatda (xato JSON bo'lib qoladi)
    return renderMetrics();
  }

  @Public() @NoIdempotency() @Get("health")
  async health() {
    try {
      await this.db.tx({}, (tx) => tx.query("select 1"));
      if ((await this.redis.client.ping()) !== "PONG") throw new Error("redis");
    } catch {
      throw new ServiceUnavailableException();
    }
    return { status: "ok" };
  }
}
