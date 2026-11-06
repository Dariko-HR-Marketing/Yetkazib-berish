import { Body, Controller, Get, Headers, HttpCode, Param, Post, Put, Req } from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { NoIdempotency, Public, TenantScoped } from "../../common/access";
import { ApiError } from "../../common/errors";
import type { AppRequest } from "../../common/request-context";
import { parse, uuidSchema } from "../../common/validate";
import { PaymentsService } from "../payments/payments.service";
import { CashService } from "./cash.service";
import { PaymentFlowService } from "./payment-flow.service";

const id = (v: string) => { if (!uuidSchema.safeParse(v).success) throw new ApiError(404, "not_found"); return v; };
const settingsDto = z.object({ provider: z.enum(["mock", "payme", "click", "uzum"]), merchant_id: z.string().trim().max(100).nullable().optional(), secret: z.string().min(8).max(200).optional(), enabled: z.boolean() }).strict();
const sandboxDto = z.object({ outcome: z.enum(["captured", "failed"]) }).strict();
const handoverDto = z.object({ courier_user_id: uuidSchema, amount_tiyin: z.number().int().positive().max(100_000_000_000), note: z.string().trim().max(200).optional() }).strict();
const refundDto = z.object({ amount_tiyin: z.number().int().positive().optional(), reason: z.string().trim().min(2).max(60) }).strict();

@Controller("v1")
export class PaymentsController {
  constructor(private readonly payments: PaymentsService, private readonly flow: PaymentFlowService, private readonly cash: CashService) {}

  /** Provayder callback: imzo tekshiriladi, takrorlanish xavfsiz. Autentifikatsiya yo'q (imzo bilan). */
  @Public() @NoIdempotency() @Post("webhooks/:provider/:slug") @HttpCode(200)
  webhook(@Param("provider") provider: string, @Param("slug") slug: string, @Req() req: RawBodyRequest<Request>, @Headers() headers: Record<string, string | string[] | undefined>) {
    return this.flow.webhook(slug, provider, req.rawBody ?? Buffer.alloc(0), headers);
  }

  @Post("shops/:slug/payments/:id/sandbox") @HttpCode(200)
  sandbox(@Param("slug") slug: string, @Param("id") pid: string, @Body() b: unknown, @Req() req: AppRequest) { return this.flow.sandboxPay(slug, req.auth!.userId, id(pid), parse(sandboxDto, b).outcome); }

  @Get("payments/settings") @TenantScoped("integrations_settings:read")
  getSettings(@Req() req: AppRequest) { return this.payments.getSettings(req.tenant!.tenantId, req.auth!.userId); }

  @Put("payments/settings") @TenantScoped("integrations_settings:write")
  setSettings(@Body() b: unknown, @Req() req: AppRequest) { return this.payments.setSettings(req.tenant!.tenantId, req.auth!.userId, parse(settingsDto, b), req.ip); }

  @Get("cash/couriers") @TenantScoped("cash:read")
  cashCouriers(@Req() req: AppRequest) { return this.cash.couriers(req.tenant!.tenantId, req.auth!.userId); }

  @Post("cash/handover") @TenantScoped("cash:write") @HttpCode(200)
  handover(@Body() b: unknown, @Req() req: AppRequest) { const d = parse(handoverDto, b); return this.cash.handover(req.tenant!.tenantId, req.auth!.userId, d.courier_user_id, d.amount_tiyin, d.note, req.ip); }

  @Post("orders/:id/refund") @TenantScoped("finance:write") @HttpCode(200)
  refund(@Param("id") oid: string, @Body() b: unknown, @Req() req: AppRequest) { const d = parse(refundDto, b); return this.flow.refund(req.tenant!.tenantId, req.auth!.userId, id(oid), d.amount_tiyin, d.reason, req.ip); }
}
