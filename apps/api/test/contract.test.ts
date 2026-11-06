import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { loadOpenApi } from "@dostavka/contracts";
import { PLACEHOLDER } from "../src/modules/legal/legal.service";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addStaff, boot, call, CONSENTS, lastCode, makeAdmin, makeOwner, signUp, telegramInitData, totpCode, type Call, type Harness, SHOP_CONSENTS } from "./helpers";

let h: Harness;
beforeAll(async () => { h = await boot(); });
afterAll(async () => { await h.close(); });
beforeEach(async () => { await h.reset(); });

type Spec = ReturnType<typeof loadOpenApi> & { paths: Record<string, Record<string, { operationId: string; requestBody?: { content: { "application/json": { schema: unknown } } }; responses: Record<string, unknown> }>> };
const spec = loadOpenApi() as unknown as Spec;
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema({ $id: "api", components: spec.components });

function responseSchema(method: string, path: string, status: number): unknown {
  const op = spec.paths[path]?.[method];
  if (!op) throw new Error(`Shartnomada yo'q: ${method.toUpperCase()} ${path}`);
  let r = op.responses[String(status)] as { $ref?: string; content?: { "application/json": { schema: unknown } } } | undefined;
  if (!r) throw new Error(`Shartnomada ${method.toUpperCase()} ${path} uchun ${status} javobi yo'q`);
  if (r.$ref) r = (spec.components as unknown as { responses: Record<string, typeof r> }).responses[r.$ref.split("/").pop()!];
  return r?.content?.["application/json"].schema;
}

