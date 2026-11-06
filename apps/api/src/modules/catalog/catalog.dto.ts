import { z } from "zod";
import { uuidSchema } from "../../common/validate";

export const UNITS = ["piece", "kg", "l"] as const;
export const STATUSES = ["active", "hidden", "archived"] as const;
const text = (max: number) => z.string().trim().min(1).max(max);
const opt = (max: number) => z.string().trim().max(max).transform((s) => (s === "" ? null : s)).nullable().optional();

export const categoryCreateDto = z.object({ name_uz: text(120), name_ru: opt(120), sort: z.number().int().min(0).max(100000).optional() }).strict();
export const categoryUpdateDto = z.object({ name_uz: text(120).optional(), name_ru: opt(120), sort: z.number().int().min(0).max(100000).optional() }).strict()
  .refine((v) => Object.keys(v).length > 0, { message: "validation.failed" });

const barcode = z.string().regex(/^[0-9]{6,14}$/, "validation.barcode_invalid");
const mxik = z.string().regex(/^[0-9]{17}$/, "validation.mxik_invalid");
const price = z.number().int().min(0).max(100_000_000_000);

/** Rasm havolasi: faqat https, hisob ma'lumotisiz (user:pass@), ≤ 500 belgi. Fayl yuklash yo'q (v1): do'kon o'z CDN/xostingiga havola beradi. */
export const imageUrl = z.string().trim().max(500).refine((v) => {
  try { const u = new URL(v); return u.protocol === "https:" && !u.username && !u.password && u.hostname.includes("."); } catch { return false; }
}, { message: "faqat https havola" }).nullable().optional();

export const productCreateDto = z.object({
  name_uz: text(200), name_ru: opt(200), sku: z.string().trim().min(1).max(64).nullable().optional(),
  barcode: barcode.nullable().optional(), mxik: mxik.nullable().optional(), unit: z.enum(UNITS).default("piece"),
  price_tiyin: price, category_id: uuidSchema.nullable().optional(), status: z.enum(["active", "hidden"]).default("active"),
  description_uz: opt(2000), description_ru: opt(2000), image_url: imageUrl,
}).strict();
export const productUpdateDto = z.object({
  name_uz: text(200).optional(), name_ru: opt(200), sku: z.string().trim().min(1).max(64).nullable().optional(),
  barcode: barcode.nullable().optional(), mxik: mxik.nullable().optional(), unit: z.enum(UNITS).optional(),
  price_tiyin: price.optional(), category_id: uuidSchema.nullable().optional(), status: z.enum(STATUSES).optional(),
  description_uz: opt(2000), description_ru: opt(2000), image_url: imageUrl,
}).strict().refine((v) => Object.keys(v).length > 0, { message: "validation.failed" });

export const productListDto = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().optional(),
  q: z.string().trim().max(100).optional(), category_id: uuidSchema.optional(),
  status: z.enum(STATUSES).optional(), branch_id: uuidSchema.optional(), stock: z.enum(["out", "low", "in"]).optional(),
  mxik: z.enum(["missing"]).optional(),
});

const qty = z.number().int().min(0).max(1_000_000_000_000);
export const stockSetDto = z.object({ branch_id: uuidSchema, quantity_milli: qty, note: z.string().trim().max(200).optional() }).strict();
export const stockAdjustDto = z.object({ branch_id: uuidSchema, delta_milli: z.number().int().min(-1_000_000_000_000).max(1_000_000_000_000).refine((n) => n !== 0, { message: "validation.failed" }), note: z.string().trim().max(200).optional() }).strict();
export const stockOutDto = z.object({ branch_id: uuidSchema, out: z.boolean() }).strict();

export const IMPORT_MAX_ROWS = 5000;
export const IMPORT_MAX_BYTES = 8 * 1024 * 1024;
export const importDto = z.object({
  format: z.enum(["csv", "xlsx"]),
  content_base64: z.string().min(4).max(Math.ceil(IMPORT_MAX_BYTES * 1.4)),
  mode: z.enum(["preview", "apply"]),
  branch_id: uuidSchema.optional(),
  confirm_price_jumps: z.boolean().default(false),
}).strict();
