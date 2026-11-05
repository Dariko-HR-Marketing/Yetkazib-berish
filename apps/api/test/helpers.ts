import { createHmac, randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Secret, TOTP } from "otpauth";
import { Pool } from "pg";
import request from "supertest";
import { createApp } from "../src/bootstrap";
import { Clock } from "../src/common/clock";
import { RedisService } from "../src/redis.service";
import { DbService } from "../src/db/db.service";
import { EventsDispatcher } from "../src/modules/audit-events/events.dispatcher";
import { FeaturesService } from "../src/modules/plans-flags/features.service";
import { MockSmsSender } from "../src/modules/identity/sms.sender";
import { PLATFORM_OFF_BY_DEFAULT } from "../src/db/seed";

/** Joriy hujjat versiyalari (bazadan, boot() va reset() to'ldiradi): xaridor va do'kon egasi uchun. */
export const CONSENTS: { document: string; version: string }[] = [];
export const SHOP_CONSENTS: { document: string; version: string }[] = [];
async function loadConsents(admin: Pool) {
  const r = await admin.query<{ key: string; version: number; audience: string }>(
    "select distinct on (key) key, version, audience from legal_documents where locale = 'uz' and status in ('effective', 'draft') order by key, (status = 'effective') desc, version desc");
  CONSENTS.length = 0; SHOP_CONSENTS.length = 0;
  for (const d of r.rows) {
    if (d.audience === "customer") CONSENTS.push({ document: d.key, version: String(d.version) });
    if (d.audience === "shop") SHOP_CONSENTS.push({ document: d.key, version: String(d.version) });
  }
}

export interface Harness {
  app: NestExpressApplication;
  clock: Clock;
  sms: MockSmsSender;
  db: DbService;
  admin: Pool;
  redis: RedisService;
  events: EventsDispatcher;
  features: FeaturesService;
  http: ReturnType<typeof request>;
  close(): Promise<void>;
  reset(): Promise<void>;
}

export async function boot(): Promise<Harness> {
  const app = await createApp({ quiet: true });
  await app.init();
  const admin = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  await loadConsents(admin);
  const h: Harness = {
    app, admin,
    clock: app.get(Clock), sms: app.get(MockSmsSender), db: app.get(DbService), redis: app.get(RedisService),
    events: app.get(EventsDispatcher), features: app.get(FeaturesService),
    http: request(app.getHttpServer()),
    async close() { await app.close(); await admin.end(); },
    async reset() {
      h.clock.reset();
      await admin.query("set session_replication_role = replica");
      await admin.query("delete from legal_documents where version > 1");
      await admin.query("update legal_documents set status = 'draft', effective_from = null, published_by = null");
      await admin.query("set session_replication_role = default");
      await loadConsents(admin);
      h.sms.outbox.length = 0;
      await admin.query("set session_replication_role = replica");
      await admin.query("truncate users, otp_codes, otp_locks, refresh_tokens, idempotency_keys, tenants, consents, events, audit_log restart identity cascade");
      await admin.query("delete from plans where version > 1");
      await admin.query("update plans set status = 'published', published_at = coalesce(published_at, now()) where version = 1");
      await admin.query("update feature_flags set platform_enabled = not (key = any($1))", [[...PLATFORM_OFF_BY_DEFAULT]]);
      await admin.query("set session_replication_role = default");
      await h.redis.client.flushdb();
    },
  };
  return h;
}

export const idem = () => randomUUID();

export interface Call { token?: string; tenant?: string; body?: unknown; key?: string | null; lang?: string; headers?: Record<string, string> }

export function call(h: Harness, method: "get" | "post" | "patch" | "put" | "delete", path: string, o: Call = {}) {
  let r = h.http[method](path);
  if (o.token) r = r.set("Authorization", `Bearer ${o.token}`);
  if (o.tenant) r = r.set("X-Tenant-Id", o.tenant);
  if (o.lang) r = r.set("Accept-Language", o.lang);
  if (o.key !== null && method !== "get") r = r.set("Idempotency-Key", o.key ?? idem());
  for (const [k, v] of Object.entries(o.headers ?? {})) r = r.set(k, v);
  return o.body !== undefined ? r.send(o.body as object) : r;
}

