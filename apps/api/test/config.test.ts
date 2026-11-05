import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

describe("config", () => {
  it("productionda dev sirlar bilan ishga tushmaydi", () => {
    expect(() => loadConfig({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toThrow(/JWT_SECRET/);
  });
  it("productionda DEV_SMS_INBOX yoqilmaydi", () => {
    const env = { NODE_ENV: "production", JWT_SECRET: "x".repeat(40), DATA_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"), PHONE_HASH_PEPPER: "prod-pepper-0123456789", TELEGRAM_BOT_TOKEN: "1:abc", DEV_SMS_INBOX: "on" } as NodeJS.ProcessEnv;
    expect(() => loadConfig(env)).toThrow(/DEV_SMS_INBOX/);
    expect(loadConfig({ ...env, DEV_SMS_INBOX: "off" } as NodeJS.ProcessEnv).NODE_ENV).toBe("production");
  });
  it("shifrlash kaliti 32 bayt bo'lishi shart", () => {
    expect(() => loadConfig({ DATA_ENCRYPTION_KEY: Buffer.alloc(8).toString("base64") } as NodeJS.ProcessEnv)).toThrow(/32 bayt/);
  });
});
