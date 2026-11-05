import { Inject, Injectable } from "@nestjs/common";
import { Clock } from "../../common/clock";
import { hmac, safeEqualHex } from "../../common/crypto";
import { ApiError } from "../../common/errors";
import { CONFIG, type Config } from "../../config";
import { DbService, type Tx } from "../../db/db.service";
import { randomInt } from "node:crypto";
import { EventsService } from "../audit-events/events.service";
import { AuditService } from "../audit-events/audit.service";
import { consentsSatisfied, LEGAL_DOCS, MARKETING_DOC, REQUIRED_CONSENTS, textHash } from "./legal";
import { SMS_SENDER, type SmsSender } from "./sms.sender";
import { SessionService, type Tokens } from "./session.service";
import { TelegramService } from "./telegram.service";
import { TokenService } from "./token.service";
import { TotpService } from "./totp.service";
import { Inject as Inj } from "@nestjs/common";

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_RESEND_MS = 60 * 1000;
export const OTP_MAX_FAILS = 5;
export const OTP_LOCK_MS = 15 * 60 * 1000;

type ConsentIn = { document: string; version: string }[] | undefined;
export interface SignInOpts { consents?: ConsentIn; marketing_consent?: boolean; ip?: string | null }

export type SignInResponse = (Tokens & { is_new_user: boolean; user: unknown }) | { mfa_required: true; mfa_token: string };

@Injectable()
export class IdentityService {
  constructor(
    private readonly db: DbService,
    @Inject(CONFIG) private readonly cfg: Config,
    private readonly clock: Clock,
    @Inj(SMS_SENDER) private readonly sms: SmsSender,
    private readonly sessions: SessionService,
    private readonly tokens: TokenService,
    private readonly totp: TotpService,
    private readonly telegram: TelegramService,
    private readonly events: EventsService,
    private readonly audit: AuditService,
  ) {}

  private codeHash(phone: string, code: string) {
    return hmac(this.cfg.JWT_SECRET, `otp:${phone}:${code}`);
  }
  phoneHash(phone: string) {
    return hmac(this.cfg.PHONE_HASH_PEPPER, phone);
  }

  // ---------------------------------------------------------------- I-1
  async requestOtp(phone: string) {
    const now = this.clock.now();
    await this.db.tx({}, async (tx) => {
      const lock = await tx.query<{ locked_until: Date }>("select locked_until from otp_locks where phone = $1", [phone]);
      if (lock.rows[0] && lock.rows[0].locked_until > now) throw new ApiError(423, "auth.otp_locked", { retry_after: Math.ceil((lock.rows[0].locked_until.getTime() - now.getTime()) / 1000) });
      const last = await tx.query<{ created_at: Date }>("select created_at from otp_codes where phone = $1 order by created_at desc limit 1", [phone]);
      const lastAt = last.rows[0]?.created_at;
      if (lastAt && now.getTime() - lastAt.getTime() < OTP_RESEND_MS) {
        const seconds = Math.ceil((OTP_RESEND_MS - (now.getTime() - lastAt.getTime())) / 1000);
        throw new ApiError(429, "auth.otp_rate_limited", { retry_after: seconds }, { seconds });
      }
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      await tx.query("insert into otp_codes (phone, code_hash, expires_at, created_at) values ($1,$2,$3,$4)", [phone, this.codeHash(phone, code), new Date(now.getTime() + OTP_TTL_MS), now]);
      await this.sms.send(phone, `Dostavka: tasdiqlash kodi ${code}. Kod 5 daqiqa amal qiladi. Hech kimga bermang.`);
    });
    return { expires_in: OTP_TTL_MS / 1000, retry_after: OTP_RESEND_MS / 1000 };
  }

