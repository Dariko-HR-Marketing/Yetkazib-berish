import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addStaff, boot, call, makeAdmin, makeOwner, renew, signUp, type Harness } from "./helpers";
import { FEATURE_CACHE_TTL_MS } from "../src/modules/plans-flags/features.service";

let h: Harness;
beforeAll(async () => { h = await boot(); });
afterAll(async () => { await h.close(); });
beforeEach(async () => { await h.reset(); });

const setPlan = async (admin: { token: string }, tenantId: string, plan: string) =>
  call(h, "post", `/v1/admin/tenants/${tenantId}/plan`, { token: admin.token, body: { plan_code: plan } }).expect(200);
const toggle = (o: { token: string; tenantId: string }, key: string, enabled: boolean) =>
  call(h, "patch", `/v1/features/${key}`, { token: o.token, tenant: o.tenantId, body: { enabled } });
const features = async (o: { token: string; tenantId: string }) => {
  const r = await call(h, "get", "/v1/features", { token: o.token, tenant: o.tenantId }).expect(200);
  return { plan: r.body.plan, by: Object.fromEntries(r.body.items.map((i: { key: string }) => [i.key, i])) as Record<string, Record<string, unknown>> };
};

describe("can(tenant, key): 3 qatlam × yoqilgan/o'chirilgan = 8 holat", () => {
  // platforma ∧ paket ∧ do'kon — jadval testi. `loyalty.points`: paket biznes+, default do'konda o'chiq
  const cases: [boolean, boolean, boolean][] = [];
  for (const p of [true, false]) for (const k of [true, false]) for (const s of [true, false]) cases.push([p, k, s]);

  it.each(cases)("platforma=%s paket=%s do'kon=%s -> %s", async (platform, inPlan, shop) => {
    const o = await makeOwner(h, "+998901000001");
    const admin = await makeAdmin(h);
    await setPlan(admin, o.tenantId, inPlan ? "biznes" : "start"); // loyalty.points: biznesdan
    // do'kon darajasi (faqat paketda bo'lsa toggle mumkin; aks holda to'g'ridan-to'g'ri qator — bu "do'kon yoqqan, keyin paket pasaygan" holati)
    await h.admin.query("insert into tenant_features (tenant_id, feature_key, enabled) values ($1,'loyalty.points',$2)", [o.tenantId, shop]);
    await h.features.invalidate(o.tenantId);
    await call(h, "patch", "/v1/admin/flags/loyalty.points", { token: admin.token, body: { platform_enabled: platform } }).expect(200);
    const expected = platform && inPlan && shop;
    expect(await h.features.can(o.tenantId, "loyalty.points")).toBe(expected);
    const f = (await features(o)).by["loyalty.points"]!;
    expect(f).toMatchObject({ platform_enabled: platform, in_plan: inPlan, shop_enabled: shop, enabled: expected });
  });

  it("noma'lum kalit — false", async () => {
    const o = await makeOwner(h, "+998901000001");
    expect(await h.features.can(o.tenantId, "no.such.key")).toBe(false);
  });

  it("bog'liqlik: payment.cash faqat delivery.own_couriers yoqilgan bo'lsa ishlaydi", async () => {
    const o = await makeOwner(h, "+998901000001");
    expect(await h.features.can(o.tenantId, "payment.cash")).toBe(true);
    await h.admin.query("insert into tenant_features (tenant_id, feature_key, enabled) values ($1,'delivery.own_couriers',false)", [o.tenantId]);
    await h.features.invalidate(o.tenantId);
    expect(await h.features.can(o.tenantId, "payment.cash")).toBe(false);
    expect((await features(o)).by["payment.cash"]!.blocked_by).toEqual(["delivery.own_couriers"]);
  });
});

