import { z } from "zod";
import { phoneSchema } from "../../common/validate";

export const tinSchema = z.string().regex(/^\d{9}$/, "validation.tin_invalid");
export const INVITE_ROLES = ["manager", "picker", "cashier", "dispatcher", "accountant", "marketer", "courier"] as const;
export const ALL_ROLES = ["owner", ...INVITE_ROLES] as const;

export const shopConsentDto = z.object({ document: z.enum(["shop_saas_offer", "shop_dpa"]), version: z.string().min(1).max(20) }).strict();
export const tenantCreateDto = z.object({ name: z.string().trim().min(2).max(120), tin: tinSchema, consents: z.array(shopConsentDto).max(4).optional() }).strict();
export const tenantUpdateDto = z.object({ name: z.string().trim().min(2).max(120).optional(), tin: tinSchema.optional(), status: z.literal("active").optional() }).strict();
export const branchCreateDto = z.object({
  name: z.string().trim().min(2).max(120), address: z.string().trim().min(3).max(300),
  lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional(),
}).strict();
export const inviteCreateDto = z.object({ phone: phoneSchema, role: z.enum(INVITE_ROLES) }).strict();
export const memberUpdateDto = z.object({ role: z.enum(ALL_ROLES).optional(), status: z.enum(["active", "suspended"]).optional() }).strict()
  .refine((v) => v.role !== undefined || v.status !== undefined, { message: "validation.failed" });
export const listQueryDto = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().optional() });
