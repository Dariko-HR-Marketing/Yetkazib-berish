import { z } from "zod";
import { phoneSchema } from "../../common/validate";

const consentInput = z.object({ document: z.enum(["customer_offer", "privacy_policy"]), version: z.string() }).strict();
const code6 = z.string().regex(/^\d{6}$/, "validation.failed");

export const otpRequestDto = z.object({ phone: phoneSchema }).strict();
export const otpVerifyDto = z.object({ phone: phoneSchema, code: code6, consents: z.array(consentInput).optional(), marketing_consent: z.boolean().optional() }).strict();
export const telegramDto = z.object({ init_data: z.string().min(10), consents: z.array(consentInput).optional(), marketing_consent: z.boolean().optional() }).strict();
export const refreshDto = z.object({ refresh_token: z.string().min(10) }).strict();
export const totpCodeDto = z.object({ code: code6 }).strict();
export const totpVerifyDto = z.object({ mfa_token: z.string().min(10), code: code6 }).strict();