const checked: string[] = [];
const rewrite = (n: unknown): unknown => {
  if (Array.isArray(n)) return n.map(rewrite);
  if (n && typeof n === "object") return Object.fromEntries(Object.entries(n).map(([k, v]) => [k, k === "$ref" && typeof v === "string" ? v.replace(/^#\//, "api#/") : rewrite(v)]));
  return n;
};
const compile = (schema: unknown) => ajv.compile(rewrite(schema) as object);

/** So'rov tanasi (muvaffaqiyatli holatda) va javobni OpenAPI sxemasi bo'yicha tekshiradi. */
async function op(method: "get" | "post" | "patch" | "put" | "delete", template: string, actual: string, status: number, o: Call = {}) {
  const spc = spec.paths[template]?.[method];
  if (!spc) throw new Error(`Shartnomada yo'q: ${method.toUpperCase()} ${template}`);
  if (status < 300 && o.body !== undefined && spc.requestBody) {
    const rv = compile(spc.requestBody.content["application/json"].schema);
    expect(rv(o.body), `so'rov ${method.toUpperCase()} ${template}: ${JSON.stringify(rv.errors)}`).toBe(true);
  }
  const res = await call(h, method, actual, o).expect(status);
  const schema = responseSchema(method, template, status);
  if (schema) {
    const v = compile(schema);
    expect(v(res.body), `javob ${method.toUpperCase()} ${template} ${status}: ${JSON.stringify(v.errors)}`).toBe(true);
  }
  checked.push(`${method} ${template}`);
  return res;
}

describe("OpenAPI shartnomasi", () => {
  it("shartnoma sxemalari kompilyatsiya bo'ladi", () => {
    for (const name of Object.keys(spec.components.schemas)) expect(() => ajv.compile({ $ref: `api#/components/schemas/${name}` })).not.toThrow();
  });

  it("har bir marshrut shartnomada bor va aksincha (shartnoma ↔ kod)", () => {
    const stack = (h.app.getHttpAdapter().getInstance() as { router: { stack: { route?: { path: string; methods: Record<string, boolean> } }[] } }).router.stack; // Express 5
    const routes = new Set<string>();
    for (const l of stack) if (l.route) for (const m of Object.keys(l.route.methods)) if (!l.route.path.startsWith("/v1/_dev")) routes.add(`${m} ${l.route.path.replace(/:(\w+)/g, "{$1}")}`);
    const contract = new Set<string>();
    for (const [p, ops] of Object.entries(spec.paths)) for (const m of Object.keys(ops)) if (["get", "post", "patch", "put", "delete"].includes(m)) contract.add(`${m} ${p.replace(/\{token\}/, "{token}")}`);
    const norm = (s: Set<string>) => [...s].map((x) => x.replace(/\{\w+\}/g, "{}")).sort();
    expect(norm(routes)).toEqual(norm(contract));
  });

  it("javoblar shartnomaga mos: auth", async () => {
    await op("get", "/v1/health", "/v1/health", 200);
    expect((await h.http.get("/v1/metrics").expect(401)).body.code).toBe("auth.unauthorized");
    const m = await h.http.get("/v1/metrics").set("Authorization", "Bearer test-metrics-token-0123456789").expect(200);
    expect(m.headers["content-type"]).toContain("text/plain");
    expect(m.text).toMatch(/http_request_duration_ms_count\{method="GET",route="\/v1\/health",status="2xx"\} \d+/);
    expect(m.text).toContain("process_uptime_seconds");
    checked.push("get /v1/metrics");
    expect((await op("get", "/v1/auth/config", "/v1/auth/config", 200)).body).toEqual({ open_login: false });
    await op("post", "/v1/auth/open", "/v1/auth/open", 404, { body: { phone: "+998901234567" } }); // sinov rejimi o'chiq
    const phone = "+998901000001";
    await op("post", "/v1/auth/otp/request", "/v1/auth/otp/request", 202, { body: { phone } });
    await op("post", "/v1/auth/otp/request", "/v1/auth/otp/request", 429, { body: { phone } });
    await op("post", "/v1/auth/otp/request", "/v1/auth/otp/request", 400, { body: { phone: "123" } });
    const code = lastCode(h, phone);
    await op("post", "/v1/auth/otp/verify", "/v1/auth/otp/verify", 422, { body: { phone, code } });
    const ok = await op("post", "/v1/auth/otp/verify", "/v1/auth/otp/verify", 200, { body: { phone, code, consents: CONSENTS } });
    await op("post", "/v1/auth/otp/verify", "/v1/auth/otp/verify", 401, { body: { phone, code: "000000" } });
    await op("get", "/v1/me", "/v1/me", 200, { token: ok.body.access_token });
    await op("get", "/v1/me", "/v1/me", 401);
    const tg = telegramInitData("123456:TEST-BOT-TOKEN", { id: 5 }, Math.floor(h.clock.now().getTime() / 1000));
    await op("post", "/v1/auth/telegram", "/v1/auth/telegram", 200, { body: { init_data: tg, consents: CONSENTS } });
    await op("post", "/v1/auth/telegram", "/v1/auth/telegram", 401, { body: { init_data: tg + "x" } });
    const rf = await op("post", "/v1/auth/refresh", "/v1/auth/refresh", 200, { body: { refresh_token: ok.body.refresh_token } });
    const enr = await op("post", "/v1/auth/totp/enroll", "/v1/auth/totp/enroll", 200, { token: rf.body.access_token, key: null });
    await op("post", "/v1/auth/totp/confirm", "/v1/auth/totp/confirm", 400, { token: rf.body.access_token, key: null, body: { code: "000000" } });
    const conf = await op("post", "/v1/auth/totp/confirm", "/v1/auth/totp/confirm", 200, { token: rf.body.access_token, key: null, body: { code: totpCode(enr.body.secret, h) } });
    h.clock.advance(61_000);
    await call(h, "post", "/v1/auth/otp/request", { body: { phone } }).expect(202);
    const mfa = await op("post", "/v1/auth/otp/verify", "/v1/auth/otp/verify", 200, { body: { phone, code: lastCode(h, phone) } });
    expect(mfa.body.mfa_required).toBe(true);
    h.clock.advance(30_000);
    await op("post", "/v1/auth/totp/verify", "/v1/auth/totp/verify", 200, { key: null, body: { mfa_token: mfa.body.mfa_token, code: totpCode(enr.body.secret, h) } });
    await op("post", "/v1/auth/logout", "/v1/auth/logout", 204, { token: conf.body.access_token, key: null });
    await op("post", "/v1/auth/refresh", "/v1/auth/refresh", 401, { body: { refresh_token: conf.body.refresh_token } }); // chiqishdan keyin
  });

  it("javoblar shartnomaga mos: tenancy, features, admin", async () => {
    const o = await makeOwner(h, "+998901000001");
    const T = { token: o.token, tenant: o.tenantId };
    await op("post", "/v1/tenants", "/v1/tenants", 400, { token: o.token, body: { consents: SHOP_CONSENTS, name: "Yangi", tin: "1" } });
    const s2 = await signUp(h, "+998901000009");
    await op("post", "/v1/tenants", "/v1/tenants", 201, { token: s2.token, body: { consents: SHOP_CONSENTS, name: "Ikkinchi", tin: "222222222" } });
    await op("get", "/v1/tenants/{id}", `/v1/tenants/${o.tenantId}`, 200, T);
    await op("get", "/v1/tenants/{id}", `/v1/tenants/${o.tenantId}`, 404, { token: o.token, tenant: "00000000-0000-4000-8000-000000000000" });
    await op("patch", "/v1/tenants/{id}", `/v1/tenants/${o.tenantId}`, 200, { ...T, body: { status: "active" } });
    await op("get", "/v1/branches", "/v1/branches", 200, T);
    await op("post", "/v1/branches", "/v1/branches", 201, { ...T, body: { name: "Markaz", address: "Chilonzor 1", lat: 41.3, lng: 69.2 } });
    await op("get", "/v1/invites", "/v1/invites", 200, T);
    await op("post", "/v1/invites", "/v1/invites", 201, { ...T, body: { phone: "+998901000002", role: "picker" } });
    await op("get", "/v1/members", "/v1/members", 200, T);
    const staff = await addStaff(h, o, "+998901000003", "manager");
    const list = await call(h, "get", "/v1/members", T).expect(200);
    const mid = list.body.items.find((m: { role: string }) => m.role === "manager").id;
    await op("patch", "/v1/members/{id}", `/v1/members/${mid}`, 200, { ...T, body: { role: "cashier" } });
    expect(staff.token).toBeTruthy();
    const feats = await op("get", "/v1/features", "/v1/features", 200, T);
    expect(feats.body.items).toHaveLength(21);
    await op("patch", "/v1/features/{key}", "/v1/features/stock.visible", 200, { ...T, body: { enabled: false } });
    await op("patch", "/v1/features/{key}", "/v1/features/catalog.marketplace_listing", 403, { ...T, body: { enabled: true } });
    await op("patch", "/v1/features/{key}", "/v1/features/payment.cash", 200, { ...T, body: { enabled: false } });
    await op("patch", "/v1/features/{key}", "/v1/features/delivery.own_couriers", 200, { ...T, body: { enabled: false } });
    await op("patch", "/v1/features/{key}", "/v1/features/payment.cash", 422, { ...T, body: { enabled: true } });

    const admin = await makeAdmin(h);
    const A = { token: admin.token };
    const plans = await op("get", "/v1/admin/plans", "/v1/admin/plans", 200, A);
    const biznes = plans.body.items.find((p: { code: string }) => p.code === "biznes");
    const draft = await op("post", "/v1/admin/plans", "/v1/admin/plans", 201, { ...A, body: { code: "biznes", name: "Biznes", price_tiyin: biznes.price_tiyin, limits: biznes.limits, features: biznes.features } });
    await op("post", "/v1/admin/plans/{id}/publish", `/v1/admin/plans/${draft.body.id}/publish`, 200, A);
    await op("post", "/v1/admin/plans/{id}/publish", `/v1/admin/plans/${draft.body.id}/publish`, 409, A);
    await op("get", "/v1/admin/flags", "/v1/admin/flags", 200, A);
    await op("patch", "/v1/admin/flags/{key}", "/v1/admin/flags/stock.visible", 200, { ...A, body: { platform_enabled: true } });
    await op("patch", "/v1/admin/flags/{key}", "/v1/admin/flags/zzz", 404, { ...A, body: { platform_enabled: true } });
    await op("post", "/v1/admin/tenants/{id}/plan", `/v1/admin/tenants/${o.tenantId}/plan`, 200, { ...A, body: { plan_code: "biznes" } });
    await op("post", "/v1/admin/tenants/{id}/plan", `/v1/admin/tenants/${o.tenantId}/plan`, 403, { token: o.token, body: { plan_code: "biznes" } });

    // taklifni qabul qilish
    await call(h, "post", "/v1/invites", { ...T, body: { phone: "+998901000055", role: "courier" } }).expect(201);
    const tok = [...h.sms.outbox].reverse().find((m) => m.phone === "+998901000055")!.text.match(/\/taklif\/([\w-]+)/)![1]!;
    const inv = await signUp(h, "+998901000055");
    await op("post", "/v1/invites/{token}/accept", `/v1/invites/${tok}/accept`, 200, { token: inv.token });
    await op("post", "/v1/invites/{token}/accept", `/v1/invites/${tok}/accept`, 404, { token: inv.token });
  });

  it("javoblar shartnomaga mos: hujjatlar va rozilik", async () => {
    await op("get", "/v1/legal/documents", "/v1/legal/documents?audience=customer", 200);
    await op("get", "/v1/legal/documents", "/v1/legal/documents?audience=zzz", 400);
    await op("get", "/v1/legal/documents/{key}", "/v1/legal/documents/customer_offer", 200);
    await op("get", "/v1/legal/documents/{key}", "/v1/legal/documents/customer_offer?version=77", 404);
    // oferta yangi versiyasi chiqishidan oldin (eski versiya bilan) ro'yxatdan o'tiladi
    const s = await signUp(h, "+998901000099");
    await op("get", "/v1/me/consents", "/v1/me/consents", 200, { token: s.token });
    await op("put", "/v1/me/consents/marketing", "/v1/me/consents/marketing", 200, { token: s.token, body: { granted: true } });
    const admin = await makeAdmin(h);
    const A = { token: admin.token };
    const list = await op("get", "/v1/admin/legal", "/v1/admin/legal", 200, A);
    const offer = list.body.items.find((i: { key: string }) => i.key === "customer_offer");
    await op("post", "/v1/admin/legal/{id}/publish", `/v1/admin/legal/${offer.id}/publish`, 422, { ...A, body: {} });
    const cur = await call(h, "get", "/v1/legal/documents/customer_offer").expect(200);
    const draft = await op("post", "/v1/admin/legal", "/v1/admin/legal", 201, { ...A, body: { key: "customer_offer", locale: "uz", title: "Oferta", body_md: cur.body.body_md.replace(PLACEHOLDER, "Dariko MChJ") } });
    await op("post", "/v1/admin/legal/{id}/publish", `/v1/admin/legal/${draft.body.id}/publish`, 200, { ...A, body: {} });
    await op("post", "/v1/admin/legal/{id}/publish", `/v1/admin/legal/${draft.body.id}/publish`, 409, { ...A, body: {} });
  });

  it("javoblar shartnomaga mos: katalog, qoldiq, import", async () => {
    const o = await makeOwner(h, "+998901000001");
    const T = { token: o.token, tenant: o.tenantId };
    const br = await op("post", "/v1/branches", "/v1/branches", 201, { ...T, body: { name: "Markaz", address: "Chilonzor 1" } });
    const cat = await op("post", "/v1/categories", "/v1/categories", 201, { ...T, body: { name_uz: "Sut", name_ru: "Молочные" } });
    await op("post", "/v1/categories", "/v1/categories", 409, { ...T, body: { name_uz: "sut" } });
    await op("get", "/v1/categories", "/v1/categories", 200, T);
    await op("patch", "/v1/categories/{id}", `/v1/categories/${cat.body.id}`, 200, { ...T, body: { sort: 2 } });
    const p = await op("post", "/v1/products", "/v1/products", 201, { ...T, body: { name_uz: "Sut", price_tiyin: 1250000, unit: "l", category_id: cat.body.id, barcode: "4780000000001" } });
    await op("post", "/v1/products", "/v1/products", 409, { ...T, body: { name_uz: "Sut 2", price_tiyin: 1, barcode: "4780000000001" } });
    await op("post", "/v1/products", "/v1/products", 400, { ...T, body: { name_uz: "", price_tiyin: 1.5 } });
    await op("get", "/v1/products", "/v1/products?limit=10", 200, T);
    await op("get", "/v1/stock", "/v1/stock?stock=out", 200, T);
    await op("get", "/v1/catalog/summary", "/v1/catalog/summary", 200, T);
    await op("get", "/v1/products/{id}", `/v1/products/${p.body.id}?branch_id=${br.body.id}`, 200, T);
    await op("get", "/v1/products/{id}", "/v1/products/00000000-0000-4000-8000-000000000000", 404, T);
    await op("patch", "/v1/products/{id}", `/v1/products/${p.body.id}`, 200, { ...T, body: { price_tiyin: 1300000 } });
    await op("put", "/v1/products/{id}/stock", `/v1/products/${p.body.id}/stock`, 200, { ...T, body: { branch_id: br.body.id, quantity_milli: 1080 } });
    await op("post", "/v1/products/{id}/stock/adjust", `/v1/products/${p.body.id}/stock/adjust`, 200, { ...T, body: { branch_id: br.body.id, delta_milli: 1000 } });
    await op("post", "/v1/products/{id}/stock/adjust", `/v1/products/${p.body.id}/stock/adjust`, 422, { ...T, body: { branch_id: br.body.id, delta_milli: -999999 } });
    await op("post", "/v1/products/{id}/stock/out", `/v1/products/${p.body.id}/stock/out`, 200, { ...T, body: { branch_id: br.body.id, out: true } });
    await op("get", "/v1/products/{id}/stock/movements", `/v1/products/${p.body.id}/stock/movements`, 200, T);
    const csv = Buffer.from("nomi,narx,qoldiq\nNon,4000,5\nXato,abc,1\n").toString("base64");
    const imp = await op("post", "/v1/catalog/imports", "/v1/catalog/imports", 200, { ...T, body: { format: "csv", content_base64: csv, mode: "apply" } });
    await op("post", "/v1/catalog/imports", "/v1/catalog/imports", 200, { ...T, body: { format: "csv", content_base64: csv, mode: "preview" } });
    await op("post", "/v1/catalog/imports", "/v1/catalog/imports", 422, { ...T, body: { format: "csv", content_base64: Buffer.from("x,y\n1,2").toString("base64"), mode: "apply" } });
    await op("get", "/v1/catalog/imports", "/v1/catalog/imports", 200, T);
    await op("get", "/v1/catalog/imports/{id}", `/v1/catalog/imports/${imp.body.job_id}`, 200, T);
    await op("delete", "/v1/products/{id}", `/v1/products/${p.body.id}`, 200, T);
    await op("delete", "/v1/categories/{id}", `/v1/categories/${cat.body.id}`, 200, T);
  });

  it("javoblar shartnomaga mos: vitrina va buyurtmalar", async () => {
    const o = await makeOwner(h, "+998901000001");
    const T = { token: o.token, tenant: o.tenantId };
    await call(h, "patch", `/v1/tenants/${o.tenantId}`, { ...T, body: { status: "active" } }).expect(200);
    const slug = (await call(h, "get", `/v1/tenants/${o.tenantId}`, T)).body.slug as string;
    const br = (await call(h, "post", "/v1/branches", { ...T, body: { name: "Markaz", address: "Chilonzor 1" } }).expect(201)).body.id as string;
    const p = (await call(h, "post", "/v1/products", { ...T, body: { name_uz: "Sut", price_tiyin: 1250000, unit: "l" } }).expect(201)).body.id as string;
    await call(h, "put", `/v1/products/${p}/stock`, { ...T, body: { branch_id: br, quantity_milli: 10000 } }).expect(200);
    await op("get", "/v1/shops/{slug}", `/v1/shops/${slug}`, 200);
    await op("get", "/v1/shops/{slug}", "/v1/shops/yoq", 404);
    await op("get", "/v1/shops/{slug}/categories", `/v1/shops/${slug}/categories`, 200);
    await op("get", "/v1/shops/{slug}/products", `/v1/shops/${slug}/products?branch_id=${br}`, 200);
    const c = await signUp(h, "+998905550001");
    const body = { branch_id: br, fulfillment: "delivery", delivery_address: "Toshkent, Bobur 5", items: [{ product_id: p, quantity_milli: 2000 }] };
    await op("post", "/v1/shops/{slug}/orders", `/v1/shops/${slug}/orders`, 400, { token: c.token, body: { ...body, items: [] } });
    await op("post", "/v1/shops/{slug}/orders", `/v1/shops/${slug}/orders`, 409, { token: c.token, body: { ...body, items: [{ product_id: p, quantity_milli: 99000 }] } });
    const ord = await op("post", "/v1/shops/{slug}/orders", `/v1/shops/${slug}/orders`, 201, { token: c.token, body });
    await op("get", "/v1/shops/{slug}/orders", `/v1/shops/${slug}/orders`, 200, { token: c.token });
    await op("get", "/v1/shops/{slug}/loyalty", `/v1/shops/${slug}/loyalty`, 200, { token: c.token });
    await op("get", "/v1/delivery/settings", "/v1/delivery/settings", 200, T);
    await op("get", "/v1/reports/sales", "/v1/reports/sales?days=7", 200, T);
    await op("get", "/v1/reports/sales", "/v1/reports/sales?days=0", 400, T);
    await op("get", "/v1/marketplace/shops", "/v1/marketplace/shops", 200);
    const adm = await makeAdmin(h, "+998900000077");
    await op("get", "/v1/admin/tenants", "/v1/admin/tenants", 200, { token: adm.token });
    await op("get", "/v1/admin/tenants", "/v1/admin/tenants", 403, T);
    await op("put", "/v1/delivery/settings", "/v1/delivery/settings", 200, { ...T, body: { fee_tiyin: 0, free_from_tiyin: null, min_order_tiyin: 0 } });
    await op("put", "/v1/delivery/settings", "/v1/delivery/settings", 400, { ...T, body: { fee_tiyin: -5, free_from_tiyin: null, min_order_tiyin: 0 } });
    await op("get", "/v1/shops/{slug}/orders/{id}", `/v1/shops/${slug}/orders/${ord.body.id}`, 200, { token: c.token });
    await op("get", "/v1/orders", "/v1/orders?status=placed", 200, T);
    await op("get", "/v1/orders/{id}", `/v1/orders/${ord.body.id}`, 200, T);
    await op("post", "/v1/orders/{id}/status", `/v1/orders/${ord.body.id}/status`, 409, { ...T, body: { status: "completed" } });
    await op("post", "/v1/orders/{id}/status", `/v1/orders/${ord.body.id}/status`, 200, { ...T, body: { status: "accepted" } });
    await op("post", "/v1/shops/{slug}/orders/{id}/cancel", `/v1/shops/${slug}/orders/${ord.body.id}/cancel`, 409, { token: c.token, body: {} });
    const o2 = await call(h, "post", `/v1/shops/${slug}/orders`, { token: c.token, body }).expect(201);
    await op("post", "/v1/shops/{slug}/orders/{id}/cancel", `/v1/shops/${slug}/orders/${o2.body.id}/cancel`, 200, { token: c.token, body: { reason: "fikrim o'zgardi" } });
  });

  it("javoblar shartnomaga mos: yig'ish, dispetcher, kuryer", async () => {
    const o = await makeOwner(h, "+998901000001");
    const T = { token: o.token, tenant: o.tenantId };
    await call(h, "patch", `/v1/tenants/${o.tenantId}`, { ...T, body: { status: "active" } }).expect(200);
    await h.admin.query("update tenants set plan_code = 'pro' where id = $1", [o.tenantId]);
    const slug = (await call(h, "get", `/v1/tenants/${o.tenantId}`, T)).body.slug as string;
    const br = (await call(h, "post", "/v1/branches", { ...T, body: { name: "Markaz", address: "Chilonzor 1" } }).expect(201)).body.id as string;
    const p = (await call(h, "post", "/v1/products", { ...T, body: { name_uz: "Non", price_tiyin: 500000 } }).expect(201)).body.id as string;
    await call(h, "put", `/v1/products/${p}/stock`, { ...T, body: { branch_id: br, quantity_milli: 10000 } }).expect(200);
    const courier = await addStaff(h, o, "+998901000013", "courier");
    const cid = (await h.admin.query("select id from users where phone = '+998901000013'")).rows[0].id as string;
    const c = await signUp(h, "+998905550001");
    const ord = (await call(h, "post", `/v1/shops/${slug}/orders`, { token: c.token, body: { branch_id: br, fulfillment: "delivery", delivery_address: "Toshkent, Bobur 5", items: [{ product_id: p, quantity_milli: 2000 }] } }).expect(201)).body;
    await call(h, "post", `/v1/orders/${ord.id}/status`, { ...T, body: { status: "accepted" } }).expect(200);
    await op("get", "/v1/picking", "/v1/picking", 200, T);
    await op("post", "/v1/orders/{id}/pick/start", `/v1/orders/${ord.id}/pick/start`, 200, T);
    await op("post", "/v1/orders/{id}/pick/finish", `/v1/orders/${ord.id}/pick/finish`, 409, T);
    const itemId = (await call(h, "get", `/v1/orders/${ord.id}`, T)).body.items[0].id as string;
    await op("put", "/v1/orders/{id}/items/{itemId}/pick", `/v1/orders/${ord.id}/items/${itemId}/pick`, 200, { ...T, body: { status: "picked" } });
    await op("post", "/v1/orders/{id}/pick/finish", `/v1/orders/${ord.id}/pick/finish`, 200, T);
    await op("get", "/v1/dispatch/couriers", "/v1/dispatch/couriers", 200, T);
    await op("post", "/v1/orders/{id}/assign", `/v1/orders/${ord.id}/assign`, 200, { ...T, body: { courier_user_id: cid } });
    const K = { token: courier.token, tenant: o.tenantId };
    const mine = await op("get", "/v1/courier/deliveries", "/v1/courier/deliveries", 200, K);
    const did = mine.body.items[0].delivery_id as string;
    await op("post", "/v1/courier/location", "/v1/courier/location", 200, { ...K, body: { lat: 41.3, lng: 69.2 } });
    await op("post", "/v1/courier/deliveries/{id}/pickup", `/v1/courier/deliveries/${did}/pickup`, 200, K);
    await op("post", "/v1/courier/deliveries/{id}/deliver", `/v1/courier/deliveries/${did}/deliver`, 200, K);
    const ord2 = (await call(h, "post", `/v1/shops/${slug}/orders`, { token: c.token, body: { branch_id: br, fulfillment: "delivery", delivery_address: "Toshkent, Bobur 5", items: [{ product_id: p, quantity_milli: 1000 }] } }).expect(201)).body;
    await call(h, "post", `/v1/orders/${ord2.id}/status`, { ...T, body: { status: "accepted" } }).expect(200);
    await call(h, "post", `/v1/orders/${ord2.id}/pick/start`, T).expect(200);
    const i2 = (await call(h, "get", `/v1/orders/${ord2.id}`, T)).body.items[0].id as string;
    await call(h, "put", `/v1/orders/${ord2.id}/items/${i2}/pick`, { ...T, body: { status: "picked" } }).expect(200);
    await call(h, "post", `/v1/orders/${ord2.id}/pick/finish`, T).expect(200);
    await call(h, "post", `/v1/orders/${ord2.id}/assign`, { ...T, body: { courier_user_id: cid } }).expect(200);
    const d2 = (await call(h, "get", "/v1/courier/deliveries", K)).body.items.find((x: { order: { id: string } }) => x.order.id === ord2.id).delivery_id as string;
    await call(h, "post", `/v1/courier/deliveries/${d2}/pickup`, K).expect(200);
    await op("post", "/v1/courier/deliveries/{id}/fail", `/v1/courier/deliveries/${d2}/fail`, 200, { ...K, body: { reason: "xaridor javob bermadi" } });
  });

  it("javoblar shartnomaga mos: onlayn to'lov", async () => {
    const o = await makeOwner(h, "+998901000001");
    const T = { token: o.token, tenant: o.tenantId };
    await call(h, "patch", `/v1/tenants/${o.tenantId}`, { ...T, body: { status: "active" } }).expect(200);
    const slug = (await call(h, "get", `/v1/tenants/${o.tenantId}`, T)).body.slug as string;
    const br = (await call(h, "post", "/v1/branches", { ...T, body: { name: "Markaz", address: "Chilonzor 1" } }).expect(201)).body.id as string;
    const p = (await call(h, "post", "/v1/products", { ...T, body: { name_uz: "Non", price_tiyin: 500000 } }).expect(201)).body.id as string;
    await call(h, "put", `/v1/products/${p}/stock`, { ...T, body: { branch_id: br, quantity_milli: 10000 } }).expect(200);
    await op("get", "/v1/payments/settings", "/v1/payments/settings", 200, T);
    await op("put", "/v1/payments/settings", "/v1/payments/settings", 422, { ...T, body: { provider: "payme", secret: "abcdefgh1234", enabled: true } });
    await op("put", "/v1/payments/settings", "/v1/payments/settings", 200, { ...T, body: { provider: "mock", secret: "abcdefgh1234", enabled: true } });
    const c = await signUp(h, "+998905550001");
    const ord = (await call(h, "post", `/v1/shops/${slug}/orders`, { token: c.token, body: { branch_id: br, fulfillment: "pickup", payment_type: "online", items: [{ product_id: p, quantity_milli: 2000 }] } }).expect(201)).body;
    const raw = JSON.stringify({ event_id: "e1", payment_id: ord.payment.id, type: "captured", amount_tiyin: ord.total_tiyin });
    const sig = (await import("node:crypto")).createHmac("sha256", "abcdefgh1234").update(raw).digest("hex");
    const send = (body: string, sg: string) => h.http.post(`/v1/webhooks/mock/${slug}`).set("Content-Type", "application/json").set("x-signature", sg).send(body);
    const bad = await send(raw, "0".repeat(64)); expect(bad.status).toBe(401);
    const ok = await send(raw, sig); expect(ok.status).toBe(200);
    checked.push("post /v1/webhooks/{provider}/{slug}");
    await op("post", "/v1/shops/{slug}/payments/{id}/sandbox", `/v1/shops/${slug}/payments/${ord.payment.id}/sandbox`, 200, { token: c.token, body: { outcome: "captured" } });
    await op("post", "/v1/orders/{id}/refund", `/v1/orders/${ord.id}/refund`, 200, { ...T, body: { amount_tiyin: 100000, reason: "sifat" } });
    await op("post", "/v1/orders/{id}/refund", `/v1/orders/${ord.id}/refund`, 422, { ...T, body: { amount_tiyin: 999999999, reason: "ko'p" } });
    await op("get", "/v1/orders/{id}", `/v1/orders/${ord.id}`, 200, T);
  });

  it("shartnoma o'zgarmasligini kafolatlovchi: har operatsiya testda ishlatilgan", () => {
    const used = new Set(checked);
    const missing: string[] = [];
    for (const [p, ops] of Object.entries(spec.paths)) for (const m of Object.keys(ops)) if (["get", "post", "patch", "put", "delete"].includes(m) && !used.has(`${m} ${p}`)) missing.push(`${m} ${p}`);
    // bu test oldingi ikki test natijasiga tayanadi (bir faylda ketma-ket)
    expect(missing).toEqual([]);
  });

});
