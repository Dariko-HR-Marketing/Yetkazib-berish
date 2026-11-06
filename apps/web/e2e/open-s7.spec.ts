import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { Client } from "pg";

test.describe.configure({ mode: "serial" });
const DB = process.env.E2E_DATABASE_URL ?? "postgresql://dostavka:dostavka@127.0.0.1:5432/dostavka_e2e";
const db = async <T>(fn: (c: Client) => Promise<T>) => { const c = new Client({ connectionString: DB }); await c.connect(); try { return await fn(c); } finally { await c.end(); } };

async function login(browser: Browser, phone: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("/kirish");
  await page.getByLabel("Telefon raqami").fill(phone);
  await page.getByRole("button", { name: "Kirish", exact: true }).click();
  return page;
}

test("hisobot, admin paneli va umumiy katalog", async ({ browser }) => {
  // egasi: do'kon + mahsulot + bitta bajarilgan buyurtma (xaridor orqali)
  const owner = await login(browser, "90 777 11 01");
  await expect(owner).toHaveURL(/dokon-yaratish/);
  await owner.getByLabel("Do'kon nomi", { exact: true }).fill("Moviy Bozor");
  await owner.getByLabel(/STIR/).fill("123456789");
  await owner.getByRole("button", { name: "Do'kon yaratish" }).click();
  await expect(owner).toHaveURL(/katalog/);
  await owner.getByLabel("Filial nomi").fill("Markaziy");
  await owner.getByLabel("Manzil", { exact: true }).fill("Toshkent, Chilonzor 1");
  await owner.getByRole("button", { name: "Filial qo'shish" }).click();
  await owner.getByRole("button", { name: "Mahsulot qo'shish" }).click();
  await owner.getByLabel("Nomi (o'zbekcha)").fill("Non");
  await owner.getByLabel("Narx, so'm").fill("5 000");
  await owner.getByLabel("Qoldiq (tanlangan filialda)").fill("20");
  await owner.getByRole("button", { name: "Saqlash", exact: true }).click();
  await expect(owner.getByTestId("product-row")).toHaveCount(1);

  await owner.goto("/hisobot");
  await expect(owner.getByText("Bu davrda bajarilgan buyurtma yo'q")).toBeVisible();

  const cust = await login(browser, "90 777 22 02");
  await expect(cust).toHaveURL(/dokon-yaratish/);
  await cust.goto("/d/moviy-bozor");
  await cust.getByTestId("shop-product").getByRole("button", { name: "Qo'shish" }).click();
  await cust.getByRole("button", { name: /Savatni ko'rish/ }).click();
  await cust.getByLabel("Manzil", { exact: true }).fill("Toshkent, Bobur 5");
  await cust.getByRole("button", { name: "Buyurtma berish" }).click();
  await expect(cust).toHaveURL(/buyurtma\//);

  await owner.goto("/buyurtmalar");
  await owner.getByTestId("order-row").first().getByRole("button", { name: "Qabul qilish" }).click();
  await owner.getByRole("button", { name: /^Tasdiqlangan/ }).click();
  await owner.getByTestId("order-row").first().getByRole("button", { name: "Bajarildi" }).click();
  await owner.goto("/hisobot");
  await expect(owner.getByTestId("report-stats")).toContainText("1");
  await expect(owner.getByTestId("report-stats")).toContainText("5");
  await expect(owner.getByText("Eng ko'p sotilgan")).toBeVisible();

  // platforma admini
  const admin = await login(browser, "90 777 00 00");
  await expect(admin).toHaveURL(/dokon-yaratish|admin/);
  await db((c) => c.query("update users set is_platform_admin = true where phone = '+998907770000'"));
  await admin.goto("/admin");
  const row = admin.getByTestId("admin-tenant").filter({ hasText: "Moviy Bozor" });
  await expect(row).toBeVisible();
  await row.getByLabel(/Paket: Moviy Bozor/).selectOption("biznes");
  await expect(admin.getByText("Paket o'zgartirildi")).toBeVisible();
  await admin.getByRole("button", { name: "Funksiyalar" }).click();
  await expect(admin.getByText("catalog.marketplace_listing")).toBeVisible();
  await admin.getByRole("button", { name: "Hujjatlar" }).click();
  await expect(admin.getByText("customer_offer · uz").first()).toBeVisible();

  // umumiy katalog: yoqilmaguncha bo'sh, yoqilgach do'kon ko'rinadi
  await owner.context().newPage().then(async (p) => { await p.goto("/yaqin"); await expect(p.getByText("Hozircha do'konlar yo'q")).toBeVisible(); await p.close(); });
  const tid = await db(async (c) => (await c.query("select id from tenants where slug = 'moviy-bozor'")).rows[0].id as string);
  const r = await owner.request.patch("/v1/features/catalog.marketplace_listing", { headers: { Origin: "http://127.0.0.1:3010", "X-Tenant-Id": tid, "Idempotency-Key": randomUUID(), "Content-Type": "application/json" }, data: { enabled: true } });
  expect(r.status()).toBe(200);
  await owner.goto("/yaqin");
  await expect(owner.getByTestId("market-shop")).toContainText("Moviy Bozor");
});

test("profil: marketing roziligi alohida yoqiladi va qaytarib olinadi; audit va mijozlar sahifalari egasiga ochiq", async ({ browser }) => {
  const p = await login(browser, "90 777 33 03");
  await expect(p).toHaveURL(/dokon-yaratish/);
  await p.goto("/profil");
  await expect(p.getByTestId("prof-phone")).toContainText("•••");
  const sw = p.getByRole("switch", { name: /xabar olish/ });
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await expect(p.getByTestId("prof-consents")).toContainText("Qabul qilingan");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await expect(p.getByTestId("prof-consents")).toContainText("Qaytarib olingan");
  // do'konsiz foydalanuvchi egasi sahifalariga kirmaydi
  await p.goto("/audit");
  await expect(p).toHaveURL(/dokon-yaratish/);
});

test("ish vaqti: egasi filialni yopadi — vitrinada 'Hozir yopiq', buyurtma tugmasi o'chadi; qayta ochgach tiklanadi", async ({ browser }) => {
  const owner = await login(browser, "90 777 44 04");
  await expect(owner).toHaveURL(/dokon-yaratish/);
  await owner.getByLabel("Do'kon nomi", { exact: true }).fill("Qizil Bozor");
  await owner.getByLabel(/STIR/).fill("223456789");
  await owner.getByRole("button", { name: "Do'kon yaratish" }).click();
  await expect(owner).toHaveURL(/katalog/);
  await owner.getByLabel("Filial nomi").fill("Markaziy");
  await owner.getByLabel("Manzil", { exact: true }).fill("Toshkent, Chilonzor 1");
  await owner.getByRole("button", { name: "Filial qo'shish" }).click();
  await owner.getByRole("button", { name: "Mahsulot qo'shish" }).click();
  await owner.getByLabel("Nomi (o'zbekcha)").fill("Non");
  await owner.getByLabel("Narx, so'm").fill("5 000");
  await owner.getByLabel("Qoldiq (tanlangan filialda)").fill("20");
  await owner.getByRole("button", { name: "Saqlash", exact: true }).click();
  await expect(owner.getByTestId("product-row")).toHaveCount(1);

  const cust = await login(browser, "90 777 55 05");
  await cust.goto("/d/qizil-bozor");
  await expect(cust.getByTestId("shop-closed")).toHaveCount(0);

  // hamma kunlarni dam qilamiz
  await owner.goto("/paket");
  const card = owner.getByTestId("wh-branch");
  await card.getByRole("switch", { name: "Doim ochiq (jadvalsiz)" }).click();
  for (const d of ["Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba"]) await card.getByRole("switch", { name: d, exact: true }).click();
  const saved = owner.waitForResponse((r) => r.url().includes("/v1/branches/") && r.request().method() === "PATCH");
  await card.getByRole("button", { name: "Saqlash" }).click();
  const resp = await saved;
  expect(resp.status(), await resp.text()).toBe(200);
  await expect(owner.getByText("Ish vaqti saqlandi")).toBeVisible();

  await cust.goto("/d/qizil-bozor");
  await expect(cust.getByTestId("shop-closed")).toBeVisible();
  await cust.getByTestId("shop-product").getByRole("button", { name: "Qo'shish" }).click();
  await cust.getByRole("button", { name: /Savatni ko'rish/ }).click();
  await expect(cust.getByTestId("branch-closed")).toBeVisible();
  await expect(cust.getByRole("button", { name: "Buyurtma berish" })).toBeDisabled();

  // qayta "doim ochiq"
  await card.getByRole("switch", { name: "Doim ochiq (jadvalsiz)" }).click();
  await card.getByRole("button", { name: "Saqlash" }).click();
  await expect(owner.getByText("Ish vaqti saqlandi").first()).toBeVisible();
  await cust.reload();
  await expect(cust.getByTestId("branch-closed")).toHaveCount(0);
});

test("mahsulot rasmi: faqat https qabul qilinadi, vitrinada yuklanadi (CSP ruxsat beradi)", async ({ browser }) => {
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const owner = await login(browser, "90 777 66 06");
  await expect(owner).toHaveURL(/dokon-yaratish/);
  await owner.getByLabel("Do'kon nomi", { exact: true }).fill("Rasmli Bozor");
  await owner.getByLabel(/STIR/).fill("323456789");
  await owner.getByRole("button", { name: "Do'kon yaratish" }).click();
  await expect(owner).toHaveURL(/katalog/);
  await owner.getByLabel("Filial nomi").fill("Markaziy");
  await owner.getByLabel("Manzil", { exact: true }).fill("Toshkent, Chilonzor 1");
  await owner.getByRole("button", { name: "Filial qo'shish" }).click();
  await owner.getByRole("button", { name: "Mahsulot qo'shish" }).click();
  await owner.getByLabel("Nomi (o'zbekcha)").fill("Non");
  await owner.getByLabel("Narx, so'm").fill("5 000");
  await owner.getByLabel("Qoldiq (tanlangan filialda)").fill("20");
  await owner.getByLabel(/Rasm havolasi/).fill("http://cdn.example.uz/non.png");
  await owner.getByRole("button", { name: "Saqlash", exact: true }).click();
  await expect(owner.getByText("Faqat https:// bilan boshlanadigan havola")).toBeVisible();
  await owner.getByLabel(/Rasm havolasi/).fill("https://cdn.example.uz/non.png");
  await owner.getByRole("button", { name: "Saqlash", exact: true }).click();
  await expect(owner.getByTestId("product-row")).toHaveCount(1);

  const cust = await login(browser, "90 777 77 07");
  await cust.route("https://cdn.example.uz/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  await cust.goto("/d/rasmli-bozor");
  const img = cust.getByTestId("shop-product").locator("img");
  await expect(img).toHaveAttribute("src", "https://cdn.example.uz/non.png");
  await expect.poll(() => img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0)).toBe(true);
});

test("saqlangan manzillar: buyurtmadan keyin eslab qolinadi, keyingi safar avtomatik to'ldiriladi, o'chiriladi", async ({ browser }) => {
  const owner = await login(browser, "90 777 88 08");
  await expect(owner).toHaveURL(/dokon-yaratish/);
  await owner.getByLabel("Do'kon nomi", { exact: true }).fill("Manzilli Bozor");
  await owner.getByLabel(/STIR/).fill("423456789");
  await owner.getByRole("button", { name: "Do'kon yaratish" }).click();
  await expect(owner).toHaveURL(/katalog/);
  await owner.getByLabel("Filial nomi").fill("Markaziy");
  await owner.getByLabel("Manzil", { exact: true }).fill("Toshkent, Chilonzor 1");
  await owner.getByRole("button", { name: "Filial qo'shish" }).click();
  await owner.getByRole("button", { name: "Mahsulot qo'shish" }).click();
  await owner.getByLabel("Nomi (o'zbekcha)").fill("Non");
  await owner.getByLabel("Narx, so'm").fill("5 000");
  await owner.getByLabel("Qoldiq (tanlangan filialda)").fill("50");
  await owner.getByRole("button", { name: "Saqlash", exact: true }).click();
  await expect(owner.getByTestId("product-row")).toHaveCount(1);

  const cust = await login(browser, "90 777 99 09");
  const order = async () => {
    await cust.goto("/d/manzilli-bozor");
    await cust.getByTestId("shop-product").getByRole("button", { name: "Qo'shish" }).click();
    await cust.getByRole("button", { name: /Savatni ko'rish/ }).click();
  };
  await order();
  await expect(cust.getByTestId("saved-addresses")).toHaveCount(0);
  await cust.getByLabel("Manzil", { exact: true }).fill("Toshkent, Bobur 5");
  await cust.getByRole("button", { name: "Buyurtma berish" }).click();
  await expect(cust).toHaveURL(/buyurtma\//);

  await order();
  await expect(cust.getByTestId("saved-addresses")).toContainText("Toshkent, Bobur 5");
  await expect(cust.getByLabel("Manzil", { exact: true })).toHaveValue("Toshkent, Bobur 5");
  await cust.getByRole("button", { name: /o'chirish/ }).click();
  await expect(cust.getByTestId("saved-addresses")).toHaveCount(0);
});
