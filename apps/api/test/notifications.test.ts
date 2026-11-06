import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationsService } from "../src/modules/notifications/notifications.service";
import { TelegramSender } from "../src/modules/notifications/telegram.sender";
import { boot, call, makeOwner, signUp, type Harness } from "./helpers";

let h: Harness;
beforeAll(async () => { h = await boot(); });
afterAll(async () => { await h.close(); });
beforeEach(async () => { await h.reset(); });

const as = (o: { token: string; tenantId: string }) => ({ token: o.token, tenant: o.tenantId });

async function setup() {
  const o = await makeOwner(h, "+998901000001");
  await call(h, "patch", `/v1/tenants/${o.tenantId}`, { ...as(o), body: { status: "active" } }).expect(200);
  const branch = (await call(h, "post", "/v1/branches", { ...as(o), body: { name: "Markaziy", address: "Toshkent, Chilonzor 1" } }).expect(201)).body.id as string;
  const slug = (await call(h, "get", `/v1/tenants/${o.tenantId}`, as(o))).body.slug as string;
  const p = (await call(h, "post", "/v1/products", { ...as(o), body: { name_uz: "Non", price_tiyin: 500000, unit: "piece" } }).expect(201)).body.id as string;
  await call(h, "put", `/v1/products/${p}/stock`, { ...as(o), body: { branch_id: branch, quantity_milli: 50000 } }).expect(200);
  const c = await signUp(h, "+998905550001");
  const order = (fulfillment: "pickup" | "delivery" = "pickup") => call(h, "post", `/v1/shops/${slug}/orders`, { token: c.token, body: { branch_id: branch, fulfillment, ...(fulfillment === "delivery" ? { delivery_address: "Toshkent, Bobur ko'chasi 5" } : {}), items: [{ product_id: p, quantity_milli: 2000 }] } }).expect(201).then((r) => r.body);
  const status = (id: string, s: string) => call(h, "post", `/v1/orders/${id}/status`, { ...as(o), body: { status: s } }).expect(200);
  const svc = () => h.app.get(NotificationsService);
  return { o, c, order, status, svc };
}

describe("xabarnomalar", () => {
  it("holat o'zgarishida SMS (Telegram yo'q): matn uz, do'kon nomi va raqam bor; shaxsiy ma'lumot yo'q; takror yuborilmaydi", async () => {
    const s = await setup();
    const ord = await s.order();
    await s.status(ord.id, "accepted");
    await s.status(ord.id, "completed");
    expect(await s.svc().processDue()).toBe(3);
    const texts = h.sms.outbox.filter((m) => m.phone === "+998905550001" && /Yashil Savat/.test(m.text)).map((m) => m.text);
    expect(texts).toEqual([`Yashil Savat: №${ord.number} buyurtmangiz qabul qilindi`, `Yashil Savat: №${ord.number} buyurtmangiz tasdiqlandi`, `Yashil Savat: №${ord.number} buyurtma bajarildi. Rahmat!`]);
    expect(await s.svc().processDue()).toBe(0);
    expect((await h.admin.query("select status, channel from notifications order by id")).rows.every((r) => r.status === "sent" && r.channel === "sms")).toBe(true);
    expect(JSON.stringify((await h.admin.query("select params from notifications")).rows)).not.toMatch(/Bobur|9055/);
  });

  it("xaridorning o'zi bekor qilsa xabar yo'q; do'kon bekor qilsa bor; yetkazish: tayyor/yo'lda/muvaffaqiyatsiz shablonlari", async () => {
    const s = await setup();
    const a = await s.order();
    await call(h, "post", `/v1/shops/${(await call(h, "get", `/v1/tenants/${s.o.tenantId}`, as(s.o))).body.slug}/orders/${a.id}/cancel`, { token: s.c.token, body: {} }).expect(200);
    expect((await h.admin.query("select template from notifications order by id")).rows.map((r) => r.template)).toEqual(["notify.order_placed"]);
    const b = await s.order();
    await s.status(b.id, "cancelled");
    expect((await h.admin.query("select template from notifications order by id desc limit 1")).rows[0].template).toBe("notify.order_cancelled");
  });

  it("Telegram: telegram_id va token bo'lsa Telegram orqali; til foydalanuvchi tilida (ru)", async () => {
    const s = await setup();
    await h.admin.query("update users set telegram_id = 777001, locale = 'ru' where id = $1", [s.c.userId]);
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    h.app.get(TelegramSender).fetchImpl = fetchMock as unknown as typeof fetch;
    await s.order();
    expect(await s.svc().processDue()).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toContain("/sendMessage");
    expect(JSON.parse(init.body)).toMatchObject({ chat_id: "777001", text: expect.stringContaining("ваш заказ №") });
    expect((await h.admin.query("select channel from notifications")).rows[0].channel).toBe("telegram");
  });

  it("yuborish xato: qayta urinish (kechikish bilan), 5 urinishdan keyin failed; token xato matniga tushmaydi", async () => {
    const s = await setup();
    await h.admin.query("update users set telegram_id = 777001 where id = $1", [s.c.userId]);
    h.app.get(TelegramSender).fetchImpl = vi.fn(async () => { throw new Error("connect ECONNREFUSED https://api.telegram.org/bot123456:TEST-BOT-TOKEN/sendMessage"); }) as unknown as typeof fetch;
    await s.order();
    for (let i = 1; i <= 5; i++) {
      await s.svc().processDue();
      const n = (await h.admin.query("select status, attempts, last_error from notifications")).rows[0];
      expect(n.attempts).toBe(i);
      expect(n.last_error).not.toContain("TEST-BOT-TOKEN");
      if (i < 5) { expect(n.status).toBe("pending"); await h.admin.query("update notifications set next_attempt_at = now()"); }
      else expect(n.status).toBe("failed");
    }
    // kechikish: darhol qayta ishlanmaydi
    await s.order();
    await s.svc().processDue();
    await s.svc().processDue();
    expect((await h.admin.query("select attempts from notifications where status = 'pending'")).rows[0].attempts).toBe(1);
  });

  it("begona do'kon xabarnomalari izolyatsiyalangan (RLS)", async () => {
    const s = await setup();
    await s.order();
    const o2 = await makeOwner(h, "+998901000002", "987654321", "Boshqa");
    const r = await h.db.tx({ tenantId: o2.tenantId }, (tx) => tx.query("select * from notifications"));
    expect(r.rowCount).toBe(0);
  });
});
