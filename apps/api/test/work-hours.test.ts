import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { isOpenAt, workHoursSchema } from "../src/common/work-hours";
import { boot, call, makeOwner, signUp, addStaff, type Harness } from "./helpers";

const WEEK = { open: "09:00", close: "21:00" };
const sched = { mon: WEEK, tue: WEEK, wed: WEEK, thu: WEEK, fri: WEEK, sat: { open: "10:00", close: "24:00" }, sun: null };
// 2026-11-09 (dushanba) 04:00 UTC = 09:00 Toshkent
const at = (iso: string) => new Date(iso);

describe("isOpenAt", () => {
  it("jadval yo'q — doim ochiq; buzilgan jadval ham to'smaydi", () => {
    expect(isOpenAt({}, at("2026-11-09T00:00:00Z"))).toBe(true);
    expect(isOpenAt({ foo: 1 }, at("2026-11-09T00:00:00Z"))).toBe(true);
  });
  it("Toshkent vaqti (UTC+5): chegaralar, dam kuni, yarim tun", () => {
    expect(isOpenAt(sched, at("2026-11-09T03:59:00Z"))).toBe(false); // du 08:59
    expect(isOpenAt(sched, at("2026-11-09T04:00:00Z"))).toBe(true); // du 09:00
    expect(isOpenAt(sched, at("2026-11-09T15:59:00Z"))).toBe(true); // du 20:59
    expect(isOpenAt(sched, at("2026-11-09T16:00:00Z"))).toBe(false); // du 21:00
    expect(isOpenAt(sched, at("2026-11-14T18:59:00Z"))).toBe(true); // sha 23:59 (close 24:00)
    expect(isOpenAt(sched, at("2026-11-15T07:00:00Z"))).toBe(false); // yak 12:00 — dam
    expect(isOpenAt(sched, at("2026-11-08T19:30:00Z"))).toBe(false); // UTC yakshanba 19:30 = Toshkent du 00:30
  });
  it("sxema: noto'g'ri vaqt, close<=open, yetishmayotgan kun rad etiladi", () => {
    expect(workHoursSchema.safeParse(sched).success).toBe(true);
    expect(workHoursSchema.safeParse({}).success).toBe(true);
    expect(workHoursSchema.safeParse({ ...sched, mon: { open: "21:00", close: "09:00" } }).success).toBe(false);
    expect(workHoursSchema.safeParse({ ...sched, mon: { open: "9:00", close: "10:00" } }).success).toBe(false);
    expect(workHoursSchema.safeParse({ ...sched, mon: { open: "25:00", close: "26:00" } }).success).toBe(false);
    expect(workHoursSchema.safeParse({ mon: WEEK }).success).toBe(false);
  });
});

let h: Harness;
beforeAll(async () => { h = await boot(); });
afterAll(async () => { await h.close(); });
beforeEach(async () => { await h.reset(); });
const as = (o: { token: string; tenantId: string }) => ({ token: o.token, tenant: o.tenantId });

describe("filial ish vaqti: API", () => {
  it("o'zgartirish (audit bilan), vitrinada open_now, yopiq filialda buyurtma 422, ochilgach o'tadi; ruxsat va begona filial", async () => {
    const o = await makeOwner(h, "+998901000001", "123456789", "Yashil");
    await call(h, "patch", `/v1/tenants/${o.tenantId}`, { ...as(o), body: { status: "active" } }).expect(200);
    const branch = (await call(h, "post", "/v1/branches", { ...as(o), body: { name: "Markaz", address: "Toshkent, Chilonzor 1" } }).expect(201)).body.id as string;
    const slug = (await call(h, "get", `/v1/tenants/${o.tenantId}`, as(o))).body.slug as string;
    const p = (await call(h, "post", "/v1/products", { ...as(o), body: { name_uz: "Non", price_tiyin: 500000, unit: "piece" } }).expect(201)).body.id as string;
    await call(h, "put", `/v1/products/${p}/stock`, { ...as(o), body: { branch_id: branch, quantity_milli: 100000 } }).expect(200);
    const c = await signUp(h, "+998905550001");
    const order = () => call(h, "post", `/v1/shops/${slug}/orders`, { token: c.token, body: { branch_id: branch, fulfillment: "pickup", items: [{ product_id: p, quantity_milli: 1000 }] } });

    // standart: jadval yo'q — doim ochiq
    expect((await call(h, "get", `/v1/shops/${slug}`).expect(200)).body.branches[0]).toMatchObject({ work_hours: {}, open_now: true });

    const upd = (body: unknown) => call(h, "patch", `/v1/branches/${branch}`, { ...as(o), body });
    const allClosed = { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null };
    const allDay = { open: "00:00", close: "24:00" };
    const alwaysOpen = { mon: allDay, tue: allDay, wed: allDay, thu: allDay, fri: allDay, sat: allDay, sun: allDay };
    await upd({ work_hours: sched }).expect(200);
    expect((await call(h, "get", "/v1/branches", as(o)).expect(200)).body.items[0].work_hours.mon).toEqual(WEEK);
    await upd({ work_hours: allClosed }).expect(200);
    expect((await call(h, "get", `/v1/shops/${slug}`).expect(200)).body.branches[0].open_now).toBe(false);
    const closed = await order().expect(422);
    expect(closed.body.code).toBe("order.branch_closed");
    expect(closed.body.message_uz).toMatch(/yopiq/);

    await upd({ work_hours: alwaysOpen }).expect(200);
    expect((await call(h, "get", `/v1/shops/${slug}`).expect(200)).body.branches[0].open_now).toBe(true);
    await order().expect(201);

    expect((await h.admin.query("select count(*)::int as n from audit_log where action = 'branch.work_hours_updated'")).rows[0].n).toBe(3);
    await upd({ work_hours: { mon: WEEK } }).expect(400);
    await upd({ work_hours: sched, extra: 1 }).expect(400);
    await upd({ work_hours: {} }).expect(200); // jadvalni olib tashlash
    expect((await call(h, "get", `/v1/shops/${slug}`).expect(200)).body.branches[0].open_now).toBe(true);

    const cashier = await addStaff(h, o, "+998901000011", "cashier");
    await call(h, "patch", `/v1/branches/${branch}`, { token: cashier.token, tenant: o.tenantId, body: { work_hours: {} } }).expect(403);
    const o2 = await makeOwner(h, "+998901000002", "987654321", "Boshqa");
    await call(h, "patch", `/v1/branches/${branch}`, { ...as(o2), body: { work_hours: {} } }).expect(404);
  });
});