export const lastCode = (h: Harness, phone: string): string => {
  const m = [...h.sms.outbox].reverse().find((s) => s.phone === phone && /kod/.test(s.text));
  const code = m?.text.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error(`SMS kod topilmadi: ${phone}`);
  return code;
};

export interface Session { token: string; refresh: string; userId: string; phone: string }

/** SMS orqali ro'yxatdan o'tadi (oferta + maxfiylik akcepti bilan). */
export async function signUp(h: Harness, phone: string): Promise<Session> {
  await call(h, "post", "/v1/auth/otp/request", { body: { phone } }).expect(202);
  const r = await call(h, "post", "/v1/auth/otp/verify", { body: { phone, code: lastCode(h, phone), consents: CONSENTS } }).expect(200);
  return { token: r.body.access_token, refresh: r.body.refresh_token, userId: r.body.user.id, phone };
}

export const totpCode = (secret: string, h: Harness, offsetSteps = 0) =>
  new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30 }).generate({ timestamp: h.clock.now().getTime() + offsetSteps * 30000 });

/** TOTP'ni yoqadi va ikkinchi omilli token qaytaradi. */
export async function enableTotp(h: Harness, s: Session): Promise<Session & { secret: string }> {
  const e = await call(h, "post", "/v1/auth/totp/enroll", { token: s.token, key: null }).expect(200);
  const r = await call(h, "post", "/v1/auth/totp/confirm", { token: s.token, key: null, body: { code: totpCode(e.body.secret, h) } }).expect(200);
  return { ...s, token: r.body.access_token, refresh: r.body.refresh_token, secret: e.body.secret };
}

/** Egasi: SMS + do'kon + TOTP. */
export async function makeOwner(h: Harness, phone: string, tin = "123456789", name = "Yashil Savat") {
  const s = await signUp(h, phone);
  const t0 = await call(h, "post", "/v1/tenants", { token: s.token, body: { name, tin, consents: SHOP_CONSENTS } }).expect(201);
  const owner = await enableTotp(h, s);
  return { ...owner, tenantId: t0.body.id as string };
}

export function invite(h: Harness, owner: { token: string; tenantId: string }, phone: string, role: string) {
  return call(h, "post", "/v1/invites", { token: owner.token, tenant: owner.tenantId, body: { phone, role } });
}

/** Taklifni qabul qilgan xodim (SMS tokeni bilan). */
export async function addStaff(h: Harness, owner: { token: string; tenantId: string }, phone: string, role: string): Promise<Session> {
  await invite(h, owner, phone, role).expect(201);
  const s = await signUp(h, phone);
  const msg = [...h.sms.outbox].reverse().find((m) => m.phone === phone && m.text.includes("/taklif/"))!;
  const tok = msg.text.match(/\/taklif\/([\w-]+)/)![1]!;
  await call(h, "post", `/v1/invites/${tok}/accept`, { token: s.token }).expect(200);
  return s;
}

export async function makeAdmin(h: Harness, phone = "+998900000001") {
  const s = await signUp(h, phone);
  await h.admin.query("update users set is_platform_admin = true where id = $1", [s.userId]);
  return enableTotp(h, s);
}

/** Telegram initData (imzolangan) yaratadi. */
export function telegramInitData(botToken: string, user: { id: number; language_code?: string }, authDate: number, tamper = false): string {
  const params: Record<string, string> = { auth_date: String(authDate), query_id: "AAH-test", user: JSON.stringify(user) };
  const check = Object.entries(params).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(check).digest("hex");
  const sp = new URLSearchParams(params);
  sp.set("hash", tamper ? hash.replace(/.$/, hash.endsWith("0") ? "1" : "0") : hash);
  return sp.toString();
}

/** Soat ilgarilab ketgach kirish tokeni eskiradi: yangilash tokeni bilan yangisini oladi (amr saqlanadi). */
export async function renew<T extends { token: string; refresh: string }>(h: Harness, s: T): Promise<T> {
  const r = await call(h, "post", "/v1/auth/refresh", { key: null, body: { refresh_token: s.refresh } }).expect(200);
  return { ...s, token: r.body.access_token, refresh: r.body.refresh_token };
}
