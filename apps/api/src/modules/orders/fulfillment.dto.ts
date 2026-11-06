import { z } from "zod";
import { uuidSchema } from "../../common/validate";

export const pickItemDto = z.object({ status: z.enum(["picked", "missing", "pending"]), picked_milli: z.number().int().min(0).max(1_000_000_000).optional() }).strict();
export const assignDto = z.object({ courier_user_id: uuidSchema }).strict();
export const failDto = z.object({ reason: z.string().trim().min(2).max(200) }).strict();
export const locationDto = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), accuracy_m: z.number().int().min(0).max(100000).optional() }).strict();
