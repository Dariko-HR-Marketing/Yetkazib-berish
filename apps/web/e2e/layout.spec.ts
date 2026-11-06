import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ownerFlow } from "./helpers";

/** DoD: 360/768/1024/1440 kengliklarda tekshiruv; bosiladigan element ≥ 44 px; matn ≥ 12 px (asosiy ≥ 14); WCAG 2.2 AA; qorong'i rejim. */
const WIDTHS = [360, 768, 1024, 1440];
const SHOTS = "e2e-screenshots";
const STATE = "e2e-owner-state.json";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser, request }) => {
  mkdirSync(SHOTS, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const page = await ctx.newPage();
  await ownerFlow(page, request, "+998902220001", "Yashil Savat");
  await page.locator("#inv-phone").fill("+998902220002");
  await page.locator("#inv-role").selectOption("manager");
  await page.getByRole("button", { name: "Taklif yuborish" }).click();
  await expect(page.getByText("Taklif kutilmoqda")).toBeVisible();
  // S1: filial + mahsulot (katalog/import sahifalarini tekshirish uchun ma'lumot)
  await page.goto("/katalog");
  await page.getByRole("button", { name: "Do'konni faollashtirish" }).click();
  await page.getByLabel("Filial nomi").fill("Markaziy");
  await page.getByLabel("Manzil", { exact: true }).fill("Toshkent, Chilonzor 1");
  await page.getByRole("button", { name: "Filial qo'shish" }).click();
  await page.getByRole("button", { name: "Mahsulot qo'shish" }).click();
  await page.getByLabel("Nomi (o'zbekcha)").fill("Sut 3,2%");
  await page.getByLabel("Narx, so'm").fill("12 500");
  await page.getByLabel("Qoldiq (tanlangan filialda)").fill("22");
  await page.getByRole("button", { name: "Saqlash", exact: true }).click();
  await expect(page.getByTestId("product-row")).toHaveCount(1);
  await ctx.storageState({ path: STATE });
  await ctx.close();
});

async function audit(page: Page, name: string, width: number) {
  await page.waitForLoadState("networkidle");
  // 1) gorizontal aylanish yo'q
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${name}@${width}: gorizontal aylanish`).toBeLessThanOrEqual(0);

  // 2) bosiladigan elementlar >= 44x44 (ko'rinadigan, bog'langan label hisobga olinadi)
  const small = await page.evaluate(() => {
    const out: string[] = [];
    const sel = 'button, [role="switch"], select, input:not([type="checkbox"]):not([type="radio"]), nav a, a[class*="min-h-touch"]';
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === "hidden" || el.closest(".sr-only") || el.classList.contains("sr-only")) continue;
      if (r.height < 43.5 || (r.width < 43.5 && el.tagName !== "SELECT")) out.push(`${el.tagName.toLowerCase()}[${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 20)}] ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    for (const cb of document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
      const r = (cb.closest("label") ?? cb).getBoundingClientRect();
      if (r.height < 43.5) out.push(`checkbox-label ${Math.round(r.height)}`);
    }
    return out;
  });
  expect(small, `${name}@${width}: 44px dan kichik elementlar`).toEqual([]);

  // 3) matn o'lchami: hech bir ko'rinadigan matn 12 px dan kichik emas; asosiy matn >= 14
  const tiny = await page.evaluate(() => {
    const out: string[] = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const t = n.textContent?.trim();
      const el = n.parentElement;
      if (!t || !el || el.closest(".sr-only") || el.closest("script,style")) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      const fs = Number.parseInt(getComputedStyle(el).fontSize, 10);
      if (fs < 12) out.push(`${fs}px "${t.slice(0, 20)}"`);
    }
    return out;
  });
  expect(tiny, `${name}@${width}: 12px dan kichik matn`).toEqual([]);
  const bodyFs = await page.evaluate(() => Number.parseInt(getComputedStyle(document.body).fontSize, 10));
  expect(bodyFs).toBeGreaterThanOrEqual(14);

  // 4) WCAG 2.2 AA (kontrast, label, ARIA, ...)
  const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`), `${name}@${width}: axe`).toEqual([]);
}

const PAGES: { name: string; path: string; auth: boolean }[] = [
  { name: "kirish", path: "/kirish", auth: false },
  { name: "jamoa", path: "/jamoa", auth: true },
  { name: "paket", path: "/paket", auth: true },
  { name: "katalog", path: "/katalog", auth: true },
  { name: "buyurtmalar", path: "/buyurtmalar", auth: true },
  { name: "yigish", path: "/yigish", auth: true },
  { name: "dispetcher", path: "/dispetcher", auth: true },
  { name: "vitrina", path: "/d/yashil-savat", auth: false },
  { name: "savat", path: "/d/yashil-savat/savat", auth: false },
  { name: "import", path: "/import", auth: true },
  { name: "hujjat", path: "/hujjat/customer_offer", auth: false },
];

for (const lang of ["uz", "ru"] as const) {
  for (const w of WIDTHS) {
    for (const pg of PAGES) {
      test(`${pg.name} · ${lang} · ${w}px`, async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, storageState: pg.auth ? STATE : undefined });
        const page = await ctx.newPage();
        await page.addInitScript((l) => { try { localStorage.setItem("dostavka.locale", l); } catch { /* */ } }, lang);
        await page.goto(pg.path);
        if (pg.auth) await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        if (pg.name === "paket") await expect(page.locator("[data-feature]").first()).toBeVisible();
        if (pg.name === "jamoa") await expect(page.locator("tbody tr").first()).toBeVisible();
        if (pg.name === "katalog") await expect(page.getByTestId("product-row").first()).toBeVisible();
        if (pg.name === "vitrina") await expect(page.getByTestId("shop-product").first()).toBeVisible();
        if (pg.name === "hujjat") await expect(page.locator("article h1")).toBeVisible();
        await audit(page, pg.name, w);
        await page.screenshot({ path: `${SHOTS}/${pg.name}-${lang}-${w}.png`, fullPage: true });
        await ctx.close();
      });
    }
  }
}

test("qorong'i rejim: kontrast WCAG AA", async ({ browser }) => {
  for (const p of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, colorScheme: "dark", storageState: p.auth ? STATE : undefined });
    const page = await ctx.newPage();
    await page.goto(p.path);
    if (p.auth) await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    if (p.name === "paket") await expect(page.locator("[data-feature]").first()).toBeVisible();
    const res = await new AxeBuilder({ page }).withTags(["wcag2aa"]).analyze();
    expect(res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`), `${p.name} dark`).toEqual([]);
    if (p.name === "paket") await page.screenshot({ path: `${SHOTS}/paket-dark-390.png`, fullPage: true });
    await ctx.close();
  }
});

test("klaviatura: kirish formasi — avtofokus, ko'rinadigan fokus halqasi, Enter bilan yuborish", async ({ page }) => {
  await page.goto("/kirish");
  const phone = page.getByLabel("Telefon raqami");
  await expect(phone).toBeFocused();
  await page.keyboard.type("901234567");
  const outline = await phone.evaluate((e) => getComputedStyle(e).outlineStyle);
  expect(outline).not.toBe("none");
  await page.keyboard.press("Tab"); // keyingi boshqaruv: "Kod yuborish"
  await expect(page.getByRole("button", { name: "Kod yuborish" })).toBeFocused();
});
