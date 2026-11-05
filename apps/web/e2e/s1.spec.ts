import { expect, test, type Page } from "@playwright/test";
import { ownerFlow } from "./helpers";

test.describe.configure({ mode: "serial" });
let page: Page; // barcha testlar bitta kirgan egasi sessiyasida (ketma-ket)
test.beforeAll(async ({ browser, request }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  page = await ctx.newPage();
  await ownerFlow(page, request, OWNER);
});
test.afterAll(async () => { await page.context().close(); });

const OWNER = "+998903330001";
const alertOf = (p: Page) => p.locator('[role="alert"]:not(#__next-route-announcer__)');
const row = (p: Page, name: string) => p.getByTestId("product-row").filter({ hasText: name });

test("katalog: filial -> mahsulot (takroriy shtrix-kod rad etiladi) -> qoldiq -> «Tugadi» -> filtr", async () => {
  await page.getByRole("link", { name: "Katalog va qoldiq" }).click();
  await expect(page.getByText("Avval filial qo'shing")).toBeVisible();
  await page.getByLabel("Filial nomi").fill("Markaziy");
  await page.getByLabel("Manzil", { exact: true }).fill("Toshkent, Chilonzor 1");
  await page.getByRole("button", { name: "Filial qo'shish" }).click();
  await expect(page.getByText("Hali mahsulot yo'q")).toBeVisible();

  const add = async (name: string, price: string, extra: { barcode?: string; qty?: string } = {}) => {
    await page.getByRole("button", { name: "Mahsulot qo'shish" }).click();
    await page.getByLabel("Nomi (o'zbekcha)").fill(name);
    await page.getByLabel("Narx, so'm").fill(price);
    if (extra.barcode) await page.getByLabel("Shtrix-kod", { exact: true }).fill(extra.barcode);
    if (extra.qty) await page.getByLabel("Qoldiq (tanlangan filialda)").fill(extra.qty);
    await page.getByRole("button", { name: "Saqlash", exact: true }).click();
  };
  await add("Sut 3,2%", "12 500", { barcode: "4780000000001", qty: "22" });
  await expect(row(page, "Sut 3,2%")).toBeVisible();
  await expect(row(page, "Sut 3,2%")).toContainText("12 500");
  await expect(row(page, "Sut 3,2%").getByText("Bor", { exact: true })).toBeVisible();

  await add("Non", "4 000", { barcode: "4780000000001" });
  await expect(page.getByText("Bu shtrix-kodli mahsulot allaqachon bor")).toBeVisible();
  await page.getByLabel("Shtrix-kod", { exact: true }).fill("4780000000002");
  await page.getByRole("button", { name: "Saqlash", exact: true }).click();
  await expect(row(page, "Non")).toBeVisible();
  await expect(row(page, "Non").getByText("Tugadi", { exact: true }).first()).toBeVisible(); // qoldiq kiritilmagan

  // qoldiqni tahrirlash (kasr)
  const qty = page.getByLabel(/^Qoldiq: Non$/);
  await qty.fill("1,5");
  await row(page, "Non").getByRole("button", { name: "Saqlash" }).click();
  await expect(row(page, "Non").getByText("Kam qoldi")).toBeVisible();

  // «Tugadi deb belgilash» va qaytarish
  await row(page, "Sut 3,2%").getByRole("button", { name: "Tugadi deb belgilash" }).click();
  await expect(row(page, "Sut 3,2%").getByText("Tugadi", { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(row(page, "Sut 3,2%").getByText("Tugadi", { exact: true }).first()).toBeVisible(); // saqlangan
  await page.getByRole("button", { name: /^Tugagan/ }).click();
  await expect(page.getByTestId("product-row")).toHaveCount(1);
  await row(page, "Sut 3,2%").getByRole("button", { name: "Sotuvga qaytarish" }).click();
  await expect(page.getByText("Hech narsa topilmadi")).toBeVisible();

  // qidiruv
  await page.getByRole("button", { name: /^Hammasi/ }).click();
  await page.getByLabel("Nomi, artikul yoki shtrix-kod").fill("non");
  await expect(page.getByTestId("product-row")).toHaveCount(1);
  expect(await alertOf(page).count()).toBe(0);
});

test("import: ko'rib chiqish (hech narsa saqlanmaydi) -> xatolar -> tasdiqlash -> katalogda ko'rinadi; 30% narx sakrashi tasdiq talab qiladi", async () => {
  await page.goto("/import");
  const csv = ["nomi,narx,shtrix-kod,qoldiq", "Olma,9000,4780000000010,5", "Banan,xato,4780000000011,3", '"Sut 3,2%",20000,4780000000001,10'].join("\n");
  await page.locator("#import-file").setInputFiles({ name: "katalog.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
  const sum = page.getByTestId("import-summary");
  await expect(sum).toBeVisible();
  await expect(sum).toContainText("Yangi mahsulot");
  await expect(page.getByText("Narx noto'g'ri")).toBeVisible();
  await expect(page.getByText(/30% dan ko'p o'zgargan/).first()).toBeVisible();
  // hali saqlanmagan
  const apply = page.getByRole("button", { name: "Importni boshlash" });
  await apply.click();
  await expect(page.getByText(/Import yakunlandi: 1 ta yangi, 0 ta yangilandi/).first()).toBeVisible();
  await expect(page.getByText(/⚠ 2/)).toBeVisible(); // tarix: 2 xato (narx noto'g'ri + sakrash)

  await page.getByRole("link", { name: "Katalogga o'tish" }).click();
  await expect(row(page, "Olma")).toBeVisible();
  await expect(row(page, "Sut 3,2%")).toContainText("12 500"); // tasdiqsiz o'zgarmadi

  // tasdiq bilan
  await page.goto("/import");
  const csv2 = 'nomi,narx,shtrix-kod\n"Sut 3,2%",20000,4780000000001\n';
  await page.locator("#import-file").setInputFiles({ name: "narx.csv", mimeType: "text/csv", buffer: Buffer.from(csv2, "utf8") });
  await page.getByLabel(/30% dan ko'p o'zgargan 1 ta mahsulotni/).check();
  await page.getByRole("button", { name: "Importni boshlash" }).click();
  await expect(page.getByText(/Import yakunlandi: 0 ta yangi, 1 ta yangilandi/).first()).toBeVisible();
  await page.goto("/katalog");
  await expect(row(page, "Sut 3,2%")).toContainText("20 000");
});

test("rus tili: katalog va import matnlari", async () => {
  await page.goto("/katalog");
  await page.evaluate(() => { try { localStorage.setItem("dostavka.locale", "ru"); } catch { /* */ } });
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Каталог и остатки" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Заканчиваются/ })).toBeVisible();
  await page.goto("/import");
  await expect(page.getByRole("button", { name: "Скачать шаблон" })).toBeVisible();
});
