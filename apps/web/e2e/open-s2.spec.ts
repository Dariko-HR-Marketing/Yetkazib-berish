import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });
const OWNER = "90 555 11 01";
const CUSTOMER = "90 555 22 02";
let owner: Page;
let slug = "";
const row = (p: Page, name: string) => p.getByTestId("product-row").filter({ hasText: name });

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  owner = await ctx.newPage();
  await owner.goto("/kirish");
  await owner.getByLabel("Telefon raqami").fill(OWNER);
  await owner.getByRole("button", { name: "Kirish", exact: true }).click();
  await expect(owner).toHaveURL(/dokon-yaratish/);
  await owner.getByLabel("Do'kon nomi", { exact: true }).fill("Baraka Market");
  await owner.getByLabel(/STIR/).fill("123456789");
  await owner.getByRole("button", { name: "Do'kon yaratish" }).click();
  await expect(owner).toHaveURL(/katalog/);
  await owner.getByLabel("Filial nomi").fill("Markaziy");
  await owner.getByLabel("Manzil", { exact: true }).fill("Toshkent, Chilonzor 1");
  await owner.getByRole("button", { name: "Filial qo'shish" }).click();
  for (const [name, price, qty] of [["Sut", "12 500", "10"], ["Non", "4 000", "5"]] as const) {
    await owner.getByRole("button", { name: "Mahsulot qo'shish" }).click();
    await owner.getByLabel("Nomi (o'zbekcha)").fill(name);
    await owner.getByLabel("Narx, so'm").fill(price);
    await owner.getByLabel("Qoldiq (tanlangan filialda)").fill(qty);
    await owner.getByRole("button", { name: "Saqlash", exact: true }).click();
    await expect(row(owner, name)).toBeVisible();
  }
  await owner.getByRole("link", { name: "Buyurtmalar", exact: true }).click();
  const href = await owner.getByRole("link", { name: /Vitrina/ }).getAttribute("href");
  slug = href!.split("/").pop()!;
  expect(slug).toBe("baraka-market");
});
test.afterAll(async () => { await owner.context().close(); });

test("xaridor: vitrina -> savat -> kirish -> buyurtma; jami butun son; qoldiq band", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const c = await ctx.newPage();
  await c.goto(`/d/${slug}`);
  await expect(c.getByRole("link", { name: "Baraka Market" })).toBeVisible();
  const milk = c.getByTestId("shop-product").filter({ hasText: "Sut" });
  await milk.getByRole("button", { name: "Qo'shish" }).click();
  await milk.getByRole("button", { name: "Ko'paytirish" }).click();
  await expect(milk).toContainText("2 dona");
  await c.getByRole("button", { name: /Savatni ko'rish/ }).click();
  await expect(c).toHaveURL(/savat/);
  await expect(c.getByTestId("cart-total")).toContainText("25");
  await c.getByRole("button", { name: "Kirish", exact: true }).click(); // buyurtma berish uchun kirish
  await expect(c).toHaveURL(/kirish/);
  await c.getByLabel("Telefon raqami").fill(CUSTOMER);
  await c.getByRole("button", { name: "Kirish", exact: true }).click();
  await expect(c).toHaveURL(/savat/); // vitrinaga qaytdi, savat saqlangan
  await expect(c.getByTestId("cart-line")).toHaveCount(1);
  await c.getByLabel("Manzil", { exact: true }).fill("Toshkent, Bobur 5-uy");
  await c.getByRole("button", { name: "Buyurtma berish" }).click();
  await expect(c).toHaveURL(/buyurtma\//);
  await expect(c.getByText("Qabul qilindi", { exact: true }).first()).toBeVisible();
  await expect(c.getByTestId("order-total")).toContainText("25");
  await ctx.close();
});

test("do'kon: yangi buyurtma -> qabul -> bajarildi; qoldiq kamayadi; xaridor holatni ko'radi", async ({ browser }) => {
  await owner.goto("/buyurtmalar");
  const o = owner.getByTestId("order-row").first();
  await expect(o).toContainText("Sut × 2 dona");
  await expect(o).toContainText("•••"); // telefon maskalangan
  await o.getByRole("button", { name: "Qabul qilish" }).click();
  await owner.getByRole("button", { name: /^Tasdiqlangan/ }).click();
  await owner.getByTestId("order-row").first().getByRole("button", { name: "Bajarildi" }).click();
  await owner.getByRole("button", { name: /^Bajarilgan/ }).click();
  await expect(owner.getByTestId("order-row")).toHaveCount(1);
  await owner.goto("/katalog");
  await expect(row(owner, "Sut")).toContainText("8");
  // xaridor
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const c = await ctx.newPage();
  await c.goto("/kirish");
  await c.getByLabel("Telefon raqami").fill(CUSTOMER);
  await c.getByRole("button", { name: "Kirish", exact: true }).click();
  await expect(c).toHaveURL(/dokon-yaratish/); // kirish tugadi (xaridorning do'koni yo'q)
  await c.goto(`/d/${slug}/buyurtma`);
  await c.getByRole("link").filter({ hasText: /№/ }).first().click();
  await expect(c.getByText("Bajarildi", { exact: true }).first()).toBeVisible();
  await ctx.close();
});

test("«Tugadi» belgilangach vitrinada darhol ko'rinadi va qo'shib bo'lmaydi; rus tili", async ({ browser }) => {
  await owner.goto("/katalog");
  await row(owner, "Non").getByRole("button", { name: "Tugadi deb belgilash" }).click();
  await expect(row(owner, "Non").getByText("Tugadi", { exact: true }).first()).toBeVisible();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const c = await ctx.newPage();
  await c.addInitScript(() => { try { localStorage.setItem("dostavka.locale", "ru"); } catch { /* */ } });
  await c.goto(`/d/${slug}`);
  const non = c.getByTestId("shop-product").filter({ hasText: "Non" });
  await expect(non.getByRole("button", { name: "Нет в наличии" })).toBeDisabled();
  await expect(c.getByLabel("Поиск товара")).toBeVisible();
  await ctx.close();
});

test("noto'g'ri vitrina havolasi — 404 sahifa", async ({ page }) => {
  const r = await page.goto("/d/yoq-bunday-dokon");
  expect(r?.status()).toBe(404);
});
