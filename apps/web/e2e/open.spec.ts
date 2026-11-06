import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 800 } });

test("sinov rejimi: faqat telefon bilan kirish, do'kon yaratish — SMS, TOTP va rozilik so'ralmaydi", async ({ page }) => {
  await page.goto("/kirish");
  await expect(page.getByLabel("SMS kod")).toHaveCount(0);
  await expect(page.getByLabel("SMS kod")).toHaveCount(0);
  await page.getByLabel("Telefon raqami").fill("90 444 55 66");
  await page.getByRole("button", { name: "Kirish", exact: true }).click();
  await expect(page).toHaveURL(/dokon-yaratish/);
  await expect(page.getByRole("checkbox")).toHaveCount(0); // oferta akcepti so'ralmaydi
  await page.getByLabel("Do'kon nomi", { exact: true }).fill("Sinov Do'kon");
  await page.getByLabel(/STIR/).fill("123456789");
  await page.getByRole("button", { name: "Do'kon yaratish" }).click();
  await expect(page).toHaveURL(/katalog/); // TOTP bosqichisiz
  await page.getByLabel("Filial nomi").fill("Markaziy");
  await page.getByLabel("Manzil", { exact: true }).fill("Toshkent, Chilonzor 1");
  await page.getByRole("button", { name: "Filial qo'shish" }).click();
  await expect(page.getByText("Hali mahsulot yo'q")).toBeVisible();
  await page.getByRole("link", { name: "Jamoa" }).click();
  await expect(page.getByRole("heading", { name: "Jamoa" })).toBeVisible();
  // chiqib qayta kirish: bir xil hisob
  await page.getByRole("button", { name: "Chiqish" }).click();
  await expect(page).toHaveURL(/kirish/);
  await expect(page.getByLabel("SMS kod")).toHaveCount(0);
  await expect(async () => { // gidratatsiya poygasi: qiymat saqlanmaguncha qayta urinadi
    await page.getByLabel("Telefon raqami").fill("90 444 55 66");
    await expect(page.getByRole("button", { name: "Kirish", exact: true })).toBeEnabled({ timeout: 1000 });
  }).toPass();
  await page.getByRole("button", { name: "Kirish", exact: true }).click();
  await expect(page).toHaveURL(/katalog/);
});
