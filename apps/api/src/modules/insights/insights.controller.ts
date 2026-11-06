import { Controller, Get, Query, Req } from "@nestjs/common";
import { z } from "zod";
import { TenantScoped } from "../../common/access";
import type { AppRequest } from "../../common/request-context";
import { parse } from "../../common/validate";
import { InsightsService } from "./insights.service";

const auditQ = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().optional(), action: z.string().trim().max(60).optional() });
const custQ = z.object({ limit: z.coerce.number().int().min(1).max(200).default(100) });

@Controller("v1")
export class InsightsController {
  constructor(private readonly s: InsightsService) {}
  @Get("audit") @TenantScoped("finance:read")
  audit(@Query() q: unknown, @Req() req: AppRequest) { return this.s.audit(req.tenant!.tenantId, req.auth!.userId, parse(auditQ, q)); }
  @Get("customers") @TenantScoped("customer360:read")
  customers(@Query() q: unknown, @Req() req: AppRequest) { return this.s.customers(req.tenant!.tenantId, req.auth!.userId, parse(custQ, q).limit); }
}
