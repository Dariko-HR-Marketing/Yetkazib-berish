import { IntlMessageFormat } from "intl-messageformat";
import uz from "./uz.json";
import ru from "./ru.json";

export const LOCALES = ["uz", "ru"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "uz";

export const messages: Record<Locale, Record<string, string>> = { uz, ru };

const cache = new Map<string, IntlMessageFormat>();

/** ICU formatda xabarni qaytaradi; kalit topilmasa kalitning o'zi (test buni ushlaydi). */
export function t(locale: Locale, key: string, values: Record<string, string | number> = {}): string {
  const raw = messages[locale][key];
  if (raw === undefined) return key;
  const ck = `${locale}:${key}`;
  let f = cache.get(ck);
  if (!f) {
    f = new IntlMessageFormat(raw, locale === "uz" ? "uz-Latn" : "ru");
    cache.set(ck, f);
  }
  return String(f.format(values));
}

export function isLocale(v: unknown): v is Locale {
  return v === "uz" || v === "ru";
}

/** Summa: tiyin (butun son) -> "48 440 so'm" / "48 440 сум". Float ishlatilmaydi. */
export function formatMoney(locale: Locale, tiyin: number): string {
  const som = Math.trunc(tiyin / 100);
  const s = String(Math.abs(som)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${som < 0 ? "-" : ""}${s} ${locale === "uz" ? "so'm" : "сум"}`;
}
