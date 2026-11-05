import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";
import { CONFIG, type Config } from "./config";

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  constructor(@Inject(CONFIG) cfg: Config) {
    this.client = new Redis(cfg.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: false });
  }
  async onModuleDestroy() {
    await this.client.quit().catch(() => undefined);
  }
}
