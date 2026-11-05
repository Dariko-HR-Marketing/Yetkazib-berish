import { expect, test, type Page } from "@playwright/test";
import { BTN_VERIFY, inviteToken, login, ownerFlow, smsCode, totp } from "./helpers";

/** Next.js marshrut e'lonchisi ham role=alert: uni chiqarib tashlaymiz. */
const alertOf = (p: Page) => p.locator('[role="alert"]:not(#__next-route-announcer__)');

test.use({ viewport: { width: 390, height: 800 } });

test.describe.configure({ mode: "serial" });

const OWNER = "+998901110001";

test("kirish: noto'g'ri raqam rad etiladi, kod 5 marta xato -> blok, to'g'ri kod bilan kirish", async ({ page, request }) => {
  await page.goto("/kirish");
  const send = page.getByRole("button", { name: "Kod yuborish" });
  await expect(send).toBeDisabled();
  await page.getByLabel("Telefon raqami").fill("90 12");
  await expect(send).toBeDisabled();

  const phone = "+998905550001";
  await page.getByLabel("Telefon raqami").fill(phone.slice(4));
  await send.click();
  await expect(page.getByText("raqamiga 6 xonali kod yuborildi")).toBeVisible();
  await expect(page.getByRole("button", { name: /Qayta yuborish: \d+ soniya/ })).toBeDisabled();

  const code = await smsCode(request, phone);
  const wrong = code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) {
    await page.getByLabel("SMS kod").fill(wrong);
    await page.getByRole("button", { name: BTN_VERIFY }).click();
    await expect(alertOf(page)).toContainText(/Kod noto'g'ri|akcept|oferta|Qolgan urinishlar/i);
  }
  await page.getByLabel("SMS kod").fill(code);
  await page.getByRole("button", { name: BTN_VERIFY }).click();
  await expect(alertOf(page)).toContainText("bloklandi"); // I-2: 6-urinishda blok
});

test("egasi: kirish -> do'kon yaratish (STIR xatosi) -> TOTP -> jamoa", async ({ page, request }) => {
  await login(page, request, OWNER);
  await expect(page).toHaveURL(/dokon-yaratish/);
  await page.getByLabel("Do'kon nomi").fill("Yashil Savat");
  await page.getByLabel(/STIR/).fill("12345678");
  await page.getByRole("button", { name: "Do'kon yaratish" }).click();
  await expect(alertOf(page)).toContainText("STIR 9 ta raqamdan iborat");
  await page.getByLabel(/STIR/).fill("123456789");
  await page.getByRole("button", { name: "Do'kon yaratish" }).click();
  await expect(page).toHaveURL(/xavfsizlik/);
  const secret = (await page.getByTestId("totp-secret").textContent())!.trim();
  await page.getByLabel("SMS kod").fill("000000");
  await page.getByRole("button", { name: BTN_VERIFY }).click();
  await expect(alertOf(page)).toContainText("Tasdiqlash kodi noto'g'ri");
  await page.getByLabel("SMS kod").fill(totp(secret));
  await page.getByRole("button", { name: BTN_VERIFY }).click();
  await expect(page).toHaveURL(/jamoa/);
  await expect(page.getByRole("heading", { name: "Jamoa" })).toBeVisible();
  await expect(page.getByText("Yashil Savat")).toBeVisible();
  await expect(page.getByText("Xodimlar: 1 / 3")).toBeVisible();
});

