import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { CONFIG, type Config } from "../../config";
import { RedisService } from "../../redis.service";
import { ApiError } from "../../common/errors";
import { DbService, type Tx } from "../../db/db.service";
import { EventsService } from "../audit-events/events.service";
import { FeaturesService } from "../plans-flags/features.service";

const SEED_DIR = process.env.SEED_DIR ?? resolve(__dirname, "../../../../../infra/seed");
interface Rules {
  point_value_uzs: number; expiry_days: number; max_pay_share_of_goods_pct: number; accrual_hold_hours: number; default_cashback_pct: number;
  tiers: { name: string; from_uzs_90d: number; extra_pct: number }[];
}
export const RULES: Rules = JSON.parse(readFileSync(join(SEED_DIR, "loyalty_rules.json"), "utf8"));
/** 1 ball = point_value_uzs so'm = point_value_uzs × 100 tiyin. */
export const POINT_TIYIN = RULES.point_value_uzs * 100;
const DAY = 86_400_000;

/** Ball: o'zgarmas ledger + tezkor balans (bitta tranzaksiyada). Faqat pul bilan to'langan mahsulot qismiga hisoblanadi; yetkazish ballga to'lanmaydi. */
@Injectable()
export class LoyaltyService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger("Loyalty");
  private timer?: NodeJS.Timeout;
  constructor(private readonly db: DbService, private readonly features: FeaturesService, private readonly events: EventsService,
              private readonly redis: RedisService, @Inject(CONFIG) private readonly cfg: Config) {}

  onApplicationBootstrap() {
    if (this.cfg.BACKGROUND_JOBS !== "on") return;
    // Soatiga bir tekshiriladi; Redis qulfi bilan kuniga bir marta (ko'p nusxada ham bitta bajaradi).
    this.timer = setInterval(() => void this.daily().catch((e) => this.log.error(String(e))), 3_600_000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  /** Kunlik ish: muddati o'tgan ballarni yoqish va ledger ↔ balans solishtirish (nomuvofiqlik — ERROR jurnali, monitoringda ogohlantirish). */
  async daily(): Promise<{ burned: number; mismatches: number } | null> {
    const lock = await this.redis.client.set("job:loyalty:daily", "1", "EX", 23 * 3600, "NX");
    if (!lock) return null;
    const burned = await this.expireDue();
    const diff = await this.reconcile();
    if (diff.length) this.log.error(`ball ledgeri nomuvofiq: ${diff.length} ta hisob`);
    this.log.log(`kunlik ball ishi: yoqildi=${burned}, nomuvofiq=${diff.length}`);
    return { burned, mismatches: diff.length };
  }

  enabled(tenantId: string) { return this.features.can(tenantId, "loyalty.points"); }

  /** Oxirgi 90 kunda bajarilgan buyurtmalardagi pul bilan to'langan mahsulot summasi (so'm) -> daraja. */
  async tier(tx: Tx, tenantId: string, userId: string) {
    const r = await tx.query<{ s: string | null }>(
      "select coalesce(sum(subtotal_tiyin - discount_tiyin), 0) as s from orders where tenant_id = $1 and customer_id = $2 and status = 'completed' and updated_at > now() - interval '90 days'", [tenantId, userId]);
    const uzs = Math.floor(Number(r.rows[0]!.s) / 100);
    const t = [...RULES.tiers].sort((a, b) => b.from_uzs_90d - a.from_uzs_90d).find((x) => uzs >= x.from_uzs_90d) ?? RULES.tiers[0]!;
    return { name: t.name, cashback_pct: RULES.default_cashback_pct + t.extra_pct, spent_90d_uzs: uzs };
  }

  async summary(tenantId: string, userId: string) {
    return this.db.tx({ tenantId, userId }, async (tx) => {
      const on = await this.enabled(tenantId);
      const b = (await tx.query<{ total: string; spendable: string }>(
        "select coalesce(sum(points), 0) as total, coalesce(sum(points) filter (where available_at <= now()), 0) as spendable from ledger_entries where tenant_id = $1 and user_id = $2", [tenantId, userId])).rows[0]!;
      const tier = await this.tier(tx, tenantId, userId);
      return { enabled: on, balance_points: Number(b.total), spendable_points: Number(b.spendable), pending_points: Number(b.total) - Number(b.spendable), tier: tier.name, cashback_pct: tier.cashback_pct,
        point_value_tiyin: POINT_TIYIN, max_pay_share_pct: RULES.max_pay_share_of_goods_pct, hold_hours: RULES.accrual_hold_hours, expiry_days: RULES.expiry_days };
    });
  }

  private async lockBalance(tx: Tx, tenantId: string, userId: string): Promise<number> {
    await tx.query("insert into loyalty_balances (tenant_id, user_id) values ($1,$2) on conflict do nothing", [tenantId, userId]);
    return Number((await tx.query<{ b: string }>("select balance_points as b from loyalty_balances where tenant_id = $1 and user_id = $2 for update", [tenantId, userId])).rows[0]!.b);
  }
  private async entry(tx: Tx, tenantId: string, userId: string, kind: "accrual" | "spend" | "reversal" | "expire", points: number, orderId: string | null, availableAt?: Date, expiresAt?: Date) {
    const bal = (await this.lockBalance(tx, tenantId, userId)) + points;
    if (bal < 0) throw new ApiError(422, "loyalty.insufficient");
    await tx.query("insert into ledger_entries (tenant_id, user_id, kind, points, order_id, available_at, expires_at) values ($1,$2,$3,$4,$5,coalesce($6, now()),$7)", [tenantId, userId, kind, points, orderId, availableAt ?? null, expiresAt ?? null]);
    await tx.query("update loyalty_balances set balance_points = $3, updated_at = now() where tenant_id = $1 and user_id = $2", [tenantId, userId, bal]);
  }

  /** Buyurtma berishda: ball bilan to'lash chegarasini tekshiradi va sarflaydi. Qaytaradi: chegirma (tiyin). */
  async spendForOrder(tx: Tx, tenantId: string, userId: string, orderId: string, points: number, goodsTiyin: number): Promise<number> {
    if (points <= 0) return 0;
    const discount = points * POINT_TIYIN;
    if (discount * 100 > goodsTiyin * RULES.max_pay_share_of_goods_pct) throw new ApiError(422, "loyalty.over_limit", { max_pct: RULES.max_pay_share_of_goods_pct }, { pct: RULES.max_pay_share_of_goods_pct });
    await this.lockBalance(tx, tenantId, userId);
    const sp = Number((await tx.query<{ s: string }>("select coalesce(sum(points) filter (where available_at <= now()), 0) as s from ledger_entries where tenant_id = $1 and user_id = $2", [tenantId, userId])).rows[0]!.s);
    if (sp < points) throw new ApiError(422, "loyalty.insufficient", { spendable_points: sp });
    await this.entry(tx, tenantId, userId, "spend", -points, orderId);
    await this.events.emit(tx, "points.spent", { points, order_id: orderId }, { tenantId, actorId: userId, source: "vitrina" });
    return discount;
  }

  /** Bekor/muvaffaqiyatsiz: sarflangan ball qaytariladi (bir marta). */
  async reverseForOrder(tx: Tx, tenantId: string, userId: string, orderId: string, points: number) {
    if (points <= 0) return;
    const done = await tx.query("select 1 from ledger_entries where tenant_id = $1 and order_id = $2 and kind = 'reversal'", [tenantId, orderId]);
    if (done.rowCount) return;
    await this.entry(tx, tenantId, userId, "reversal", points, orderId);
  }

  /** Yig'ishda chegirma kamaytirilsa — farq qaytariladi. */
  async refundDifference(tx: Tx, tenantId: string, userId: string, orderId: string, points: number) {
    if (points > 0) await this.entry(tx, tenantId, userId, "reversal", points, orderId);
  }

  /** Bajarilgan buyurtma: pul bilan to'langan mahsulot qismiga keshbek (ushlab turish 24 soat, muddati 90 kun). Bir marta. */
  async accrueForOrder(tx: Tx, tenantId: string, userId: string, orderId: string, goodsPaidTiyin: number) {
    if (!(await this.enabled(tenantId)) || goodsPaidTiyin <= 0) return;
    const tier = await this.tier(tx, tenantId, userId);
    const points = Math.floor((goodsPaidTiyin * tier.cashback_pct) / (100 * POINT_TIYIN));
    if (points <= 0) return;
    const exists = await tx.query("select 1 from ledger_entries where tenant_id = $1 and order_id = $2 and kind = 'accrual'", [tenantId, orderId]);
    if (exists.rowCount) return;
    const now = Date.now();
    await this.entry(tx, tenantId, userId, "accrual", points, orderId, new Date(now + RULES.accrual_hold_hours * 3_600_000), new Date(now + RULES.expiry_days * DAY));
    await this.events.emit(tx, "points.earned", { points, order_id: orderId }, { tenantId, actorId: userId, source: "panel" });
  }

  /** Muddati o'tgan ballarni yoqish (FIFO: avval eskilari sarflanadi). Kunlik ish; qaytaradi: yoqilgan jami. */
  async expireDue(): Promise<number> {
    let total = 0;
    const users = await this.db.tx({ platform: true }, (tx) => tx.query<{ tenant_id: string; user_id: string }>("select distinct tenant_id, user_id from ledger_entries where kind = 'accrual' and expires_at <= now()"));
    for (const u of users.rows) {
      await this.db.tx({ tenantId: u.tenant_id, userId: u.user_id }, async (tx) => {
        await this.lockBalance(tx, u.tenant_id, u.user_id);
        const r = (await tx.query<{ acc: string; used: string; expired: string }>(
          `select coalesce(sum(points) filter (where kind = 'accrual' and expires_at <= now()), 0) as acc,
                  coalesce(-sum(points) filter (where kind in ('spend', 'reversal')), 0) as used,
                  coalesce(-sum(points) filter (where kind = 'expire'), 0) as expired
             from ledger_entries where tenant_id = $1 and user_id = $2`, [u.tenant_id, u.user_id])).rows[0]!;
        const due = Math.max(0, Number(r.acc) - Number(r.used) - Number(r.expired));
        const bal = Number((await tx.query<{ b: string }>("select balance_points as b from loyalty_balances where tenant_id = $1 and user_id = $2", [u.tenant_id, u.user_id])).rows[0]!.b);
        const pts = Math.min(due, bal);
        if (pts > 0) {
          await this.entry(tx, u.tenant_id, u.user_id, "expire", -pts, null);
          await this.events.emit(tx, "points.expired", { points: pts }, { tenantId: u.tenant_id, actorId: u.user_id, source: "panel" });
          total += pts;
        }
      });
    }
    return total;
  }

  /** Kunlik solishtirish: ledger yig'indisi == tezkor balans. Nomuvofiqlar ro'yxati (bo'sh bo'lishi kerak). */
  async reconcile(): Promise<{ tenant_id: string; user_id: string; ledger: number; balance: number }[]> {
    const r = await this.db.tx({ platform: true }, (tx) => tx.query<{ tenant_id: string; user_id: string; ledger: string; balance: string }>(
      `select coalesce(l.tenant_id, b.tenant_id) as tenant_id, coalesce(l.user_id, b.user_id) as user_id, coalesce(l.s, 0) as ledger, coalesce(b.balance_points, 0) as balance
         from (select tenant_id, user_id, sum(points) as s from ledger_entries group by 1, 2) l
         full join loyalty_balances b on b.tenant_id = l.tenant_id and b.user_id = l.user_id
        where coalesce(l.s, 0) <> coalesce(b.balance_points, 0)`));
    return r.rows.map((x) => ({ tenant_id: x.tenant_id, user_id: x.user_id, ledger: Number(x.ledger), balance: Number(x.balance) }));
  }
}
