import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyCtx } from "../src/db/db.service";
import { addStaff, boot, call, makeOwner, type Harness } from "./helpers";

let h: Harness;
beforeAll(async () => { h = await boot(); });
afterAll(async () => { await h.close(); });
beforeEach(async () => { await h.reset(); });

/** Global jadvallar (Z15): RLS yo'q, faqat server kodi murojaat qiladi. Yangi jadval qo'shilsa — ikki ro'yxatdan biriga kiritilishi shart. */
const GLOBAL_TABLES = ["users", "otp_codes", "otp_locks", "refresh_tokens", "idempotency_keys", "plans", "plan_features", "feature_flags", "schema_migrations"];
const TENANT_TABLES = ["tenants", "branches", "memberships", "invites", "tenant_features", "consents", "events", "audit_log"];

describe("RLS qamrovi", () => {
  it("har jadval yo'q RLS (majburiy) yoki global ro'yxatda — yangi jadval RLS'siz qolib ketmaydi", async () => {
    const r = await h.admin.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      "select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'");
    const tables = r.rows;
    for (const t of tables) {
      if (GLOBAL_TABLES.includes(t.relname)) { expect(t.relrowsecurity, `${t.relname} global bo'lishi kerak`).toBe(false); continue; }
      expect(TENANT_TABLES, `${t.relname}: na RLS ro'yxatida, na global ro'yxatda`).toContain(t.relname);
      expect(t.relrowsecurity, `${t.relname} RLS yoqilmagan`).toBe(true);
      expect(t.relforcerowsecurity, `${t.relname} FORCE RLS yoqilmagan`).toBe(true);
    }
    expect(tables.map((t) => t.relname).sort()).toEqual([...GLOBAL_TABLES, ...TENANT_TABLES].sort());
  });

  it("ilova roli RLS'ni chetlab o'ta olmaydi (BYPASSRLS va superuser yo'q)", async () => {
    const r = await h.admin.query("select rolsuper, rolbypassrls from pg_roles where rolname = 'dostavka_app'");
    expect(r.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
  });
});