test("to'liq oqim bitta kontekstda: taklif -> qabul -> limit -> rol o'zgarishi -> paket va funksiyalar", async ({ page, request, browser }) => {
  const phone = "+998901110010";
  await ownerFlow(page, request, phone, "Limit Do'kon");

  // 1-taklif
  await page.locator("#inv-phone").fill("+998901110011");
  await page.locator("#inv-role").selectOption("picker");
  await page.getByRole("button", { name: "Taklif yuborish" }).click();
  await expect(page.getByText("Taklif yuborildi")).toBeVisible();
  await expect(page.getByText("Taklif kutilmoqda")).toBeVisible();
  await expect(page.getByText("Xodimlar: 2 / 3")).toBeVisible();

  // xodim SMS havolasi bilan kiradi va qabul qiladi (alohida brauzer konteksti)
  const staffCtx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const staff = await staffCtx.newPage();
  const token = await inviteToken(request, "+998901110011");
  await staff.goto(`/taklif/${token}`);
  await expect(staff).toHaveURL(/kirish/); // avval kirish; token eslab qolinadi
  await staff.getByLabel("Telefon raqami").fill("901110011");
  await staff.getByRole("button", { name: "Kod yuborish" }).click();
  await staff.getByLabel("SMS kod").fill(await smsCode(request, "+998901110011"));
  await staff.getByRole("button", { name: BTN_VERIFY }).click();
  await staff.getByRole("checkbox").first().check();
  await staff.getByRole("button", { name: BTN_VERIFY }).click();
  await expect(staff).toHaveURL(/jamoa/, { timeout: 15000 });
  // yig'uvchi a'zolar ro'yxatini ko'ra olmaydi (team:read yo'q)
  await expect(alertOf(staff)).toBeVisible();
  await staffCtx.close();

  // egasi: 2-taklif ketadi (egasi + 2 = 3), 3-taklif limitga uradi
  await page.reload();
  await page.locator("#inv-phone").fill("+998901110012");
  await page.getByRole("button", { name: "Taklif yuborish" }).click();
  await expect(page.getByText("Xodimlar: 3 / 3")).toBeVisible();
  await page.locator("#inv-phone").fill("+998901110013");
  await page.getByRole("button", { name: "Taklif yuborish" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Paket limiti to'ldi" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Paketni oshirish/ })).toBeVisible();

  // rol o'zgarishi (T-6)
  await page.locator("tbody select").nth(1).selectOption("cashier");
  await expect(page.getByText("Rol o'zgartirildi")).toBeVisible();

  // paket va funksiyalar
  await page.getByRole("link", { name: "Paket", exact: true }).click();
  await expect(page).toHaveURL(/paket/);
  await expect(page.getByRole("heading", { name: "Paket va funksiyalar", level: 1 })).toBeVisible();
  const mp = page.locator('[data-feature="catalog.marketplace_listing"]');
  await expect(mp.getByText("Biznes paketidan")).toBeVisible();
  await expect(mp.getByRole("switch")).toBeDisabled();
  const cash = page.locator('[data-feature="payment.cash"]');
  await expect(cash.getByRole("switch")).toBeChecked();
  // F-5: naqd yoqilgan — o'z kuryerlarini o'chirish rad etiladi
  await page.locator('[data-feature="delivery.own_couriers"]').getByRole("switch").click();
  await expect(page.getByRole("status").filter({ hasText: "payment.cash" })).toBeVisible();
  await expect(page.locator('[data-feature="delivery.own_couriers"]').getByRole("switch")).toBeChecked();
  // F-3: stock.visible o'chadi
  const stock = page.locator('[data-feature="stock.visible"]').getByRole("switch");
  await stock.click();
  await expect(stock).not.toBeChecked();
  await expect(page.locator('[data-feature="stock.visible"]')).toHaveAttribute("data-enabled", "false");
  // limitlar
  await expect(page.getByRole("progressbar", { name: "Xodim" })).toHaveAttribute("aria-valuenow", "3");
});

test("til almashtirish: ruscha matnlar va xato xabarlari", async ({ page }) => {
  await page.goto("/kirish");
  await page.getByRole("button", { name: "RU" }).click();
  await expect(page.getByRole("heading", { name: "Вход" })).toBeVisible();
  await expect(page.getByLabel("Номер телефона")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Вход" })).toBeVisible(); // tanlov saqlanadi
  await page.getByRole("button", { name: "UZ" }).click();
  await expect(page.getByRole("heading", { name: "Kirish" })).toBeVisible();
});

test("kirmagan foydalanuvchi himoyalangan sahifalardan /kirish ga yo'naltiriladi", async ({ page }) => {
  for (const p of ["/jamoa", "/paket", "/dokon-yaratish", "/xavfsizlik"]) {
    await page.goto(p);
    await expect(page).toHaveURL(/kirish/);
  }
});

test("tarmoq uzilganda xato ko'rsatiladi (oflayn holat)", async ({ page, context }) => {
  await page.goto("/kirish");
  await page.getByLabel("Telefon raqami").fill("901234567");
  await context.setOffline(true);
  await page.getByRole("button", { name: "Kod yuborish" }).click();
  await expect(alertOf(page)).toContainText("Internet aloqasi yo'q");
  await context.setOffline(false);
});

