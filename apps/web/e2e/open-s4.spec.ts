import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { Client } from "pg";
import { inviteToken } from "./helpers";

test.describe.configure({ mode: "serial" });
const DB = process.env.E2E_DATABASE_URL ?? "postgresql://dostavka:dostavka@127.0.0.1:5432/dostavka_e2e";
const P = { owner: "90 666 11 01", picker: "+998906661102", dispatcher: "+998906661103", courier: "+998906661104", customer: "90 666 22 02" };
const digits = (p: string) => p.replace(/\D/g, "").slice(-9);
let owner: Page;
let slug = "";

async function loginAs(browser: Browser, phone: string, o: { geo?: boolean } = {}): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, ...(o.geo ? { geolocation: { latitude: 41.3, longitude: 69.27 }, permissions: ["geolocation"] } : {}) });
  if (o.geo) await ctx.grantPermissions(["geolocation"], { origin: "http://127.0.0.1:3010" });
  const page = await ctx.newPage();
  await page.goto("/kirish");
  await page.getByLabel("Telefon raqami").fill(digits(phone));
  await page.getByRole("button", { name: "Kirish", exact: true }).click();
  return { ctx, page };
}

test.beforeAll(async ({ browser, request }) => {
  const o = await loginAs(browser, P.owner);
  owner = o.page;
  await expect(owner).toHaveURL(/dokon-yaratish/);
  await owner.getByLabel("Do'kon nomi", { exact: true }).fill("Tezkor Market");
  await owner.getByLabel(/STIR/).fill("123456789");
  await owner.getByRole("button", { name: "Do'kon yaratish" }).click();
  await expect(owner).toHaveURL(/katalog/);
  slug = "tezkor-market";
  // kuryer, yig'uvchi, dispetcher: Start paketi 3 xodim — Pro'ga o'tkazamiz (admin vazifasi, testda to'g'ridan-to'g'ri baza)
  const db = new Client({ connectionString: DB });
  await db.connect();
  await db.query("update tenants set plan_code = 'pro' where slug = $1", [slug]);
  await db.end();
  await owner.getByLabel("Filial nomi").fill("Markaziy");
  await owner.getByLabel("Manzil", { exact: true }).fill("Toshkent, Chilonzor 1");
  await owner.getByRole("button", { name: "Filial qo'shish" }).click();
  await owner.getByRole("button", { name: "Mahsulot qo'shish" }).click();
  await owner.getByLabel("Nomi (o'zbekcha)").fill("Olma");
  await owner.getByLabel("Narx, so'm").fill("20 000");
  await owner.getByLabel("Birlik").selectOption("kg");
  await owner.getByLabel("Qoldiq (tanlangan filialda)").fill("10");
  await owner.getByRole("button", { name: "Saqlash", exact: true }).click();
  await expect(owner.getByTestId("product-row").filter({ hasText: "Olma" })).toBeVisible();
  // xodimlarni taklif qilish (jamoa sahifasi) va qabul qilish
  await owner.goto("/jamoa");
  for (const [phone, role] of [[P.picker, "picker"], [P.dispatcher, "dispatcher"], [P.courier, "courier"]] as const) {
    await owner.locator("#inv-phone").fill(phone);
    await owner.locator("#inv-role").selectOption(role);
    await Promise.all([
      owner.waitForResponse((r) => r.url().includes("/v1/invites") && r.request().method() === "POST" && r.status() === 201),
      owner.getByRole("button", { name: "Taklif yuborish" }).click(),
    ]);
    const token = await inviteToken(request, phone);
    const s = await loginAs(browser, phone);
    await expect(s.page).toHaveURL(/dokon-yaratish/); // kirish tugadi
    await s.page.goto(`/taklif/${token}`);
    await expect(s.page).toHaveURL(/jamoa|yigish|dispetcher|kuryer|paket|katalog/);
    await s.ctx.close();
  }
});
test.afterAll(async () => { await owner.context().close(); });

