import { z } from "zod";
import { uuidSchema } from "../../common/validate";

export const orderItemDto = z.object({ product_id: uuidSchema, quantity_milli: z.number().int().min(1).max(1_000_000_000) }).strict();
export const orderCreateDto = z.object({
  branch_id: uuidSchema,
  items: z.array(orderItemDto).min(1).max(50),
  fulfillment: z.enum(["delivery", "pickup"]),
  delivery_address: z.string().trim().min(5).max(300).optional(),
  note: z.string().trim().max(300).optional(),
  payment_type: z.enum(["cash", "online"]).default("cash"),
  channel: z.enum(["vitrina", "telegram"]).default("vitrina"),
  points_to_use: z.number().int().min(0).max(10_000_000).default(0),
}).strict().refine((v) => v.fulfillment === "pickup" || !!v.delivery_address, { message: "validation.failed", path: ["delivery_address"] });

export const shopProductsDto = z.object({
  branch_id: uuidSchema.optional(), q: z.string().trim().max(100).optional(), category_id: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(60).default(30), cursor: z.string().optional(),
});
export const orderListDto = z.object({
  status: z.enum(["placed", "accepted", "picking", "ready", "delivering", "completed", "cancelled", "failed"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30), cursor: z.string().optional(),
});
export const orderStatusDto = z.object({ status: z.enum(["accepted", "completed", "cancelled"]), reason: z.string().trim().max(200).optional() }).strict();
export const cancelDto = z.object({ reason: z.string().trim().max(200).optional() }).strict();

export const deliverySettingsDto = z.object({
  fee_tiyin: z.number().int().min(0).max(100_000_000),
  free_from_tiyin: z.number().int().min(0).max(100_000_000_000).nullable(),
  min_order_tiyin: z.number().int().min(0).max(100_000_000_000),
}).strict();
