import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { Clock } from "../../common/clock";
import { randomToken, sha256 } from "../../common/crypto";
import { ApiError } from "../../common/errors";
import { DbService } from "../../db/db.service";
import { ACCESS_TTL_SEC, TokenService } from "./token.service";

export const SESSION_INACTIVITY_MS = 30 * 24 * 3600 * 1000;

export interface Tokens { access_token: string; refresh_token: string; expires_in: number }

@Injectable()
export class SessionService {
  private readonly log = new Logger("Session");
  constructor(private readonly db: DbService, private readonly tokens: TokenService, private readonly clock: Clock) {}

  /** Yangi sessiya oilasi (I-6): kirish tokeni 15 daqiqa, yangilash tokeni har ishlatilganda aylanadi. */
  async issue(userId: string, amr: string[], familyId: string = randomUUID()): Promise<Tokens> {
    const refresh = randomToken(32);
    const now = this.clock.now();
    await this.db.tx({}, (tx) =>
      tx.query(`insert into refresh_tokens (user_id, family_id, token_hash, amr, expires_at, created_at) values ($1,$2,$3,$4,$5,$6)`,
        [userId, familyId, sha256(refresh), amr, new Date(now.getTime() + SESSION_INACTIVITY_MS), now]));
    return { access_token: await this.tokens.signAccess({ sub: userId, amr, sid: familyId }), refresh_token: refresh, expires_in: ACCESS_TTL_SEC };
  }

  async refresh(refreshToken: string): Promise<Tokens> {
    const now = this.clock.now();
    type Outcome = { k: "ok"; userId: string; familyId: string; amr: string[] } | { k: "bad"; why: "unknown" | "revoked" | "reuse" | "expired"; family?: string };
    // Qayta ishlatish aniqlansa, butun oila bekor qilinadi va bu o'zgarish saqlanishi shart -> xatoni tranzaksiyadan keyin tashlaymiz.
    const out = await this.db.tx<Outcome>({}, async (tx) => {
      const r = await tx.query<{ id: string; user_id: string; family_id: string; amr: string[]; expires_at: Date; rotated_at: Date | null; revoked_at: Date | null }>(
        "select id, user_id, family_id, amr, expires_at, rotated_at, revoked_at from refresh_tokens where token_hash = $1 for update", [sha256(refreshToken)]);
      const row = r.rows[0];
      if (!row) return { k: "bad", why: "unknown" };
      if (row.revoked_at) return { k: "bad", why: "revoked", family: row.family_id };
      if (row.rotated_at) {
        await tx.query("update refresh_tokens set revoked_at = $2 where family_id = $1 and revoked_at is null", [row.family_id, now]);
        return { k: "bad", why: "reuse", family: row.family_id };
      }
      if (row.expires_at <= now) return { k: "bad", why: "expired", family: row.family_id };
      await tx.query("update refresh_tokens set rotated_at = $2 where id = $1", [row.id, now]);
      return { k: "ok", userId: row.user_id, familyId: row.family_id, amr: row.amr };
    });
    if (out.k === "bad") {
      // Sabab ichki jurnalga (token yoki foydalanuvchi ma'lumotisiz): "reuse" — o'g'irlik belgisi bo'lishi mumkin, monitoringda ogohlantirish.
      this.log.warn(`refresh rad etildi: ${out.why}${out.family ? ` family=${out.family}` : ""}`);
      throw new ApiError(401, "auth.refresh_invalid", {});
    }
    return this.issue(out.userId, out.amr, out.familyId);
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.db.tx({}, (tx) => tx.query("update refresh_tokens set revoked_at = $2 where family_id = $1 and revoked_at is null", [familyId, this.clock.now()]));
  }
}
