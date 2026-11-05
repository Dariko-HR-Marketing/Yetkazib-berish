import { defineConfig } from "@playwright/test";

const API_PORT = 4010;
const WEB_PORT = 3010;
const DB = process.env.E2E_DATABASE_URL ?? "postgresql://dostavka:dostavka@127.0.0.1:5432/dostavka_e2e";
const APP_DB = process.env.E2E_APP_DATABASE_URL ?? "postgresql://dostavka_app:dostavka_app@127.0.0.1:5432/dostavka_e2e";
const REDIS = process.env.E2E_REDIS_URL ?? "redis://127.0.0.1:6379/14";
export const BOT_TOKEN = "123456:E2E-BOT-TOKEN";
export const API_URL = `http://127.0.0.1:${API_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node ../api/dist/main.js",
      url: `${API_URL}/v1/_dev/sms`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NODE_ENV: "development",
        PORT: String(API_PORT),
        DATABASE_URL: DB,
        APP_DATABASE_URL: APP_DB,
        REDIS_URL: REDIS,
        DEV_SMS_INBOX: "on",
        TELEGRAM_BOT_TOKEN: BOT_TOKEN,
        CORS_ORIGINS: `http://127.0.0.1:${WEB_PORT}`,
        EVENTS_DISPATCH: "off",
      },
    },
    {
      command: `pnpm exec next build && pnpm exec next start -p ${WEB_PORT}`,
      url: `http://127.0.0.1:${WEB_PORT}/kirish`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: { API_URL, NEXT_DIST_DIR: ".next-e2e" },
    },
  ],
});
