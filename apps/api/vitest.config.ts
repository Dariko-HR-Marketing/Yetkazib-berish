import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" }, jsc: { parser: { syntax: "typescript", decorators: true }, transform: { legacyDecorator: true, decoratorMetadata: true }, target: "es2022" } })],
  test: {
    globals: false,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://dostavka:dostavka@127.0.0.1:5432/dostavka_test",
      APP_DATABASE_URL: process.env.TEST_APP_DATABASE_URL ?? "postgresql://dostavka_app:dostavka_app@127.0.0.1:5432/dostavka_test",
      REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379/15",
      TELEGRAM_BOT_TOKEN: "123456:TEST-BOT-TOKEN",
      OPEN_LOGIN: "off", // standart testlar to'liq SMS/TOTP oqimini tekshiradi; soddalashtirilgan kirish open-login.test.ts da
      // Testlar bir IP'dan minglab so'rov yuboradi; chegara alohida testda pasaytiriladi.
      RATE_LIMIT_AUTH_PER_MIN: "1000000",
      RATE_LIMIT_API_PER_MIN: "1000000",
      JWT_SECRET: "test-jwt-secret-0123456789abcdef0123456789",
    },
    environment: "node",
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    setupFiles: ["test/setup.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
