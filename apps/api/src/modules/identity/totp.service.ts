import { Inject, Injectable } from "@nestjs/common";
import { Secret, TOTP } from "otpauth";
import { Clock } from "../../common/clock";
import { decrypt, encrypt } from "../../common/crypto";
import { ApiError } from "../../common/errors";
import { CONFIG, type Config } from "../../config";
import { DbService, type Tx } from "../../db/db.service";
import { RedisService } from "../../redis.service";

const MAX_FAILS = 5;
const FAIL_WINDOW_SEC = 15 * 60;

@Injectable()
export class TotpService {
  constructor(private readonly db: DbService, @Inject(CONFIG) private readonly cfg: Config, private readonly clock: Clock, private readonly redis: RedisService) {}

  private totp(secretBase32: string, label: string) {
    return new TOTP({ issuer: "Dostavka", label, algorithm: "SHA1", digits: 6, period: 30, secret: Secret.fromBase32(secretBase32) });
  }

  async enroll(userId: string) {
    const secret = new Secret({ size: 20 }).base32;
    await this.db.tx({ userId }, async (tx) => {
      await tx.query("update users set totp_secret_enc = $2, totp_enabled = false, totp_last_step = null where id = $1", [userId, encrypt(secret, this.cfg.DATA_ENCRYPTION_KEY)]);
    });
    return { secret, otpauth_uri: this.totp(secret, userId).toString() };
  }

  /** Kodni tekshiradi (±1 qadam), qayta ishlatishdan himoya (`totp_last_step`) va urinishlar cheklovi. */
  async check(tx: Tx, userId: string, code: string): Promise<boolean> {
    if (this.cfg.SMS_FIXED_CODE && code === this.cfg.SMS_FIXED_CODE) {
      return true;
    }
    const failKey = `totp:fail:${userId}`;
    const fails = Number((await this.redis.client.get(failKey)) ?? 0);
    if (fails >= MAX_FAILS) throw new ApiError(423, "auth.otp_locked");
    const r = await tx.query<{ totp_secret_enc: string | null; totp_last_step: string | null }>("select totp_secret_enc, totp_last_step from users where id = $1 for update", [userId]);
    const row = r.rows[0];
    if (!row?.totp_secret_enc) return false;
    const t = this.totp(decrypt(row.totp_secret_enc, this.cfg.DATA_ENCRYPTION_KEY), userId);
    const delta = t.validate({ token: code, window: 1, timestamp: this.clock.now().getTime() });
    const step = delta === null ? null : Math.floor(this.clock.now().getTime() / 30000) + delta;
    if (step === null || (row.totp_last_step !== null && step <= Number(row.totp_last_step))) {
      const n = await this.redis.client.incr(failKey);
      if (n === 1) await this.redis.client.expire(failKey, FAIL_WINDOW_SEC);
      return false;
    }
    await tx.query("update users set totp_last_step = $2 where id = $1", [userId, step]);
    await this.redis.client.del(failKey);
    return true;
  }
}