describe("F-1: platformada o'chirilgan kalit (avariya o'chirgichi)", () => {
  it("barcha do'konlarda can() = yo'q, egasi yoqa olmaydi", async () => {
    const a = await makeOwner(h, "+998901000001", "111111111", "A do'kon");
    const b = await makeOwner(h, "+998901000002", "222222222", "B do'kon");
    const admin = await makeAdmin(h);
    expect(await h.features.can(a.tenantId, "storefront.own")).toBe(true);
    await call(h, "patch", "/v1/admin/flags/storefront.own", { token: admin.token, body: { platform_enabled: false } }).expect(200);
    expect(await h.features.can(a.tenantId, "storefront.own")).toBe(false);
    expect(await h.features.can(b.tenantId, "storefront.own")).toBe(false);
    const r = await toggle(a, "storefront.own", true).expect(403);
    expect(r.body.code).toBe("feature.platform_disabled");
    // qaytarish
    await call(h, "patch", "/v1/admin/flags/storefront.own", { token: admin.token, body: { platform_enabled: true } }).expect(200);
    expect(await h.features.can(a.tenantId, "storefront.own")).toBe(true);
  });

  it("pilotda platforma kuryerlari puli platforma darajasida o'chiq (D3)", async () => {
    const o = await makeOwner(h, "+998901000001");
    const r = await toggle(o, "delivery.platform_pool", true).expect(403);
    expect(r.body.code).toBe("feature.platform_disabled");
    expect(await h.features.can(o.tenantId, "delivery.platform_pool")).toBe(false);
  });
});

describe("F-2: kalit paketda yo'q", () => {
  it("403 feature.not_in_plan, paket nomi bilan; holat ro'yxatida qulf", async () => {
    const o = await makeOwner(h, "+998901000001");
    const r = await toggle(o, "catalog.marketplace_listing", true).expect(403);
    expect(r.body.code).toBe("feature.not_in_plan");
    expect(r.body.details.min_plan).toBe("biznes");
    expect(r.body.message_uz).toContain("Biznes");
    expect(r.body.message_ru).toContain("Biznes");
    const f = (await features(o)).by["catalog.marketplace_listing"]!;
    expect(f).toMatchObject({ enabled: false, in_plan: false, min_plan: "biznes" });
  });

  it("Start -> Biznes: 'Umumiy katalog' kaliti qulfdan chiqadi va yoqiladi", async () => {
    const o = await makeOwner(h, "+998901000001");
    const admin = await makeAdmin(h);
    await toggle(o, "catalog.marketplace_listing", true).expect(403);
    await setPlan(admin, o.tenantId, "biznes");
    expect((await features(o)).by["catalog.marketplace_listing"]).toMatchObject({ in_plan: true, enabled: false }); // default: do'konda o'chiq
    const r = await toggle(o, "catalog.marketplace_listing", true).expect(200);
    expect(r.body).toMatchObject({ key: "catalog.marketplace_listing", enabled: true });
    expect(await h.features.can(o.tenantId, "catalog.marketplace_listing")).toBe(true);
  });

  it("paket pasayganda kalit avtomatik yopiladi (do'kon yoqqan bo'lsa ham)", async () => {
    const o = await makeOwner(h, "+998901000001");
    const admin = await makeAdmin(h);
    await setPlan(admin, o.tenantId, "biznes");
    await toggle(o, "loyalty.points", true).expect(200);
    expect(await h.features.can(o.tenantId, "loyalty.points")).toBe(true);
    await setPlan(admin, o.tenantId, "start");
    expect(await h.features.can(o.tenantId, "loyalty.points")).toBe(false);
  });

  it("sovg'a kartalari (v2) hech qaysi paketda yo'q va egasi yoqa olmaydi", async () => {
    const o = await makeOwner(h, "+998901000001");
    const admin = await makeAdmin(h);
    await setPlan(admin, o.tenantId, "tarmoq");
    expect((await toggle(o, "loyalty.gift_cards", true).expect(403)).body.code).toBe("feature.not_toggleable");
    expect(await h.features.can(o.tenantId, "loyalty.gift_cards")).toBe(false);
  });

  it("noma'lum kalit — 404", async () => {
    const o = await makeOwner(h, "+998901000001");
    expect((await toggle(o, "nope.nope", true).expect(404)).body.code).toBe("feature.unknown");
  });
});

