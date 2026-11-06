import { expect, test } from "@playwright/test";

test("onlayn to'lov (sandbox): sozlash -> buyurtma -> to'lov -> qabul -> qaytarish", async ({ browser }) => {
  const octx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const owner = await octx.newPage();
  await owner.goto("/kirish");
  await owner.getByLabel("Telefon raqami").fill("90 888 11 01");
  await owner.getByRole("button", { name: "Kirish", exact: true }).click();
  await expect(owner).toHaveURL(/dokon-yaratish/);
  await owner.getByLabel("Do'kon nomi", { exact: true }).fill("Tolov Market");
  await owner.getByLabel(/STIR/).fill("123456789");
  await owner.getByRole("button", { name: "Do'kon yaratish" }).click();
  await expect(owner).toHaveURL(/katalog/);
  await owner.getByLabel("Filial nomi").fill("Markaziy");
  await owner.getByLabel("Manzil", { exact: true }).fill("Toshkent, Chilonzor 1");
  await owner.getByRole("button", { name: "Filial qo'shish" }).click();
  await owner.getByRole("button", { name: "Mahsulot qo'shish" }).click();
  await owner.getByLabel("Nomi (o'zbekcha)").fill("Non");
  await owner.getByLabel("Narx, so'm").fill("10 000");
  await owner.getByLabel("Qoldiq (tanlangan filialda)").fill("30");
  await owner.getByRole("button", { name: "Saqlash", exact: true }).click();
  await expect(owner.getByTestId("product-row")).toHaveCount(1);

  // egasi: onlayn to'lovni yoqadi
  await owner.goto("/paket");
  await owner.getByLabel("Webhook kaliti").fill("sandbox-secret-1234");
  await owner.getByLabel("Onlayn to'lovni yoqish").check();
  await owner.getByRole("button", { name: "Saqlash", exact: true }).last().click();
  await expect(owner.getByText("To'lov sozlamalari saqlandi")).toBeVisible();

  // xaridor
  const cctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const c = await cctx.newPage();
  await c.goto("/kirish");
  await c.getByLabel("Telefon raqami").fill("90 888 22 02");
  await c.getByRole("button", { name: "Kirish", exact: true }).click();
  await expect(c).toHaveURL(/dokon-yaratish/);
  await c.goto("/d/tolov-market");
  await c.getByTestId("shop-product").getByRole("button", { name: "Qo'shish" }).click();
  await c.getByRole("button", { name: /Savatni ko'rish/ }).click();
  await c.getByLabel("Onlayn (karta)").check();
  await c.getByLabel("Manzil", { exact: true }).fill("Toshkent, Bobur 5");
  await c.getByRole("button", { name: "Buyurtma berish" }).click();
  await expect(c).toHaveURL(/tolov\//); // sandbox to'lov sahifasi
  await expect(c.getByText("Sinov to'lov sahifasi")).toBeVisible();

  // to'lovgacha egasi qabul qila olmaydi
  await owner.goto("/buyurtmalar");
  const row = owner.getByTestId("order-row").first();
  await expect(row).toContainText("To'lov kutilmoqda");
  await row.getByRole("button", { name: "Qabul qilish" }).click();
  await expect(owner.getByText("Onlayn to'lov hali kelmagan")).toBeVisible();

  await c.getByRole("button", { name: "To'lash", exact: true }).click();
  await expect(c).toHaveURL(/buyurtma\//);
  await expect(c.getByTestId("order-payment")).toContainText("To'landi");

  await owner.goto("/buyurtmalar");
  const row2 = owner.getByTestId("order-row").first();
  await expect(row2).toContainText("To'langan");
  await row2.getByRole("button", { name: "Qabul qilish" }).click();
  await owner.getByRole("button", { name: /^Tasdiqlangan/ }).click();
  await owner.getByTestId("order-row").first().getByRole("button", { name: "Qaytarish", exact: true }).click();
  await expect(owner.getByText("Qaytarildi").first()).toBeVisible();
  await c.reload();
  await expect(c.getByTestId("order-payment")).toContainText("Qaytarildi");
  await cctx.close();
  await octx.close();
});