  // ---------------------------------------------------------------- I-2, I-4, I-5
  async verifyOtp(phone: string, code: string, opts: SignInOpts): Promise<SignInResponse> {
    const now = this.clock.now();
    type Out =
      | { k: "locked"; retryAfter: number }
      | { k: "expired" }
      | { k: "invalid"; left: number }
      | { k: "consent" }
      | { k: "ok"; userId: string; isNew: boolean };
    // Holat o'zgarishi (urinishlar, blok) xato bilan birga saqlanishi kerak -> natija tranzaksiyadan keyin xatoga aylanadi.
    const out = await this.db.tx<Out>({}, async (tx) => {
      const lock = await tx.query<{ locked_until: Date }>("select locked_until from otp_locks where phone = $1", [phone]);
      if (lock.rows[0] && lock.rows[0].locked_until > now) return { k: "locked", retryAfter: Math.ceil((lock.rows[0].locked_until.getTime() - now.getTime()) / 1000) };

      const r = await tx.query<{ id: string; code_hash: string; expires_at: Date; failed_count: number }>(
        "select id, code_hash, expires_at, failed_count from otp_codes where phone = $1 and consumed_at is null order by created_at desc limit 1 for update", [phone]);
      const row = r.rows[0];
      if (!row || row.expires_at <= now) return { k: "expired" };

      if (row.failed_count >= OTP_MAX_FAILS) {
        // 6-urinish: raqam 15 daqiqaga bloklanadi, `auth.otp_locked` yoziladi
        await tx.query("insert into otp_locks (phone, locked_until) values ($1,$2) on conflict (phone) do update set locked_until = excluded.locked_until", [phone, new Date(now.getTime() + OTP_LOCK_MS)]);
        await tx.query("update otp_codes set consumed_at = $2 where id = $1", [row.id, now]);
        await this.events.emit(tx, "auth.otp_locked", { phone_hash: this.phoneHash(phone) }, { source: "panel" });
        return { k: "locked", retryAfter: OTP_LOCK_MS / 1000 };
      }
      if (!safeEqualHex(this.codeHash(phone, code), row.code_hash)) {
        await tx.query("update otp_codes set failed_count = failed_count + 1 where id = $1", [row.id]);
        return { k: "invalid", left: OTP_MAX_FAILS - (row.failed_count + 1) };
      }

      const existing = await tx.query<{ id: string }>("select id from users where phone = $1", [phone]);
      const isNew = existing.rowCount === 0;
      if (isNew && !consentsSatisfied(opts.consents)) return { k: "consent" };

      await tx.query("update otp_codes set consumed_at = $2 where id = $1", [row.id, now]);
      let userId = existing.rows[0]?.id;
      if (!userId) {
        const ins = await tx.query<{ id: string }>("insert into users (phone, last_seen_at) values ($1,$2) returning id", [phone, now]);
        userId = ins.rows[0]!.id;
      } else {
        await tx.query("update users set last_seen_at = $2 where id = $1", [userId, now]);
      }
      await this.afterAuth(tx, userId, isNew, "sms", opts);
      return { k: "ok", userId, isNew };
    });

    switch (out.k) {
      case "locked": throw new ApiError(423, "auth.otp_locked", { retry_after: out.retryAfter });
      case "expired": throw new ApiError(401, "auth.otp_expired");
      case "invalid": throw new ApiError(401, "auth.otp_invalid", { attempts_left: out.left }, { left: out.left });
      case "consent": throw new ApiError(422, "consent.required", { documents: REQUIRED_CONSENTS });
      default: return this.completeSignIn(out.userId, out.isNew);
    }
  }

  // ---------------------------------------------------------------- I-3
  async signInTelegram(initData: string, opts: SignInOpts): Promise<SignInResponse> {
    const tg = this.telegram.verifyInitData(initData);
    const now = this.clock.now();
    const out = await this.db.tx<{ k: "consent" } | { k: "ok"; userId: string; isNew: boolean }>({}, async (tx) => {
      const existing = await tx.query<{ id: string }>("select id from users where telegram_id = $1", [tg.id]);
      const isNew = existing.rowCount === 0;
      if (isNew && !consentsSatisfied(opts.consents)) return { k: "consent" };
      let userId = existing.rows[0]?.id;
      if (!userId) {
        const ins = await tx.query<{ id: string }>("insert into users (telegram_id, locale, last_seen_at) values ($1,$2,$3) returning id", [tg.id, tg.language_code === "ru" ? "ru" : "uz", now]);
        userId = ins.rows[0]!.id;
      } else {
        await tx.query("update users set last_seen_at = $2 where id = $1", [userId, now]);
      }
      await this.afterAuth(tx, userId, isNew, "telegram", opts);
      return { k: "ok", userId, isNew };
    });
    if (out.k === "consent") throw new ApiError(422, "consent.required", { documents: REQUIRED_CONSENTS });
    return this.completeSignIn(out.userId, out.isNew);
  }