test("to'liq zanjir: xaridor -> qabul -> yig'ish (kam yig'ildi) -> kuryer biriktirish -> yetkazish; qoldiq va jami to'g'ri", async ({ browser }) => {
  // xaridor
  const c = await loginAs(browser, P.customer);
  await expect(c.page).toHaveURL(/dokon-yaratish/);
  await c.page.goto(`/d/${slug}`);
  const apple = c.page.getByTestId("shop-product").filter({ hasText: "Olma" });
  await apple.getByRole("button", { name: "Qo'shish" }).click();
  await apple.getByRole("button", { name: "Ko'paytirish" }).click(); // 1 kg
  await apple.getByRole("button", { name: "Ko'paytirish" }).click(); // 1,5 kg
  await c.page.getByRole("button", { name: /Savatni ko'rish/ }).click();
  await c.page.getByLabel("Manzil", { exact: true }).fill("Toshkent, Bobur ko'chasi 5");
  await c.page.getByRole("button", { name: "Buyurtma berish" }).click();
  await expect(c.page).toHaveURL(/buyurtma\//);
  await expect(c.page.getByTestId("order-total")).toContainText("30");
  const orderUrl = c.page.url();

  // egasi qabul qiladi
  await owner.goto("/buyurtmalar");
  await owner.getByTestId("order-row").first().getByRole("button", { name: "Qabul qilish" }).click();

  // yig'uvchi: 1,5 kg o'rniga 1 kg yig'adi
  const pk = await loginAs(browser, P.picker);
  await expect(pk.page).toHaveURL(/yigish/);
  const po = pk.page.getByTestId("pick-order");
  await po.getByRole("button", { name: "Yig'ishni boshlash" }).click();
  await expect(po.getByRole("button", { name: "Yig'ish tugadi" })).toBeDisabled(); // hali belgilanmagan
  await po.getByLabel(/Yig'ilgan miqdor: Olma/).fill("1");
  await po.getByRole("button", { name: "Saqlash", exact: true }).click();
  await expect(po.getByText("Yig'ildi", { exact: true }).first()).toBeVisible();
  await po.getByRole("button", { name: "Yig'ish tugadi" }).click();
  await expect(pk.page.getByText("Yig'iladigan buyurtma yo'q")).toBeVisible();
  await pk.ctx.close();

  // dispetcher kuryerni biriktiradi
  const dp = await loginAs(browser, P.dispatcher);
  await expect(dp.page).toHaveURL(/dispetcher/);
  const card = dp.page.getByTestId("dispatch-order").first();
  await expect(card).toContainText("20");
  const value = await card.locator("option", { hasText: P.courier }).getAttribute("value");
  await card.locator("select").selectOption(value!);
  await card.getByRole("button", { name: "Biriktirish" }).click();
  await expect(dp.page.getByTestId("dispatch-order").first()).toContainText("Kuryer: +998906661104");

  // kuryer
  const cr = await loginAs(browser, P.courier, { geo: true });
  await expect(cr.page).toHaveURL(/kuryer/);
  const d = cr.page.getByTestId("courier-delivery");
  await expect(d).toContainText("Bobur ko'chasi 5");
  await expect(d).toContainText("+998906662202"); // mijoz telefoni to'liq
  await d.getByRole("button", { name: "Buyurtmani oldim" }).click();
  await expect(cr.page.getByText(/Joylashuv (yuborilmoqda|ruxsati yo.q)/)).toBeVisible();
  await d.getByRole("button", { name: "Yetkazdim, naqd oldim" }).click();
  await expect(cr.page.getByTestId("courier-delivery").getByText("Yetkazildi", { exact: true })).toBeVisible();
  await cr.ctx.close();
  await dp.ctx.close();

  // xaridor: bajarildi; jami 1 kg × 20 000 = 20 000
  await c.page.goto(orderUrl);
  await expect(c.page.getByText("Bajarildi", { exact: true }).first()).toBeVisible();
  await expect(c.page.getByTestId("order-total")).toContainText("20");
  await c.ctx.close();

  // qoldiq: 10 - 1 = 9 kg, band 0
  await owner.goto("/katalog");
  await expect(owner.getByTestId("product-row").filter({ hasText: "Olma" })).toContainText("9");
});
