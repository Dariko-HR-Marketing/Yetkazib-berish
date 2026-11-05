import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Queue } from "bullmq";
import { CONFIG, type Config } from "../../config";
import { DbService } from "../../db/db.service";
import { RedisService } from "../../redis.service";

export const EVENTS_QUEUE = "events";

/** Outbox dispatcher: `published_at is null` hodisalarni BullMQ navbatiga yuboradi (jobId = event_id — takrorlanmaydi). */
@Injectable()
export class EventsDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("EventsDispatcher");
  readonly queue: Queue;
  private timer?: NodeJS.Timeout;

  constructor(private readonly db: DbService, redis: RedisService, @Inject(CONFIG) private readonly cfg: Config) {
    this.queue = new Queue(EVENTS_QUEUE, { connection: redis.client.duplicate({ maxRetriesPerRequest: null }) });
  }

  onModuleInit() {
    if (this.cfg.EVENTS_DISPATCH === "on") this.timer = setInterval(() => void this.drain().catch((e) => this.log.error(String(e))), 2000);
  }

  async drain(limit = 100): Promise<number> {
    return this.db.tx({ platform: true }, async (tx) => {
      const rows = await tx.query<{ id: string; name: string; tenant_id: string | null; properties: unknown; ts: Date }>(
        `select id, name, tenant_id, properties, ts from events where published_at is null order by ts limit $1 for update skip locked`, [limit]);
      for (const e of rows.rows) {
        await this.queue.add(e.name, { event_id: e.id, name: e.name, tenant_id: e.tenant_id, properties: e.properties, ts: e.ts }, { jobId: e.id, removeOnComplete: 1000, removeOnFail: 5000 });
      }
      if (rows.rowCount) await tx.query("update events set published_at = now() where id = any($1::uuid[])", [rows.rows.map((r) => r.id)]);
      return rows.rowCount ?? 0;
    });
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.queue.close();
  }
}
