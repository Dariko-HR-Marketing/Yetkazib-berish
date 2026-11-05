import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { NoIdempotency, Public } from "./common/access";
import { DbService } from "./db/db.service";
import { RedisService } from "./redis.service";

/** Orkestrator/monitoring uchun: baza va Redis'ga tegib ko'radi. Ichki ma'lumot (versiya, xost) qaytarmaydi. */
@Controller("v1")
export class HealthController {
  constructor(private readonly db: DbService, private readonly redis: RedisService) {}

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
