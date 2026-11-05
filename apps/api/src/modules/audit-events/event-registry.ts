import { z } from "zod";

/**
 * Hodisalar lug'ati (docs/05_spetsifikatsiya_json/events.json bilan mos; test tekshiradi).
 * Har hodisa — qat'iy sxema (noma'lum maydon rad etiladi). Shaxsiy ma'lumot (telefon, ism, manzil) yo'q: faqat ID va xeshlar (A-3).
 */
const id = z.string().min(1).max(64);
const int = z.number().int();
const tiyin = z.number().int();
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const method = z.enum(["sms", "telegram"]);
const consent = z.object({ document: z.string(), version: z.string(), channel: z.enum(["sms", "telegram", "panel"]) }).strict();

export const EVENT_SCHEMAS = {
  "auth.signed_up": z.object({ method }).strict(),
  "auth.signed_in": z.object({ method }).strict(),
  "auth.otp_locked": z.object({ phone_hash: hash }).strict(),
  "consent.accepted": consent,
  "consent.revoked": consent,
  "store.viewed": z.object({ store_id: id }).strict(),
  "product.viewed": z.object({ product_id: id, position: int.nonnegative() }).strict(),
  "search.performed": z.object({ query: z.string().max(100), results_count: int.nonnegative() }).strict(),
  "cart.item_added": z.object({ product_id: id, quantity: int.positive(), price_tiyin: tiyin }).strict(),
  "cart.item_removed": z.object({ product_id: id, quantity: int.positive() }).strict(),
  "checkout.started": z.object({ amount_tiyin: tiyin, slot: z.string().max(40).optional() }).strict(),
  "order.placed": z.object({ order_id: id, amount_tiyin: tiyin, payment_type: z.string().max(20), channel: z.string().max(20) }).strict(),
  "payment.authorized": z.object({ provider: z.string().max(20), amount_tiyin: tiyin }).strict(),
  "payment.captured": z.object({ provider: z.string().max(20), amount_tiyin: tiyin }).strict(),
  "payment.failed": z.object({ provider: z.string().max(20), amount_tiyin: tiyin, reason: z.string().max(60) }).strict(),
  "payment.refunded": z.object({ provider: z.string().max(20), amount_tiyin: tiyin, reason: z.string().max(60) }).strict(),
  "order.picked": z.object({ substitutions: int.nonnegative(), out_of_stock: int.nonnegative() }).strict(),
  "delivery.channel_selected": z.object({ channel: z.enum(["own", "pool", "third_party"]), price_tiyin: tiyin, attempt: int.positive() }).strict(),
  "delivery.offer_accepted": z.object({ courier_id: id, wait_seconds: int.nonnegative() }).strict(),
  "delivery.offer_expired": z.object({ courier_id: id, wait_seconds: int.nonnegative() }).strict(),
  "order.delivered": z.object({ duration_seconds: int.nonnegative() }).strict(),
  "order.failed": z.object({ reason: z.string().max(60) }).strict(),
  "stock.out_marked": z.object({ product_id: id, branch_id: id }).strict(),
  "points.earned": z.object({ points: int, order_id: id.optional() }).strict(),
  "points.spent": z.object({ points: int, order_id: id.optional() }).strict(),
  "points.expired": z.object({ points: int }).strict(),
  "review.submitted": z.object({ target: z.enum(["shop", "courier"]), rating: int.min(1).max(5) }).strict(),
  "feature.toggled": z.object({ key: z.string().max(60), old: z.boolean(), new: z.boolean() }).strict(),
  "plan.changed": z.object({ old: z.string().max(40), new: z.string().max(40), migrate_at: z.string().optional() }).strict(),
  "ai.request": z.object({ service: z.string().max(40), tokens: int.nonnegative(), result: z.string().max(20) }).strict(),
} as const;

export type EventName = keyof typeof EVENT_SCHEMAS;
export const EVENT_SOURCES = ["vitrina", "katalog", "telegram", "agent", "panel", "kuryer"] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

/** A-3: kalit nomlari va qiymatlarida shaxsiy ma'lumot izlari. */
const PII_KEYS = /(phone|telefon|address|manzil|full_?name|first_?name|last_?name|ism|email|passport|lat|lng|card|pan)$/i;
const PHONE_VALUE = /\+?998[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/;
const CARD_VALUE = /\b\d{13,19}\b/;

export function findPii(value: unknown, path = ""): string | null {
  if (typeof value === "string") return PHONE_VALUE.test(value) || CARD_VALUE.test(value) ? path || "(qiymat)" : null;
  if (Array.isArray(value)) return value.map((v, i) => findPii(v, `${path}[${i}]`)).find(Boolean) ?? null;
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (PII_KEYS.test(k)) return `${path}.${k}`;
      const f = findPii(v, `${path}.${k}`);
      if (f) return f;
    }
  }
  return null;
}
