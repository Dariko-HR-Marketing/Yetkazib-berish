import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppLogger, maskPhones, redact } from "../src/common/logger";
import { EventsService } from "../src/modules/audit-events/events.service";
import { EVENT_SCHEMAS, findPii } from "../src/modules/audit-events/event-registry";
import { EVENTS_QUEUE } from "../src/modules/audit-events/events.dispatcher";
import { boot, call, makeOwner, signUp, type Harness } from "./helpers";

let h: Harness;
beforeAll(async () => { h = await boot(); });
afterAll(async () => { await h.close(); });
beforeEach(async () => { await h.reset(); });

describe("A-1: audit jurnali o'zgarmas va to'liq", () => {
  it("pul/rol/kalit/rozilik o'zgarishi: kim, nima, oldin/keyin, IP, vaqt, so'rov ID", async () => {
    const o = await makeOwner(h, "+998901000001");
    await call(h, "patch", "/v1/features/stock.visible", { token: o.token, tenant: o.tenantId, body: { enabled: false }, headers: { "X-Request-Id": "req-audit-0001", "X-Forwarded-For": "1.2.3.4" } }).expect(200);
    const a = (await h.admin.query("select * from audit_log where action = 'feature.toggled'")).rows[0];
    expect(a).toMatchObject({ actor_id: o.userId, tenant_id: o.tenantId, entity: "feature", entity_id: "stock.visible", before: { enabled: true }, after: { enabled: false }, request_id: "req-audit-0001" });
    expect(a.ip).toBeTruthy();
    expect(a.created_at).toBeInstanceOf(Date);
  });

  it("UPDATE, DELETE va TRUNCATE rad etiladi — egasi roli bilan ham", async () => {
    await makeOwner(h, "+998901000001");
    await expect(h.admin.query("update audit_log set action = 'x'")).rejects.toThrow(/o'zgarmas/);
    await expect(h.admin.query("delete from audit_log")).rejects.toThrow(/o'zgarmas/);
    await expect(h.admin.query("truncate audit_log")).rejects.toThrow(/o'zgarmas/);
  });

  it("ilova roli audit jadvalini o'zgartira olmaydi (huquq darajasida ham)", async () => {
    await makeOwner(h, "+998901000001");
    await expect(h.db.tx({ platform: true }, (tx) => tx.query("update audit_log set action = 'x'"))).rejects.toThrow(/permission denied/);
    await expect(h.db.tx({ platform: true }, (tx) => tx.query("delete from audit_log"))).rejects.toThrow(/permission denied/);
  });

  it("events: faqat published_at o'zgaradi", async () => {
    await signUp(h, "+998901000001");
    await expect(h.admin.query("update events set name = 'x'")).rejects.toThrow(/o'zgarmas/);
    await expect(h.admin.query("delete from events")).rejects.toThrow(/o'zgarmas/);
    await h.admin.query("update events set published_at = now()");
  });

  it("rol, do'kon va taklif amallari audit'ga tushadi", async () => {
    const o = await makeOwner(h, "+998901000001");
    await call(h, "post", "/v1/invites", { token: o.token, tenant: o.tenantId, body: { phone: "+998901000002", role: "picker" } }).expect(201);
    const actions = (await h.admin.query("select action from audit_log order by id")).rows.map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["consent.accepted", "tenant.created", "member.role_set", "totp.enabled", "invite.created"]));
  });

  it("audit yozuvlarida shaxsiy ma'lumot (telefon) yo'q", async () => {
    const o = await makeOwner(h, "+998901000001");
    await call(h, "post", "/v1/invites", { token: o.token, tenant: o.tenantId, body: { phone: "+998901000002", role: "picker" } }).expect(201);
    const all = JSON.stringify((await h.admin.query("select before, after, entity_id from audit_log")).rows);
    expect(all).not.toMatch(/998\d{9}/);
  });
});

describe("A-2: hodisalar sxemasi lug'at bilan tekshiriladi", () => {
  it("registr events.json lug'ati bilan to'liq mos (nomlar)", () => {
    const json = JSON.parse(readFileSync(resolve(__dirname, "../../../infra/seed/events.json"), "utf8")) as { events: { name: string }[] };
    expect(Object.keys(EVENT_SCHEMAS).sort()).toEqual(json.events.map((e) => e.name).sort());
  });

  it("infra/seed nusxalari docs/05_spetsifikatsiya_json bilan bir xil (yagona manba)", () => {
    for (const f of ["events", "plans", "feature_flags", "roles_permissions"]) {
      const a = readFileSync(resolve(__dirname, `../../../infra/seed/${f}.json`), "utf8");
      const b = readFileSync(resolve(__dirname, `../../../docs/05_spetsifikatsiya_json/${f}.json`), "utf8");
      expect(a, `${f}.json docs bilan farq qiladi — ikkalasini yangilang`).toBe(b);
    }
  });

  it("noma'lum hodisa nomi rad etiladi", async () => {
    const svc = h.app.get(EventsService);
    await expect(h.db.tx({}, (tx) => svc.emit(tx, "auth.hacked" as never, {}, { source: "panel" }))).rejects.toMatchObject({ code: "internal_error", details: { reason: "unknown_event" } });
  });

  it("sxemaga mos kelmagan xususiyatlar rad etiladi (noma'lum maydon, noto'g'ri tur, yetishmaydigan maydon)", async () => {
    const svc = h.app.get(EventsService);
    const emit = (name: never, p: Record<string, unknown>) => h.db.tx({}, (tx) => svc.emit(tx, name, p, { source: "panel" }));
    await expect(emit("auth.signed_in" as never, { method: "sms", extra: 1 })).rejects.toMatchObject({ details: { reason: "event_schema_mismatch" } });
    await expect(emit("auth.signed_in" as never, { method: "email" })).rejects.toMatchObject({ details: { reason: "event_schema_mismatch" } });
    await expect(emit("auth.signed_in" as never, {})).rejects.toMatchObject({ details: { reason: "event_schema_mismatch" } });
    await expect(emit("cart.item_added" as never, { product_id: "p1", quantity: 1.5, price_tiyin: 100 })).rejects.toMatchObject({ details: { reason: "event_schema_mismatch" } }); // kasr — float yo'q
    expect((await h.admin.query("select count(*)::int as n from events")).rows[0].n).toBe(0);
  });

  it("to'g'ri hodisa umumiy maydonlar bilan yoziladi: event_id, ts, tenant_id, actor_id, source", async () => {
    const o = await makeOwner(h, "+998901000001");
    const e = (await h.admin.query("select id, ts, tenant_id, actor_id, source, name from events where name = 'auth.signed_up'")).rows[0];
    expect(e).toMatchObject({ source: "panel", name: "auth.signed_up", actor_id: o.userId });
    expect(e.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(e.ts).toBeInstanceOf(Date);
    const bad = await h.admin.query("select 1").then(() => h.admin.query("insert into events (name, source) values ('x', 'noma''lum')").catch((x: Error) => x.message));
    expect(String(bad)).toMatch(/check constraint/);
  });

  it("outbox: hodisalar navbatga bir marta yuboriladi (jobId = event_id) va published_at belgilanadi", async () => {
    await signUp(h, "+998901000001");
    const n = await h.events.drain();
    expect(n).toBeGreaterThanOrEqual(3);
    expect(await h.events.drain()).toBe(0);
    const jobs = await h.events.queue.getJobs(["waiting", "delayed", "active", "completed"]);
    expect(jobs.length).toBe(n);
    expect(new Set(jobs.map((j) => j.id)).size).toBe(n);
    expect(jobs.every((j) => EVENT_SCHEMAS[j.name as keyof typeof EVENT_SCHEMAS])).toBe(true);
    expect((await h.admin.query("select count(*)::int as n from events where published_at is null")).rows[0].n).toBe(0);
    expect(EVENTS_QUEUE).toBe("events");
  });
});

describe("A-3: shaxsiy ma'lumot hodisa xususiyatlariga yozilmaydi", () => {
  it("telefon, ism, manzil, karta kalit nomi bilan ham, qiymat ichida ham aniqlanadi", () => {
    expect(findPii({ phone: "x" })).toBeTruthy();
    expect(findPii({ full_name: "Bekzod" })).toBeTruthy();
    expect(findPii({ address: "Chilonzor" })).toBeTruthy();
    expect(findPii({ lat: 41.2 })).toBeTruthy();
    expect(findPii({ query: "qizim raqami +998 90 123 45 67" })).toBeTruthy();
    expect(findPii({ query: "8600 1234 5678 9012" })).toBeNull(); // bo'shliqli — raqamlar ketma-ket emas
    expect(findPii({ query: "8600123456789012" })).toBeTruthy();
    expect(findPii({ product_id: "p-1", position: 3 })).toBeNull();
  });

  it("qidiruv so'rovida telefon bo'lsa hodisa rad etiladi", async () => {
    const svc = h.app.get(EventsService);
    await expect(h.db.tx({}, (tx) => svc.emit(tx, "search.performed", { query: "+998901234567", results_count: 0 }, { source: "vitrina" }))).rejects.toMatchObject({ details: { reason: "event_contains_pii" } });
  });

  it("haqiqiy kirish oqimida yozilgan barcha hodisalarda telefon yo'q", async () => {
    const o = await makeOwner(h, "+998901000001");
    await call(h, "post", "/v1/invites", { token: o.token, tenant: o.tenantId, body: { phone: "+998901000002", role: "picker" } }).expect(201);
    const all = JSON.stringify((await h.admin.query("select properties from events")).rows);
    expect(all).not.toMatch(/998\d{9}/);
    expect((await h.admin.query("select count(*)::int as n from events")).rows[0].n).toBeGreaterThan(0);
  });

  it("loglarda telefon maskalanadi; maxfiy kalitlar [redacted]", () => {
    expect(maskPhones("OTP +998901234567 uchun; 998 90 123 45 67")).toBe("OTP +99890***4567 uchun; +99890***4567");
    expect(redact({ phone: "+998901234567", nested: { token: "abc", note: "tel +998901234567" }, ok: 1 })).toEqual({ phone: "[redacted]", nested: { token: "[redacted]", note: "tel +99890***4567" }, ok: 1 });
    const lines: string[] = [];
    const log = new AppLogger((l) => lines.push(l));
    log.log("foydalanuvchi +998901234567 kirdi", "T");
    log.error("xato", "stack +998901234567", "T");
    expect(lines.join("")).not.toContain("901234567");
  });

  it("HTTP so'rov jurnalida body va telefon yo'q (marshrut shabloni va ID'lar)", async () => {
    const lines: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    const logger = new AppLogger((l) => lines.push(l));
    // So'rov jurnali Logger orqali yoziladi: Nest Logger statik instansiyasini vaqtincha almashtiramiz
    const { Logger } = await import("@nestjs/common");
    Logger.overrideLogger(logger);
    try {
      const s = await signUp(h, "+998901000001");
      await call(h, "get", "/v1/me", { token: s.token }).expect(200);
    } finally {
      Logger.overrideLogger(false);
      process.stdout.write = orig;
    }
    const out = lines.join("\n");
    expect(out).toMatch(/GET \/v1\/me 200/);
    expect(out).not.toMatch(/901000001/);
    expect(out).not.toContain(s_token_placeholder);
  });
});

const s_token_placeholder = "Bearer ";
