import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import { describe, expect, it } from "vitest";
import { formatMoney, messages, t } from "../src";

function argNames(els: MessageFormatElement[]): string[] {
  const out: string[] = [];
  for (const e of els) {
    // 0 literal, 1 argument, 2 number, 3 date, 4 time, 5 select, 6 plural, 7 pound, 8 tag
    if (e.type === 0 || e.type === 7) continue;
    if ("value" in e && typeof e.value === "string") out.push(e.value);
    if ("options" in e) for (const o of Object.values(e.options)) out.push(...argNames(o.value));
  }
  return out;
}

describe("i18n", () => {
  it("uz va ru kalitlari bir xil (paritet)", () => {
    expect(Object.keys(messages.ru).sort()).toEqual(Object.keys(messages.uz).sort());
  });

  it("bo'sh qiymat yo'q; ICU sintaksisi to'g'ri; har ikki tilda bir xil o'zgaruvchilar", () => {
    for (const k of Object.keys(messages.uz)) {
      expect(messages.uz[k]!.trim(), k).not.toBe("");
      expect(messages.ru[k]!.trim(), k).not.toBe("");
      const vars = (s: string) => [...new Set(argNames(parse(s)))].sort();
      expect(vars(messages.ru[k]!), `${k}: o'zgaruvchilar`).toEqual(vars(messages.uz[k]!));
      const values = Object.fromEntries(vars(messages.uz[k]!).map((n) => [n, n === "resource" ? "staff" : ["limit", "used", "left", "seconds"].includes(n) ? 3 : "x"]));
      expect(() => t("uz", k, values), k).not.toThrow();
      expect(() => t("ru", k, values), k).not.toThrow();
    }
  });

  it("matnlarda kirill va lotin aralashmasligi (uz — faqat lotin, ru — kirill)", () => {
    for (const [k, v] of Object.entries(messages.uz)) expect(v, k).not.toMatch(/[Ѐ-ӿ]/);
    const brand = new Set(["Start", "Biznes", "Pro", "Tarmoq", "Dostavka", "Telegram", "SMS", "TOTP", "STIR", "POS/ERP", "Idempotency", "Key", "AI", "PIN", "MFA", "POS", "ERP"]);
    for (const [k, v] of Object.entries(messages.ru)) {
      const latinWords = (v.replace(/\{[^}]*\}/g, "").match(/[A-Za-z]+/g) ?? []).filter((w) => !brand.has(w) && !/^(select|plural|one|few|many|other|staff|branches)$/.test(w));
      expect(latinWords, `${k}: ruscha matnda lotin so'zlar`).toEqual([]);
    }
  });

  it("ICU: ko'plik shakllari (ru) va tanlov", () => {
    expect(t("ru", "plan.limit_reached", { limit: 3, resource: "staff", next_plan: "Biznes" })).toContain("3 сотрудника");
    expect(t("ru", "plan.limit_reached", { limit: 1, resource: "branches", next_plan: "Pro" })).toContain("1 филиал.");
    expect(t("ru", "plan.limit_reached", { limit: 5, resource: "staff", next_plan: "Pro" })).toContain("5 сотрудников");
    expect(t("uz", "plan.limit_reached", { limit: 3, resource: "staff", next_plan: "Biznes" })).toContain("3 ta xodim");
    expect(t("uz", "no.such.key")).toBe("no.such.key");
  });

  it("summa: butun tiyin -> '48 440 so'm' (float yo'q)", () => {
    expect(formatMoney("uz", 4_844_000)).toBe("48 440 so'm");
    expect(formatMoney("ru", 59_000_000)).toBe("590 000 сум");
    expect(formatMoney("uz", 0)).toBe("0 so'm");
    expect(formatMoney("uz", -150_000)).toBe("-1 500 so'm");
  });

  it("barcha funksiya kalitlari uchun nom bor", () => {
    const flags = JSON.parse(readFileSync(resolve(__dirname, "../../../infra/seed/feature_flags.json"), "utf8")) as { flags: { key: string }[] };
    for (const f of flags.flags) expect(messages.uz[`feature.${f.key}`], f.key).toBeTruthy();
  });
});
