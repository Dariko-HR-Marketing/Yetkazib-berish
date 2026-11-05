import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { BOT_TOKEN } from "../playwright.config";

/** I-3 va "Telegram ichida: mavzu, MainButton, BackButton, safe area" — Telegram.WebApp soxta obyekt bilan. */
function initData(userId: number, authDate = Math.floor(Date.now() / 1000), lang = "ru"): string {
  const params: Record<string, string> = { auth_date: String(authDate), query_id: "AAH-e2e", user: JSON.stringify({ id: userId, language_code: lang, first_name: "X" }) };
  const check = Object.entries(params).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join("\n");
  const hash = createHmac("sha256", createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest()).update(check).digest("hex");
  return new URLSearchParams({ ...params, hash }).toString();
}

const MOCK = `
  (() => {
    const calls = [];
    const listeners = {};
    let mainCb = null, backCb = null;
    window.__tg = { calls, main: () => mainCb && mainCb(), back: () => backCb && backCb() };
    window.Telegram = { WebApp: {
      initData: window.__INIT, colorScheme: 'dark',
      themeParams: { bg_color: '#0e1621', secondary_bg_color: '#17212b', text_color: '#f5f5f5', hint_color: '#9fb4c9', button_color: '#2481cc', button_text_color: '#ffffff' },
      contentSafeAreaInset: { top: 24, bottom: 18 },
      initDataUnsafe: { user: { language_code: 'ru' } },
      ready() { calls.push('ready'); }, expand() { calls.push('expand'); },
      onEvent(e, cb) { listeners[e] = cb; }, offEvent() {},
      BackButton: { show() { calls.push('back:show'); }, hide() { calls.push('back:hide'); }, onClick(cb) { backCb = cb; }, offClick() { backCb = null; } },
      MainButton: { setText(t) { calls.push('main:text:' + t); }, show() { calls.push('main:show'); }, hide() { calls.push('main:hide'); }, enable() {}, disable() { calls.push('main:disable'); }, showProgress() {}, hideProgress() {},
        onClick(cb) { mainCb = cb; }, offClick() { mainCb = null; } },
    } };
  })();
`;

test.use({ viewport: { width: 390, height: 780 } });

// Haqiqiy telegram-web-app.js tarmoqdan yuklanmasin: u soxta obyektni almashtirib yuborardi.
test.beforeEach(async ({ page }) => { await page.route("https://telegram.org/**", (r) => r.abort()); });

test("Telegram: initData bilan avtomatik kirish, rozilik, MainButton, mavzu, xavfsiz hudud, rus tili", async ({ page }) => {
  await page.addInitScript(`window.__INIT = ${JSON.stringify(initData(880001))};`);
  await page.addInitScript(MOCK);
  await page.goto("/kirish");

  // yangi foydalanuvchi: rozilik so'raladi (I-4)
  await expect(page.getByRole("heading", { name: "Вход" })).toBeVisible(); // tg til = ru
  await expect(page.getByRole("checkbox").first()).toBeVisible();
  // mavzu va safe area qo'llangan
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--c-brand").trim())).toBe("#2481cc");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--safe-bottom").trim())).toBe("18px");
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  const calls = () => page.evaluate(() => (window as unknown as { __tg: { calls: string[] } }).__tg.calls);
  expect(await calls()).toEqual(expect.arrayContaining(["ready", "expand", "main:show", "back:hide"]));
  // sahifada ikkinchi tugma yo'q (MainButton ishlatiladi)
  await expect(page.getByRole("button", { name: "Подтвердить" })).toHaveClass(/sr-only/);

  await page.getByRole("checkbox").first().check();
  await page.evaluate(() => (window as unknown as { __tg: { main(): void } }).__tg.main()); // MainButton bosildi
  await expect(page).toHaveURL(/dokon-yaratish/);
  await expect.poll(calls).toContain("main:text:Создать магазин");
});

test("Telegram: 24 soatdan eski initData rad etiladi (xabar ruscha)", async ({ page }) => {
  await page.addInitScript(`window.__INIT = ${JSON.stringify(initData(880002, Math.floor(Date.now() / 1000) - 25 * 3600))};`);
  await page.addInitScript(MOCK);
  await page.goto("/kirish");
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("устарели"); // auth.telegram_expired (ru)
  await expect(page).toHaveURL(/kirish/);
});

test("brauzerda (Telegram'siz) oddiy tugma ishlaydi, MainButton chaqirilmaydi", async ({ page }) => {
  await page.goto("/kirish");
  await expect(page.getByRole("button", { name: "Kod yuborish" })).not.toHaveClass(/sr-only/);
  expect(await page.evaluate(() => "Telegram" in window && Boolean((window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData))).toBe(false);
});
