import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { t, type Locale } from "@dostavka/i18n";
import { CONFIG, type Config } from "../../config";
import { DbService, type Tx } from "../../db/db.service";
import { RedisService } from "../../redis.service";
import { SMS_SENDER, type SmsSender } from "../identity/sms.sender";
import { TelegramSender } from "./telegram.sender";

const MAX_ATTEMPTS = 5;
const BACKOFF_S = [10, 60, 300, 1800, 7200];

/**
 * Xabarnoma navbati (outbox): buyurtma holati o'zgarishi bilan bir tranzaksiyada yoziladi, fonda yuboriladi.
 * Kanal: Telegram (telegram_id va bot tokeni bo'lsa), aks holda SMS. Xizmat xabarnomalari (marketing emas) — alohida rozilik talab qilmaydi.
 */
@Injectable()
export class NotificationsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger("Notify");
  private timer?: NodeJS.Timeout;
  constructor(private readonly db: DbService, private readonly tg: TelegramSender, @Inject(SMS_SENDER) private readonly sms: SmsSender,
              private readonly redis: RedisService, @Inject(CONFIG) private readonly cfg: Config) {}

  onApplicationBootstrap() {
    if (this.cfg.BACKGROUND_JOBS !== "on") return;
    this.timer = setInterval(() => void this.processDue().catch((e) => this.log.error(String(e))), 5000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async enqueue(tx: Tx, tenantId: string, userId: string, template: string, params: Record<string, string | number>) {
    await tx.query("insert into notifications (tenant_id, user_id, template, params) values ($1,$2,$3,$4)", [tenantId, userId, template, JSON.stringify(params)]);
  }

  /** Muddati kelgan xabarlarni yuboradi. Qaytaradi: yuborilganlar soni. Bir nechta nusxada ham takror yubormaydi (SKIP LOCKED). */
  async processDue(limit = 50): Promise<number> {
    if (!(await this.redis.client.set("job:notify", "1", "EX", 4, "NX")) && this.cfg.NODE_ENV !== "test") return 0;
    const due = await this.db.tx({ platform: true }, (tx) => tx.query<{ id: string; tenant_id: string }>("select id, tenant_id from notifications where status = 'pending' and next_attempt_at <= now() order by id limit $1", [limit]));
    let sent = 0;
    for (const d of due.rows) {
      const ok = await this.db.tx({ tenantId: d.tenant_id }, async (tx) => {
        const n = (await tx.query<{ id: string; user_id: string; template: string; params: Record<string, string | number>; attempts: number }>("select id, user_id, template, params, attempts from notifications where id = $1 and status = 'pending' for update skip locked", [d.id])).rows[0];
        if (!n) return false;
        const u = (await tx.query<{ phone: string | null; telegram_id: string | null; locale: Locale }>("select phone, telegram_id, locale from users where id = $1", [n.user_id])).rows[0];
        const text = t(u?.locale ?? "uz", n.template, n.params);
        const channel = u?.telegram_id && this.tg.available ? "telegram" : u?.phone ? "sms" : null;
        if (!channel) { await tx.query("update notifications set status = 'skipped', last_error = 'no_channel' where id = $1", [n.id]); return false; }
        try {
          if (channel === "telegram") await this.tg.send(u!.telegram_id!, text); else await this.sms.send(u!.phone!, text);
          await tx.query("update notifications set status = 'sent', channel = $2, sent_at = now(), attempts = attempts + 1 where id = $1", [n.id, channel]);
          return true;
        } catch (e) {
          const attempts = n.attempts + 1;
          const msg = String((e as Error).message ?? e).slice(0, 190).replace(/bot\d+:[\w-]+/g, "bot***");
          if (attempts >= MAX_ATTEMPTS) await tx.query("update notifications set status = 'failed', channel = $2, attempts = $3, last_error = $4 where id = $1", [n.id, channel, attempts, msg]);
          else await tx.query("update notifications set channel = $2, attempts = $3, last_error = $4, next_attempt_at = now() + make_interval(secs => $5) where id = $1", [n.id, channel, attempts, msg, BACKOFF_S[attempts - 1] ?? 7200]);
          return false;
        }
      });
      if (ok) sent++;
    }
    return sent;
  }
}
