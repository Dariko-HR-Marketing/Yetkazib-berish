import { z, ZodError, type ZodTypeAny } from "zod";
import { ApiError } from "./errors";

export const PHONE_RE = /^\+998\d{9}$/;

/** Telefon: bo'shliq/tire olib tashlanadi; faqat +998XXXXXXXXX. */
export const phoneSchema = z
  .string()
  .transform((s) => s.replace(/[\s()-]/g, ""))
  .refine((s) => PHONE_RE.test(s), { message: "validation.phone_invalid" });

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  throw zodToApiError(r.error);
}

export function zodToApiError(e: ZodError): ApiError {
  const issues = e.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
  // Maxsus kodli xatolar (masalan, validation.tin_invalid) umumiy kod o'rniga qaytariladi.
  const special = issues.find((i) => i.message.startsWith("validation."));
  return new ApiError(400, special ? special.message : "validation.failed", { issues });
}

export const uuidSchema = z.string().uuid();