describe("RLS izolyatsiyasi: 2 do'kon, har tenant jadvali bo'yicha o'qish/yozish/o'chirish", () => {
  async function setup() {
    const a = await makeOwner(h, "+998901000001", "111111111", "A do'kon");
    const b = await makeOwner(h, "+998901000002", "222222222", "B do'kon");
    await addStaff(h, a, "+998901000003", "picker");
    await addStaff(h, b, "+998901000004", "picker");
    for (const o of [a, b]) {
      await call(h, "post", "/v1/branches", { token: o.token, tenant: o.tenantId, body: { name: "Markaz", address: "Chilonzor 1" } }).expect(201);
      await call(h, "patch", "/v1/features/stock.visible", { token: o.token, tenant: o.tenantId, body: { enabled: false } }).expect(200);
      await call(h, "post", "/v1/invites", { token: o.token, tenant: o.tenantId, body: { phone: o === a ? "+998901000005" : "+998901000006", role: "cashier" } }).expect(201).catch(() => undefined);
    }
    return { a, b };
  }

  const asApp = <T>(ctx: Parameters<typeof applyCtx>[1], fn: (q: (sql: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>) => Promise<T>) =>
    h.db.tx(ctx, (tx) => fn((sql, p) => tx.query(sql, p)));

  it.each(["tenants", "branches", "memberships", "invites", "tenant_features", "consents", "events", "audit_log"])("%s: A konteksti B qatorlarini ko'rmaydi", async (table) => {
    const { a, b } = await setup();
    const idCol = table === "tenants" ? "id" : "tenant_id";
    const seenA = await asApp({ tenantId: a.tenantId }, (q) => q(`select distinct ${idCol} as t from ${table} where ${idCol} is not null`));
    expect(seenA.rows.map((r) => r.t)).not.toContain(b.tenantId);
    const seenB = await asApp({ tenantId: b.tenantId }, (q) => q(`select distinct ${idCol} as t from ${table} where ${idCol} is not null`));
    expect(seenB.rows.map((r) => r.t)).not.toContain(a.tenantId);
  });

  it("kontekstsiz (tenant va foydalanuvchisiz) hech narsa ko'rinmaydi", async () => {
    await setup();
    for (const t of ["tenants", "branches", "memberships", "invites", "tenant_features", "consents", "events", "audit_log"]) {
      const r = await asApp({}, (q) => q(`select count(*)::int as n from ${t}`));
      expect(r.rows[0]!.n, t).toBe(0);
    }
  });

  it("A konteksti B qatorini o'zgartira/o'chira olmaydi (0 qator ta'sirlanadi)", async () => {
    const { a, b } = await setup();
    const ctx = { tenantId: a.tenantId, userId: a.userId };
    expect((await asApp(ctx, (q) => q("update tenants set name = 'hack' where id = $1", [b.tenantId]))).rowCount).toBe(0);
    expect((await asApp(ctx, (q) => q("update branches set name = 'hack' where tenant_id = $1", [b.tenantId]))).rowCount).toBe(0);
    expect((await asApp(ctx, (q) => q("update memberships set role = 'owner' where tenant_id = $1", [b.tenantId]))).rowCount).toBe(0);
    expect((await asApp(ctx, (q) => q("update invites set status = 'accepted' where tenant_id = $1", [b.tenantId]))).rowCount).toBe(0);
    expect((await asApp(ctx, (q) => q("update tenant_features set enabled = true where tenant_id = $1", [b.tenantId]))).rowCount).toBe(0);
    expect((await asApp(ctx, (q) => q("delete from tenant_features where tenant_id = $1", [b.tenantId]))).rowCount).toBe(0);
    expect((await h.admin.query("select name from tenants where id = $1", [b.tenantId])).rows[0].name).toBe("B do'kon");
    expect((await h.admin.query("select enabled from tenant_features where tenant_id = $1", [b.tenantId])).rows[0].enabled).toBe(false);
  });

  it("A konteksti B do'koni nomiga qator qo'sha olmaydi (WITH CHECK)", async () => {
    const { a, b } = await setup();
    const ctx = { tenantId: a.tenantId, userId: a.userId };
    await expect(asApp(ctx, (q) => q("insert into branches (tenant_id, name, address) values ($1,'x','yyy')", [b.tenantId]))).rejects.toThrow(/row-level security/);
    await expect(asApp(ctx, (q) => q("insert into memberships (tenant_id, user_id, role) values ($1,$2,'owner')", [b.tenantId, a.userId]))).rejects.toThrow(/row-level security/);
    await expect(asApp(ctx, (q) => q("insert into tenant_features (tenant_id, feature_key, enabled) values ($1,'stock.visible',true)", [b.tenantId]))).rejects.toThrow(/row-level security/);
    await expect(asApp(ctx, (q) => q("insert into audit_log (tenant_id, action, entity, entity_id) values ($1,'x','y','z')", [b.tenantId]))).rejects.toThrow(/row-level security/);
    await expect(asApp(ctx, (q) => q("insert into events (tenant_id, name, source) values ($1,'auth.signed_in','panel')", [b.tenantId]))).rejects.toThrow(/row-level security/);
    await expect(asApp(ctx, (q) => q("update branches set tenant_id = $1 where tenant_id = $2", [b.tenantId, a.tenantId]))).rejects.toThrow(/row-level security/); // "ko'chirib yuborish" ham yo'q
  });

  it("foydalanuvchi faqat o'z a'zoliklarini va o'z do'konlarini ko'radi (konteksti do'konsiz)", async () => {
    const { a, b } = await setup();
    const t = await asApp({ userId: a.userId }, (q) => q("select id from tenants"));
    expect(t.rows.map((r) => r.id)).toEqual([a.tenantId]);
    const m = await asApp({ userId: a.userId }, (q) => q("select tenant_id from memberships"));
    expect(m.rows.every((r) => r.tenant_id === a.tenantId)).toBe(true);
    expect(JSON.stringify(m.rows)).not.toContain(b.tenantId);
  });

  it("do'kon yaratish: tenant_id kontekstga mos kelmasa rad etiladi", async () => {
    const { a } = await setup();
    await expect(asApp({ userId: a.userId, tenantId: "00000000-0000-4000-8000-0000000000aa" }, (q) => q("insert into tenants (id, name, tin) values (gen_random_uuid(), 'Soxta', '333333333')"))).rejects.toThrow(/row-level security/);
  });

  it("taklif tokeni xeshi bilan faqat shu taklif ko'rinadi", async () => {
    const { a, b } = await setup();
    const invA = (await h.admin.query("select token_hash from invites where tenant_id = $1 limit 1", [a.tenantId])).rows[0];
    const r = await asApp({ inviteHash: invA.token_hash }, (q) => q("select tenant_id from invites"));
    expect(r.rows.length).toBe(1);
    expect(r.rows[0]!.tenant_id).toBe(a.tenantId);
    expect(r.rows.map((x) => x.tenant_id)).not.toContain(b.tenantId);
  });

  it("platforma konteksti faqat o'qish va belgilangan o'zgartirishlar uchun; oddiy so'rov uni o'rnata olmaydi", async () => {
    const { a } = await setup();
    const all = await asApp({ platform: true }, (q) => q("select count(*)::int as n from tenants"));
    expect(all.rows[0]!.n).toBe(2);
    // app.platform faqat SET LOCAL bilan, ya'ni tranzaksiya ichida; tashqarida qolmaydi
    const after = await asApp({ tenantId: a.tenantId }, (q) => q("select current_setting('app.platform', true) as p, count(*)::int as n from tenants"));
    expect(after.rows[0]).toMatchObject({ p: "off", n: 1 });
    const pool = await h.db.pool.connect();
    try {
      const r = await pool.query("select coalesce(nullif(current_setting('app.platform', true), ''), 'bo''sh') as p, count(*)::int as n from tenants");
      expect(r.rows[0]).toEqual({ p: expect.stringMatching(/off|bo'sh/), n: 0 }); // tranzaksiyasiz ulanishda kontekst qolmaydi
    } finally { pool.release(); }
  });
});

describe("RLS HTTP darajasida", () => {
  it("A egasi B do'konining har qanday resursiga 404 oladi (UI/API orqali)", async () => {
    const a = await makeOwner(h, "+998901000001", "111111111", "A do'kon");
    const b = await makeOwner(h, "+998901000002", "222222222", "B do'kon");
    await call(h, "post", "/v1/branches", { token: b.token, tenant: b.tenantId, body: { name: "B filial", address: "Yunusobod 4" } }).expect(201);
    for (const p of ["/v1/branches", "/v1/members", "/v1/invites", "/v1/features"]) {
      await call(h, "get", p, { token: a.token, tenant: b.tenantId }).expect(404);
    }
    const mine = await call(h, "get", "/v1/branches", { token: a.token, tenant: a.tenantId }).expect(200);
    expect(mine.body.items).toEqual([]);
  });
});