  /** Rozilik yozuvlari (I-4) va kirish hodisalari. `tx` kontekstiga foydalanuvchi qo'yiladi (RLS: consents). */
  private async afterAuth(tx: Tx, userId: string, isNew: boolean, method: "sms" | "telegram", opts: SignInOpts) {
    await tx.query("select set_config('app.user_id', $1, true)", [userId]);
    const source = method === "telegram" ? "telegram" : "panel";
    if (isNew) {
      const docs = [...REQUIRED_CONSENTS];
      if (opts.marketing_consent) docs.push({ document: MARKETING_DOC.document, version: MARKETING_DOC.version });
      for (const d of docs) {
        await tx.query(`insert into consents (user_id, document, version, action, channel, ip, text_hash, created_at) values ($1,$2,$3,'accepted',$4,$5,$6,$7)`,
          [userId, d.document, d.version, method, cleanIp(opts.ip), textHash(d.document, d.version), this.clock.now()]);
        await this.events.emit(tx, "consent.accepted", { document: d.document, version: d.version, channel: method }, { actorId: userId, source });
      }
      await this.audit.record(tx, { actorId: userId, action: "consent.accepted", entity: "user", entityId: userId, after: { documents: docs.map((d) => `${d.document}@${d.version}`) }, ip: opts.ip });
      await this.events.emit(tx, "auth.signed_up", { method }, { actorId: userId, source });
    }
    await this.events.emit(tx, "auth.signed_in", { method }, { actorId: userId, source });
  }

  private async completeSignIn(userId: string, isNew: boolean): Promise<SignInResponse> {
    const u = await this.db.tx({ userId }, (tx) => tx.query<{ totp_enabled: boolean }>("select totp_enabled from users where id = $1", [userId]));
    if (u.rows[0]?.totp_enabled) return { mfa_required: true, mfa_token: await this.tokens.signMfa(userId) };
    const tokens = await this.sessions.issue(userId, ["otp"]);
    return { ...tokens, is_new_user: isNew, user: await this.me(userId) };
  }

  // ---------------------------------------------------------------- I-5
  async verifyTotp(mfaToken: string, code: string): Promise<Tokens> {
    const userId = await this.tokens.verifyMfa(mfaToken);
    const ok = await this.db.tx({ userId }, (tx) => this.totp.check(tx, userId, code));
    if (!ok) throw new ApiError(401, "auth.mfa_invalid");
    return this.sessions.issue(userId, ["otp", "totp"]);
  }

  async enrollTotp(userId: string) {
    return this.totp.enroll(userId);
  }

  async confirmTotp(userId: string, sid: string, code: string): Promise<Tokens> {
    const ok = await this.db.tx({ userId }, async (tx) => {
      const good = await this.totp.check(tx, userId, code);
      if (good) {
        await tx.query("update users set totp_enabled = true where id = $1", [userId]);
        await this.audit.record(tx, { actorId: userId, action: "totp.enabled", entity: "user", entityId: userId });
      }
      return good;
    });
    if (!ok) throw new ApiError(400, "auth.mfa_invalid");
    await this.sessions.revokeFamily(sid);
    return this.sessions.issue(userId, ["otp", "totp"]);
  }

  // ---------------------------------------------------------------- /me
  async me(userId: string) {
    return this.db.tx({ userId }, async (tx) => {
      const u = await tx.query<{ id: string; phone: string | null; telegram_id: string | null; locale: string; totp_enabled: boolean; is_platform_admin: boolean }>(
        "select id, phone, telegram_id, locale, totp_enabled, is_platform_admin from users where id = $1", [userId]);
      const row = u.rows[0];
      if (!row) throw new ApiError(401, "auth.token_invalid");
      const m = await tx.query<{ member_id: string; tenant_id: string; tenant_name: string; role: string; status: string }>(
        `select m.id as member_id, m.tenant_id, t.name as tenant_name, m.role, m.status from memberships m join tenants t on t.id = m.tenant_id
         where m.user_id = $1 order by m.created_at`, [userId]);
      return { id: row.id, phone_masked: maskPhone(row.phone), locale: row.locale, telegram_linked: row.telegram_id !== null, totp_enabled: row.totp_enabled, is_platform_admin: row.is_platform_admin, memberships: m.rows };
    });
  }
}

export function maskPhone(phone: string | null): string | null {
  return phone ? `${phone.slice(0, 6)} ••• •• ${phone.slice(-2)}` : null;
}

function cleanIp(ip?: string | null): string | null {
  if (!ip) return null;
  const v = ip.replace(/^::ffff:/, "");
  return /^[0-9a-fA-F:.]+$/.test(v) ? v : null;
}

export { LEGAL_DOCS };