describe("F-3: paketda bor kalitni o'chirish — 60 soniya ichida", () => {
  it("egasi o'chirgach can() darhol yo'q qaytaradi (kesh bekor qilinadi)", async () => {
    const o = await makeOwner(h, "+998901000001");
    expect(await h.features.can(o.tenantId, "stock.visible")).toBe(true); // keshga tushdi
    await toggle(o, "stock.visible", false).expect(200);
    expect(await h.features.can(o.tenantId, "stock.visible")).toBe(false);
    await toggle(o, "stock.visible", true).expect(200);
    expect(await h.features.can(o.tenantId, "stock.visible")).toBe(true);
  });

  it("kesh 60 soniya amal qiladi: bazaga to'g'ridan-to'g'ri yozuv 60 soniyadan keyin ko'rinadi", async () => {
    const o = await makeOwner(h, "+998901000001");
    expect(await h.features.can(o.tenantId, "stock.visible")).toBe(true);
    await h.admin.query("insert into tenant_features (tenant_id, feature_key, enabled) values ($1,'stock.visible',false)", [o.tenantId]);
    expect(await h.features.can(o.tenantId, "stock.visible")).toBe(true); // hali keshdan
    h.clock.advance(FEATURE_CACHE_TTL_MS - 1000);
    expect(await h.features.can(o.tenantId, "stock.visible")).toBe(true);
    h.clock.advance(2000);
    expect(await h.features.can(o.tenantId, "stock.visible")).toBe(false);
  });

  it("platforma o'zgarishi barcha do'konlar keshini bekor qiladi", async () => {
    const o = await makeOwner(h, "+998901000001");
    const admin = await makeAdmin(h);
    expect(await h.features.can(o.tenantId, "stock.visible")).toBe(true);
    await call(h, "patch", "/v1/admin/flags/stock.visible", { token: admin.token, body: { platform_enabled: false } }).expect(200);
    expect(await h.features.can(o.tenantId, "stock.visible")).toBe(false);
  });

  it("egasi bo'lmagan rol kalit o'zgartira olmaydi", async () => {
    const o = await makeOwner(h, "+998901000001");
    const m = await addStaff(h, o, "+998901000002", "manager");
    await call(h, "patch", "/v1/features/stock.visible", { token: m.token, tenant: o.tenantId, body: { enabled: false } }).expect(403);
  });
});

