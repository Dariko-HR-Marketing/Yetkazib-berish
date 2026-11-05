import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/** Sinov rejimi (OPEN_LOGIN=on) uchun alohida yurish: asosiy E2E rejim o'chiq holatda ishlaydi. */
const servers = (base.webServer as { env?: Record<string, string> }[]).map((s, i) => (i === 0 ? { ...s, env: { ...s.env, OPEN_LOGIN: "on" } } : s));
export default defineConfig({ ...base, testMatch: /open\.spec\.ts/, webServer: servers as typeof base.webServer });
