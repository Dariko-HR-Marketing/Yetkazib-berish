import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { Secret, TOTP } from "otpauth";
import { API_URL } from "../playwright.config";

export const totp = (secret: string, offsetSec = 0) =>
  new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30 }).generate({ timestamp: Date.now() + offsetSec * 1000 });

export async function smsCode(request: APIRequestContext, phone: string): Promise<string> {
  for (let i = 0; i < 25; i++) {
    const r = await request.get(`${API_URL}/v1/_dev/sms`, { params: { phone } });
    const items = ((await r.json()) as { items: { text: string }[] }).items;
    const m = [...items].reverse().map((x) => x.text.match(/kodi (\d{6})/)).find(Boolean);
    if (m) return m[1]!;
    await new Promise((res) => setTimeout(res, 200));
  }
  throw new Error("SMS kod kelmadi");
}

export async function inviteToken(request: APIRequestContext, phone: string): Promise<string> {
  const r = await request.get(`${API_URL}/v1/_dev/sms`, { params: { phone } });
  const items = ((await r.json()) as { items: { text: string }[] }).items;
  const m = [...items].reverse().map((x) => x.text.match(/\/taklif\/([\w-]+)/)).find(Boolean);
  if (!m) throw new Error("taklif havolasi yo'q");
  return m[1]!;
}

export const BTN_VERIFY = /^(Tasdiqlash|Подтвердить)$/;

/** SMS orqali kirish; yangi foydalanuvchi uchun rozilik belgilanadi. */
export async function login(page: Page, request: APIRequestContext, phone: string) {
  await page.goto("/kirish");
  await page.getByLabel(/Telefon raqami|Номер телефона/).fill(phone.slice(4));
  await page.getByRole("button", { name: /Kod yuborish|Отправить код/ }).click();
  const code = await smsCode(request, phone);
  await page.getByLabel(/SMS kod|Код из SMS/).fill(code);
  await page.getByRole("button", { name: BTN_VERIFY }).click();
  const consent = page.getByRole("checkbox").first();
  if (await consent.waitFor({ state: "visible", timeout: 4000 }).then(() => true, () => false)) {
    await consent.check();
    await page.getByRole("button", { name: BTN_VERIFY }).click();
  }
}

/** Egasi: kirish + do'kon + TOTP. Qaytaradi: TOTP kaliti. */
export async function ownerFlow(page: Page, request: APIRequestContext, phone: string, name = "Yashil Savat"): Promise<string> {
  await login(page, request, phone);
  await expect(page).toHaveURL(/dokon-yaratish/);
  await page.getByLabel(/Do'kon nomi|Название магазина/).fill(name);
  await page.getByLabel(/STIR|ИНН/).fill("123456789");
  await page.getByRole("button", { name: /Do'kon yaratish|Создать магазин/ }).click();
  await expect(page).toHaveURL(/xavfsizlik/);
  const secret = (await page.getByTestId("totp-secret").textContent())!.trim();
  await page.getByLabel(/SMS kod|Код из SMS/).fill(totp(secret));
  await page.getByRole("button", { name: BTN_VERIFY }).click();
  await expect(page).toHaveURL(/jamoa/);
  return secret;
}