describe("F-4: paket yangi versiyasi, funksiya olib tashlangan", () => {
  const draftFrom = async (admin: { token: string }, code: string, mutate: (f: string[]) => string[], limits?: object) => {
    const list = await call(h, "get", "/v1/admin/plans", { token: admin.token }).expect(200);
    const cur = list.body.items.filter((p: { code: string; status: string }) => p.code === code && p.status === "published").sort((a: { version: number }, b: { version: number }) => b.version - a.version)[0];
    const d = await call(h, "post", "/v1/admin/plans", { token: admin.token, body: { code, name: cur.name, price_tiyin: cur.price_tiyin, limits: limits ?? cur.limits, features: mutate(cur.features) } }).expect(201);
    return d.body as { id: string; version: number };
  };

  it("mavjud do'konga 30 kunlik ogohlantirish; eski shartlar muddat oxirigacha, keyin yangi", async () => {
    const o = await makeOwner(h, "+998901000001");
    const admin = await makeAdmin(h);
    await setPlan(admin, o.tenantId, "biznes");
    await toggle(o, "loyalty.points", true).expect(200);
    const draft = await draftFrom(admin, "biznes", (f) => f.filter((k) => k !== "loyalty.points"));
    expect(draft.version).toBe(2);
    const pub = await call(h, "post", `/v1/admin/plans/${draft.id}/publish`, { token: admin.token }).expect(200);
    expect(pub.body.status).toBe("published");

    // darhol: do'kon eski (v1) shartlarda, migratsiya sanasi 30 kundan keyin
    const f1 = await features(o);
    expect(f1.plan).toMatchObject({ code: "biznes", version: 1 });
    expect(f1.by["loyalty.points"]!.enabled).toBe(true);
    const at = new Date(f1.plan.migrate_at).getTime();
    expect(at - h.clock.now().getTime()).toBeGreaterThan(30 * 24 * 3600 * 1000 - 5000);
    const ev = (await h.admin.query("select properties from events where name = 'plan.changed' and tenant_id = $1 order by ts desc limit 1", [o.tenantId])).rows[0];
    expect(ev.properties).toMatchObject({ old: "biznes@1", new: "biznes@2", migrate_at: expect.any(String) });

    h.clock.advance(29 * 24 * 3600 * 1000);
    await h.features.invalidate(o.tenantId);
    const o2 = await renew(h, o);
    expect((await features(o2)).by["loyalty.points"]!.enabled).toBe(true); // hali eski shartlar
    h.clock.advance(2 * 24 * 3600 * 1000);
    await h.features.invalidate(o.tenantId);
    const o3 = await renew(h, o2);
    const f3 = await features(o3);
    expect(f3.plan.version).toBe(2);
    expect(f3.by["loyalty.points"]).toMatchObject({ in_plan: false, enabled: false });
  });

  it("funksiya olib tashlanmagan bo'lsa do'kon darhol yangi versiyaga o'tadi", async () => {
    const o = await makeOwner(h, "+998901000001");
    const admin = await makeAdmin(h);
    const draft = await draftFrom(admin, "start", (f) => f, { orders_month: 300, branches: 1, staff: 3, integrations: 0 }); // limit oshdi
    await call(h, "post", `/v1/admin/plans/${draft.id}/publish`, { token: admin.token }).expect(200);
    const f = await features(o);
    expect(f.plan).toMatchObject({ version: 2, migrate_at: null });
    expect(f.plan.limits.orders_month).toBe(300);
  });

  it("limit kamaytirilsa ham 30 kunlik ogohlantirish", async () => {
    const o = await makeOwner(h, "+998901000001");
    const admin = await makeAdmin(h);
    const draft = await draftFrom(admin, "start", (f) => f, { orders_month: 150, branches: 1, staff: 2, integrations: 0 });
    await call(h, "post", `/v1/admin/plans/${draft.id}/publish`, { token: admin.token }).expect(200);
    const f = await features(o);
    expect(f.plan).toMatchObject({ version: 1 });
    expect(f.plan.migrate_at).toBeTruthy();
    expect(f.plan.limits.staff).toBe(3);
  });

  it("qoralama faqat bir marta chop etiladi; noma'lum kalit rad etiladi; admin bo'lmaganlar kira olmaydi", async () => {
    const o = await makeOwner(h, "+998901000001");
    const admin = await makeAdmin(h);
    await call(h, "post", "/v1/admin/plans", { token: admin.token, body: { code: "start", name: "S", limits: {}, features: ["bad.key"] } }).expect(400);
    const draft = await draftFrom(admin, "start", (f) => f);
    await call(h, "post", `/v1/admin/plans/${draft.id}/publish`, { token: admin.token }).expect(200);
    await call(h, "post", `/v1/admin/plans/${draft.id}/publish`, { token: admin.token }).expect(409);
    await call(h, "get", "/v1/admin/plans", { token: o.token }).expect(403);
    await call(h, "post", `/v1/admin/tenants/${o.tenantId}/plan`, { token: o.token, body: { plan_code: "pro" } }).expect(403);
  });

  it("platforma admini TOTP'siz admin endpointlarga kira olmaydi", async () => {
    const s = await signUp(h, "+998900000077");
    await h.admin.query("update users set is_platform_admin = true where id = $1", [s.userId]);
    const r = await call(h, "get", "/v1/admin/plans", { token: s.token }).expect(403);
    expect(r.body.code).toBe("auth.mfa_required");
  });
});

