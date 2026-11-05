import { z } from "zod";

const DEV_JWT = "dev-only-jwt-secret-change-me-0123456789abcdef";
const DEV_ENC_KEY = Buffer.alloc(32, 7).toString("base64");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(4000),
  /** Migratsiyalar va seed uchun (egasi roli). */
  DATABASE_URL: z.string().default("postgresql://dostavka:dostavka@127.0.0.1:5432/dostavka"),
  /** Ilova uchun (dostavka_app roli: BYPASSRLS yo'q). */
  APP_DATABASE_URL: z.string().default("postgresql://dostavka_app:dostavka_app@127.0.0.1:5432/dostavka"),
  APP_DB_PASSWORD: z.string().default("dostavka_app"),
  REDIS_URL: z.string().default("redis://127.0.0.1:6379/0"),
  JWT_SECRET: z.string().min(32).default(DEV_JWT),
  /** 32 bayt, base64. TOTP kalitlarini shifrlash uchun. */
  DATA_ENCRYPTION_KEY: z.string().default(DEV_ENC_KEY),
  /** Telefon xeshi (hodisalarda) uchun maxfiy qo'shimcha. */
  PHONE_HASH_PEPPER: z.string().min(16).default("dev-pepper-0123456789"),
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  SMS_PROVIDER: z.enum(["mock"]).default("mock"),
  APP_BASE_URL: z.string().default("http://localhost:3000"),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  EVENTS_DISPATCH: z.enum(["on", "off"]).default("off"),
  /** Faqat dev/e2e: mock SMS qutisini HTTP orqali o'qish. Productionda yoqib bo'lmaydi. */
  DEV_SMS_INBOX: z.enum(["on", "off"]).default("off"),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const cfg = schema.parse(env);
  if (cfg.NODE_ENV === "production") {
    // CLAUDE.md §9: haqiqiy sir repoda yo'q; productionda dev qiymatlar bilan ishga tushmaydi.
    if (cfg.JWT_SECRET === DEV_JWT || cfg.DATA_ENCRYPTION_KEY === DEV_ENC_KEY || cfg.PHONE_HASH_PEPPER.startsWith("dev-")) {
      throw new Error("Production uchun JWT_SECRET, DATA_ENCRYPTION_KEY va PHONE_HASH_PEPPER o'rnatilishi shart");
    }
    if (cfg.DEV_SMS_INBOX === "on") throw new Error("Production'da DEV_SMS_INBOX yoqilmaydi");
    if (!cfg.TELEGRAM_BOT_TOKEN) throw new Error("Production uchun TELEGRAM_BOT_TOKEN kerak");
  }
  if (Buffer.from(cfg.DATA_ENCRYPTION_KEY, "base64").length !== 32) throw new Error("DATA_ENCRYPTION_KEY 32 bayt (base64) bo'lishi kerak");
  return cfg;
}

export const CONFIG = Symbol("CONFIG");
