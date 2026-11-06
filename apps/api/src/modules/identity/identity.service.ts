import { Inject, Injectable } from "@nestjs/common";
import { Clock } from "../../common/clock";
import { hmac, safeEqualHex } from "../../common/crypto";
import { ApiError } from "../../common/errors";
import { CONFIG, type Config } from "../../config";
import { DbService, type Tx } from "../../db/db.service";
import { randomInt } from "node:crypto";
import { EventsService } from "../audit-events/events.service";
import { AuditService } from "../audit-events/audit.service";
import { LegalService, MARKETING, type ConsentInput, type MissingDoc } from "../legal/legal.service";
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

export interface SignInOpts { consents?: ConsentInput[]; marketing_consent?: boolean; ip?: string | null }

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
    private readonly legal: LegalService,
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
      const code = this.cfg.SMS_FIXED_CODE || String(randomInt(0, 1_000_000)).padStart(6, "0");
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
      | { k: "consent"; docs: MissingDoc[] }
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
      // Yangi foydalanuvchi — barcha hujjatlar; mavjud — faqat yangi versiyasi chiqqanlar (qayta akcept).
      if (existing.rows[0]) await tx.query("select set_config('app.user_id', $1, true)", [existing.rows[0].id]);
      const ev = await this.legal.evaluate(tx, { userId: existing.rows[0]?.id }, "customer", opts.consents);
      if (ev.missing.length) return { k: "consent", docs: ev.missing };

      await tx.query("update otp_codes set consumed_at = $2 where id = $1", [row.id, now]);
      let userId = existing.rows[0]?.id;
      if (!userId) {
        const ins = await tx.query<{ id: string }>("insert into users (phone, last_seen_at) values ($1,$2) returning id", [phone, now]);
        userId = ins.rows[0]!.id;
      } else {
        await tx.query("update users set last_seen_at = $2 where id = $1", [userId, now]);
      }
      await this.afterAuth(tx, userId, isNew, "sms", opts, ev.toRecord);
      return { k: "ok", userId, isNew };
    });

    switch (out.k) {
      case "locked": throw new ApiError(423, "auth.otp_locked", { retry_after: out.retryAfter });
      case "expired": throw new ApiError(401, "auth.otp_expired");
      case "invalid": throw new ApiError(401, "auth.otp_invalid", { attempts_left: out.left }, { left: out.left });
      case "consent": throw new ApiError(422, "consent.required", { documents: out.docs });
      default: return this.completeSignIn(out.userId, out.isNew);
    }
  }

  // ---------------------------------------------------------------- SINOV REJIMI
  /** OPEN_LOGIN=on: SMS kod, TOTP va rozilik talab qilinmaydi. Soxta rozilik yozuvlari YARATILMAYDI (faqat audit). */
  async openSignIn(phone: string, ip?: string | null): Promise<SignInResponse> {
    if (this.cfg.OPEN_LOGIN !== "on") throw new ApiError(404, "not_found");
    const now = this.clock.now();
    const out = await this.db.tx({}, async (tx) => {
      const ex = await tx.query<{ id: string }>("select id from users where phone = $1", [phone]);
      let userId = ex.rows[0]?.id;
      const isNew = !userId;
      if (!userId) userId = (await tx.query<{ id: string }>("insert into users (phone, last_seen_at) values ($1,$2) returning id", [phone, now])).rows[0]!.id;
      else await tx.query("update users set last_seen_at = $2 where id = $1", [userId, now]);
      await tx.query("select set_config('app.user_id', $1, true)", [userId]);
      await this.audit.record(tx, { actorId: userId, action: "auth.open_login", entity: "user", entityId: userId, ip });
      return { userId, isNew };
    });
    const tokens = await this.sessions.issue(out.userId, ["open"]);
    return { ...tokens, is_new_user: out.isNew, user: await this.me(out.userId) };
  }

  // ---------------------------------------------------------------- I-3
  async signInTelegram(initData: string, opts: SignInOpts): Promise<SignInResponse> {
    const tg = this.telegram.verifyInitData(initData);
    const now = this.clock.now();
    const out = await this.db.tx<{ k: "consent"; docs: MissingDoc[] } | { k: "ok"; userId: string; isNew: boolean }>({}, async (tx) => {
      const existing = await tx.query<{ id: string }>("select id from users where telegram_id = $1", [tg.id]);
      const isNew = existing.rowCount === 0;
      if (existing.rows[0]) await tx.query("select set_config('app.user_id', $1, true)", [existing.rows[0].id]);
      const ev = await this.legal.evaluate(tx, { userId: existing.rows[0]?.id }, "customer", opts.consents);
      if (ev.missing.length && this.cfg.OPEN_LOGIN !== "on") return { k: "consent", docs: ev.missing };
      let userId = existing.rows[0]?.id;
      if (!userId) {
        const ins = await tx.query<{ id: string }>("insert into users (telegram_id, locale, last_seen_at) values ($1,$2,$3) returning id", [tg.id, tg.language_code === "ru" ? "ru" : "uz", now]);
        userId = ins.rows[0]!.id;
      } else {
        await tx.query("update users set last_seen_at = $2 where id = $1", [userId, now]);
      }
      await this.afterAuth(tx, userId, isNew, "telegram", opts, ev.toRecord);
      return { k: "ok", userId, isNew };
    });
    if (out.k === "consent") throw new ApiError(422, "consent.required", { documents: out.docs });
    return this.completeSignIn(out.userId, out.isNew);
  }

  /** Rozilik yozuvlari (I-4) va kirish hodisalari. `tx` kontekstiga foydalanuvchi qo'yiladi (RLS: consents). */
  private async afterAuth(tx: Tx, userId: string, isNew: boolean, method: "sms" | "telegram", opts: SignInOpts, toRecord: { key: string; version: number; text_hash: string }[]) {
    await tx.query("select set_config('app.user_id', $1, true)", [userId]);
    const source = method === "telegram" ? "telegram" : "panel";
    const rows = toRecord.map((d) => ({ document: d.key, version: String(d.version), hash: d.text_hash }));
    if (isNew && opts.marketing_consent) rows.push({ document: MARKETING.document, version: MARKETING.version, hash: MARKETING.text_hash });
    for (const d of rows) {
      await tx.query(`insert into consents (user_id, document, version, action, channel, ip, text_hash, created_at) values ($1,$2,$3,'accepted',$4,$5,$6,$7)`,
        [userId, d.document, d.version, method, cleanIp(opts.ip), d.hash, this.clock.now()]);
      await this.events.emit(tx, "consent.accepted", { document: d.document, version: d.version, channel: method }, { actorId: userId, source });
    }
    if (rows.length) await this.audit.record(tx, { actorId: userId, action: "consent.accepted", entity: "user", entityId: userId, after: { documents: rows.map((d) => `${d.document}@${d.version}`) }, ip: opts.ip });
    if (isNew) await this.events.emit(tx, "auth.signed_up", { method }, { actorId: userId, source });
    await this.events.emit(tx, "auth.signed_in", { method }, { actorId: userId, source });
  }

  private async completeSignIn(userId: string, isNew: boolean): Promise<SignInResponse> {
    const u = await this.db.tx({ userId }, (tx) => tx.query<{ totp_enabled: boolean }>("select totp_enabled from users where id = $1", [userId]));
    if (u.rows[0]?.totp_enabled && this.cfg.OPEN_LOGIN !== "on") return { mfa_required: true, mfa_token: await this.tokens.signMfa(userId) };
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
      const m = await tx.query<{ member_id: string; tenant_id: string; tenant_name: string; tenant_slug: string; role: string; status: string }>(
        `select m.id as member_id, m.tenant_id, t.name as tenant_name, t.slug as tenant_slug, m.role, m.status from memberships m join tenants t on t.id = m.tenant_id
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

