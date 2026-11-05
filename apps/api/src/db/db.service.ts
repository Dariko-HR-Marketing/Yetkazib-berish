import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { Pool, type PoolClient } from "pg";
import { CONFIG, type Config } from "../config";

export type Tx = PoolClient;

/** Tranzaksiya konteksti -> PostgreSQL `app.*` o'zgaruvchilari (RLS siyosatlari shularga tayanadi). */
export interface DbCtx {
  tenantId?: string | null;
  userId?: string | null;
  /** Faqat server kodi (admin guard, worker) o'rnatadi. */
  platform?: boolean;
  inviteHash?: string | null;
}

@Injectable()
export class DbService implements OnModuleDestroy {
  readonly pool: Pool;

  constructor(@Inject(CONFIG) cfg: Config) {
    this.pool = new Pool({ connectionString: cfg.APP_DATABASE_URL, max: 10 });
  }

  /**
   * Bitta tranzaksiya. Har qanday xato — ROLLBACK. Kontekst `SET LOCAL` (set_config(..., true)) bilan
   * faqat shu tranzaksiya uchun o'rnatiladi, shuning uchun pool ulanishlari orasida sizib o'tmaydi.
   */
  async tx<T>(ctx: DbCtx, fn: (tx: Tx) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await applyCtx(client, ctx);
      const res = await fn(client);
      await client.query("commit");
      return res;
    } catch (e) {
      await client.query("rollback").catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}

export async function applyCtx(client: Tx, ctx: DbCtx) {
  await client.query(
    `select set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true),
            set_config('app.platform', $3, true), set_config('app.invite_token_hash', $4, true)`,
    [ctx.tenantId ?? "", ctx.userId ?? "", ctx.platform ? "on" : "off", ctx.inviteHash ?? ""],
  );
}