describe("F-5: naqd faqat o'z kuryerlari bilan (bog'liqlik qoidasi)", () => {
  it("naqd yoqilgan: o'z kuryerlarini o'chirish rad etiladi", async () => {
    const o = await makeOwner(h, "+998901000001");
    expect(await h.features.can(o.tenantId, "payment.cash")).toBe(true);
    const r = await toggle(o, "delivery.own_couriers", false).expect(422);
    expect(r.body.code).toBe("feature.required_by");
    expect(r.body.details.dependent).toBe("payment.cash");
    expect(await h.features.can(o.tenantId, "delivery.own_couriers")).toBe(true);
  });

  it("avval naqdni o'chirib, keyin kuryerlarni o'chirish mumkin; keyin naqdni yoqish rad etiladi", async () => {
    const o = await makeOwner(h, "+998901000001");
    await toggle(o, "payment.cash", false).expect(200);
    await toggle(o, "delivery.own_couriers", false).expect(200);
    const r = await toggle(o, "payment.cash", true).expect(422);
    expect(r.body.code).toBe("feature.requires");
    expect(r.body.details.dependency).toBe("delivery.own_couriers");
    await toggle(o, "delivery.own_couriers", true).expect(200);
    await toggle(o, "payment.cash", true).expect(200);
  });

  it("loyalty.stamp_cards loyalty.points'ga bog'liq", async () => {
    const o = await makeOwner(h, "+998901000001");
    const admin = await makeAdmin(h);
    await setPlan(admin, o.tenantId, "pro");
    expect((await toggle(o, "loyalty.stamp_cards", true).expect(422)).body.details.dependency).toBe("loyalty.points");
    await toggle(o, "loyalty.points", true).expect(200);
    await toggle(o, "loyalty.stamp_cards", true).expect(200);
    expect((await toggle(o, "loyalty.points", false).expect(422)).body.details.dependent).toBe("loyalty.stamp_cards");
  });
});

describe("F-6: har o'zgarish hodisa va audit yozuvi", () => {
  it("feature.toggled hodisasi va audit (oldin/keyin, kim)", async () => {
    const o = await makeOwner(h, "+998901000001");
    await toggle(o, "stock.visible", false).expect(200);
    const ev = (await h.admin.query("select properties, tenant_id, actor_id, source from events where name = 'feature.toggled'")).rows;
    expect(ev).toEqual([{ properties: { key: "stock.visible", old: true, new: false }, tenant_id: o.tenantId, actor_id: o.userId, source: "panel" }]);
    const a = (await h.admin.query("select action, before, after, actor_id, tenant_id from audit_log where action = 'feature.toggled'")).rows;
    expect(a).toEqual([{ action: "feature.toggled", before: { enabled: true }, after: { enabled: false }, actor_id: o.userId, tenant_id: o.tenantId }]);
  });

  it("platforma kalitini o'zgartirish ham yoziladi", async () => {
    const admin = await makeAdmin(h);
    await call(h, "patch", "/v1/admin/flags/stock.visible", { token: admin.token, body: { platform_enabled: false } }).expect(200);
    const a = (await h.admin.query("select before, after from audit_log where action = 'flag.platform_toggled'")).rows;
    expect(a).toEqual([{ before: { platform_enabled: true }, after: { platform_enabled: false } }]);
    expect((await h.admin.query("select count(*)::int as n from events where name = 'feature.toggled' and tenant_id is null")).rows[0].n).toBe(1);
  });

  it("GET /v1/features barcha 21 ta kalitni qaytaradi", async () => {
    const o = await makeOwner(h, "+998901000001");
    expect((await features(o)).by).toHaveProperty("storefront.own");
    expect(Object.keys((await features(o)).by)).toHaveLength(21);
  });
});
