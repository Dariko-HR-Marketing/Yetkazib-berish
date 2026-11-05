import { createHmac } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { Clock } from "../../common/clock";
import { safeEqualHex } from "../../common/crypto";
import { ApiError } from "../../common/errors";
import { CONFIG, type Config } from "../../config";

export const INIT_DATA_MAX_AGE_SEC = 24 * 3600;

export interface TelegramUser { id: number; language_code?: string }

/** I-3: initData imzosi bot tokeni bilan tekshiriladi; 24 soatdan eskisi rad etiladi. */
@Injectable()
export class TelegramService {
  constructor(@Inject(CONFIG) private readonly cfg: Config, private readonly clock: Clock) {}

  verifyInitData(initData: string): TelegramUser {
    if (!this.cfg.TELEGRAM_BOT_TOKEN) throw new ApiError(401, "auth.telegram_invalid");
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) throw new ApiError(401, "auth.telegram_invalid");
    params.delete("hash");
    const dataCheck = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join("\n");
    const secret = createHmac("sha256", "WebAppData").update(this.cfg.TELEGRAM_BOT_TOKEN).digest();
    const expected = createHmac("sha256", secret).update(dataCheck).digest("hex");
    if (!safeEqualHex(expected, hash)) throw new ApiError(401, "auth.telegram_invalid");
    const authDate = Number(params.get("auth_date"));
    const nowSec = Math.floor(this.clock.now().getTime() / 1000);
    if (!Number.isInteger(authDate) || authDate > nowSec + 60) throw new ApiError(401, "auth.telegram_invalid");
    if (nowSec - authDate > INIT_DATA_MAX_AGE_SEC) throw new ApiError(401, "auth.telegram_expired");
    try {
      const user = JSON.parse(params.get("user") ?? "") as TelegramUser;
      if (!Number.isSafeInteger(user.id)) throw new Error("id");
      return user;
    } catch {
      throw new ApiError(401, "auth.telegram_invalid");
    }
  }
}
